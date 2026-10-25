// Checks how we expand Wikipedia's partial pronunciations ("/ˈmɔːlvərn, ˈmɒl-/")
// against real articles, and compares the results with the reviewed set in
// test/fixtures/wikipedia-partials.json.
//
//   npm run check:wikipedia             report new and changed expansions
//   npm run check:wikipedia -- --update  after reviewing them, save them all
//
// Articles are found with Wikipedia's search API; only their lead sections
// are fetched, since that's where pronunciations live.
import { readFile, writeFile } from 'node:fs/promises';
import { splitVariants } from '../src/ipa.js';

const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'ipa-speaker-check (https://github.com/dukky/ipa-speaker)';
const FIXTURE = new URL('../test/fixtures/wikipedia-partials.json', import.meta.url);
// {{IPAc-en}} templates ending in a partial ("...|-}}") or with one after a comma.
const SEARCHES = [
  'insource:"IPAc-en" insource:/IPAc-en[^}]*\\|-\\}\\}/',
  'insource:"IPAc-en" insource:/IPAc-en[^}]*\\|,\\|[^}]*\\|-\\|/',
];
const update = process.argv.includes('--update');

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: 2, ...params })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
      .catch((err) => ({ ok: false, status: err.name }));
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`${res.status} from ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function searchTitles() {
  const titles = new Set();
  for (const srsearch of SEARCHES) {
    const { query } = await api({ action: 'query', list: 'search', srsearch, srlimit: 500, srnamespace: 0, srprop: '' });
    query.search.forEach((r) => titles.add(r.title));
  }
  return [...titles];
}

const BLOCKS = new Set(['p', 'li', 'dd', 'td', 'th']);
const VOID = new Set(['br', 'img', 'wbr', 'meta', 'link', 'input', 'hr', 'source']);

// Top-level <span class="IPA"> texts with their lang and enclosing block,
// mirroring what content.js sees in the browser.
function extractTranscriptions(html) {
  const out = [];
  const stack = [];
  let blockCount = 0;
  for (const [, close, tag, attrs, text] of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g)) {
    if (text !== undefined) {
      stack.at(-1)?.text.push(text.replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)));
      continue;
    }
    const name = tag.toLowerCase();
    if (VOID.has(name) || attrs.endsWith('/')) continue;
    if (!close) {
      const cls = /class="([^"]*)"/.exec(attrs)?.[1].split(/\s+/) ?? [];
      const block = BLOCKS.has(name) || cls.includes('reference-text') ? ++blockCount : stack.at(-1)?.block ?? 0;
      stack.push({ name, ipa: cls.includes('IPA'), lang: /lang="([^"]*)"/.exec(attrs)?.[1] ?? '', block, text: [] });
      continue;
    }
    while (stack.length) {
      const el = stack.pop();
      const text = el.text.join('');
      stack.at(-1)?.text.push(text);
      if (el.ipa && !stack.some((e) => e.ipa)) out.push({ ipa: text, lang: el.lang, block: el.block });
      if (el.name === name) break;
    }
  }
  return out;
}

// Same as contextFor in content.js: the other transcriptions in the same
// block, then the rest of the page, nearest earlier one first.
function withContext(transcriptions) {
  return transcriptions.map((t, k) => {
    const others = transcriptions.map((o, i) => ({ ...o, i })).filter((o) => o.i !== k && o.lang === t.lang);
    const byDistance = (list) => [...list.filter((o) => o.i < k).reverse(), ...list.filter((o) => o.i > k)];
    const context = [...byDistance(others.filter((o) => o.block === t.block)), ...byDistance(others.filter((o) => o.block !== t.block))]
      .map((o) => o.ipa).join(', ');
    return { ipa: t.ipa, context };
  });
}

async function harvest(titles) {
  const cases = [];
  let done = 0;
  const queue = [...titles];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let title; (title = queue.shift()); ) {
      const { parse } = await api({ action: 'parse', page: title, prop: 'text', section: 0, redirects: 1 }).catch(() => ({}));
      if (parse) {
        for (const t of withContext(extractTranscriptions(parse.text))) {
          if (t.ipa.includes('-')) cases.push({ title, ...t });
        }
      }
      if (++done % 50 === 0) process.stderr.write(`  ${done}/${titles.length} articles\n`);
    }
  }));
  return cases.sort((a, b) => a.title.localeCompare(b.title) || a.ipa.localeCompare(b.ipa));
}

const expand = (c) => splitVariants(c.ipa, c.context).map((v) => v.normalize('NFC'));
const key = (c) => `${c.title}\t${c.ipa}\t${c.context}`; // the same partial can appear twice on a page

console.error('Searching Wikipedia…');
const titles = await searchTitles();
console.error(`Fetching ${titles.length} articles…`);
const found = await harvest(titles);

const reviewed = new Map(JSON.parse(await readFile(FIXTURE, 'utf8').catch(() => '[]')).map((c) => [key(c), c]));
const changed = [];
const added = [];
for (const c of found) {
  const actual = expand(c);
  const known = reviewed.get(key(c));
  if (!known) added.push({ ...c, actual });
  else if (JSON.stringify(known.expected) !== JSON.stringify(actual) && !known.todo) changed.push({ ...known, actual });
}

const show = (c) => `  ${c.title}: ${c.ipa}${c.context ? `   (context: ${c.context})` : ''}`;
if (changed.length) {
  console.log(`\nChanged from the reviewed result (${changed.length}):`);
  for (const c of changed) console.log(`${show(c)}\n    was: ${c.expected.join(' | ')}\n    now: ${c.actual.join(' | ')}`);
}
if (added.length) {
  console.log(`\nNew, not yet reviewed (${added.length}):`);
  for (const c of added) console.log(`${show(c)}\n    → ${c.actual.join(' | ')}`);
}
console.log(`\n${found.length} partial transcriptions in ${titles.length} articles: ` +
  `${found.length - changed.length - added.length} match the reviewed set, ${changed.length} changed, ${added.length} new.`);

if (update) {
  const next = found.map((c) => {
    const known = reviewed.get(key(c));
    return known?.todo ? known : { title: c.title, ipa: c.ipa, context: c.context, expected: expand(c) };
  });
  await writeFile(FIXTURE, JSON.stringify(next, null, 1) + '\n');
  console.log(`Saved ${next.length} cases to ${FIXTURE.pathname}`);
}
