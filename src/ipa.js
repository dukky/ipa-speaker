// IPA front end: turns IPA as written on the web (Wikipedia, Wiktionary, ...)
// into the phoneme IDs a Piper voice expects. Piper's phoneme_id_map is keyed
// by single IPA codepoints, so most of the work is normalising notation.

// Characters that only carry notation, not sound.
const STRUCTURAL = new Set([
  '/', '[', ']', '⟨', '⟩', '(', ')', // transcription delimiters, optional-sound parens
  '.', '‿', '-', // syllable break, linking, leftover partial-form hyphens
  '͡', '͜', // tie bars (t͡ʃ -> tʃ)
  '​', '‌', '‍', // zero-width characters
]);

// Symbols with an equivalent spelling the voice knows.
const SUBSTITUTIONS = {
  g: 'ɡ', // ASCII g -> IPA script g (U+0261)
  "'": 'ˈ', '’': 'ˈ', ':': 'ː', '˸': 'ː',
  ʧ: 'tʃ', ʤ: 'dʒ', ʦ: 'ts', ʣ: 'dz', ʨ: 'tɕ', ʥ: 'dʑ',
  ɝ: 'ɜ˞', ɩ: 'ɪ', ɷ: 'ʊ', ɼ: 'r',
  ʷ: 'w', ˡ: 'l', ⁿ: 'n', ʱ: 'ʰ', ˀ: 'ʔ',
  '|': ' ', '‖': ' ',
};

/**
 * Splits a transcription listing alternatives into separate pronunciations,
 * expanding Wikipedia's partial forms against the first full one:
 *   "/ˈmɔːlvərn, ˈmɒl-/"       -> ["ˈmɔːlvərn", "ˈmɒlvərn"]
 *   "/ˈɡlɑːstənbəri, -bɛri/"   -> ["ˈɡlɑːstənbəri", "ˈɡlɑːstənbɛri"]
 *   "/dʒɪˈbrɔːltər, -ˈbrɒl-/"  -> ["dʒɪˈbrɔːltər", "dʒɪˈbrɒltər"]
 * Partials that don't fit the full form anywhere are left out rather than
 * guessed at.
 * @param {string} raw
 * @param {string} [context] a nearby transcription to expand against when raw
 *   has no full form, e.g. "/ˈbɔːstən/" for Boston's separate "/ˈbɒ-/"
 * @returns {string[]}
 */
export function splitVariants(raw, context = '') {
  const variants = parseVariants(raw);
  const full = [...variants, ...parseVariants(context)].find((v) => !isPartial(v));
  // Without a full form, fragments like "-pərt -" mean nothing on their own.
  if (!full) return variants.slice(0, 1).map((v) => v.replace(/-/g, '').trim());
  return variants
    .map((v) => (isPartial(v) ? expandPartial(v, full)?.text : v))
    .filter(Boolean);
}

function parseVariants(raw) {
  return raw.normalize('NFD')
    .replace(/[/[\]⟨⟩]/g, '')
    .replace(/ˌ(?=[\sˈˌ]|-[^\s,;~-])/g, ',') // editors sometimes type ˌ for the comma: "ˈwɪɡtənˌ -taʊn"
    .split(/[,;~]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

const isPartial = (v) => v.startsWith('-') || v.endsWith('-');

// A partial must match its stretch of the full form at least this well.
const MAX_COST_PER_UNIT = Infinity;

// Marks that modify the sound before them rather than being sounds.
const MODIFIER = /[ːˑʰʲʷˠˤ˞)̀-ͯ]/u;
const DIPHTHONGS = new Set(['eɪ', 'aɪ', 'ɔɪ', 'oʊ', 'aʊ', 'əʊ', 'ɪə', 'ɛə', 'eə', 'ʊə']);
const AFFRICATES = new Set(['tʃ', 'dʒ']);
const VOWEL_GROUPS = ['iɪeɛæyʏøœ', 'əɐɜɞɨʉɘɵᵻʌa', 'uʊoɔɒɑɯɤ']; // front, central, back
const REDUCED = new Set('əɐᵻɨ'); // weak vowels that stand in for most others

/**
 * Splits IPA into units of one sound with its marks, keeping together what
 * Wikipedia treats as one sound: diphthongs (oʊ), affricates (dʒ), and
 * r-coloured vowels (ɜːr) when no vowel follows the r.
 * Each unit records the stress of the syllable it's in.
 */
function units(ipa, { splitFinalR = false } = {}) {
  const chars = [...ipa];
  const out = [];
  let prefix = '';
  chars.forEach((ch, k) => {
    const prev = !prefix && out.at(-1);
    if (STRESS.has(ch) || ch === '(' || ch === '.') {
      prefix += ch;
    } else if (prev && MODIFIER.test(ch)) {
      prev.text += ch;
    } else if (prev && (DIPHTHONGS.has(prev.key + ch) || AFFRICATES.has(prev.key + ch) || rColoured(chars, k, prev, splitFinalR))) {
      prev.text += ch;
      prev.key += ch;
    } else {
      out.push({ key: ch, vowel: VOWELS.has(ch), stress: [...prefix].find((c) => STRESS.has(c)) ?? '', text: prefix + ch });
      prefix = '';
    }
    // A nasal vowel (æ̃) stands for vowel + n: add a silent n to align with.
    if (ch === '\u0303' && out.at(-1)?.vowel) out.push({ key: 'n', vowel: false, stress: '', text: '', silent: true });
  });
  let syllable = '';
  for (const u of out) {
    if (u.stress) syllable = u.stress;
    u.syllable = syllable;
    if (u.vowel || u.key === ' ') syllable = '';
  }
  return out; // a trailing stress mark ("kɑːlˈ-") is dropped; the full form has its own
}

function rColoured(chars, k, prev, splitFinalR) {
  if (chars[k] !== 'r' || !prev.vowel) return false;
  const next = chars.slice(k + 1).find((c) => !MODIFIER.test(c) && !STRESS.has(c) && c !== '.');
  return next ? !VOWELS.has(next) : !splitFinalR;
}

const vowelGroup = (u) => VOWEL_GROUPS.findIndex((g) => g.includes(u.key[0]));
const similarVowels = (a, b) => vowelGroup(a) === vowelGroup(b) || REDUCED.has(a.key[0]) || REDUCED.has(b.key[0]);

function substitutionCost(a, b) {
  const stress = a.syllable === b.syllable ? 0 : 0.15;
  if (a.key === b.key) return stress;
  if (a.key === ' ' || b.key === ' ') return 3; // don't align across words
  if (a.vowel && b.vowel) return stress + (similarVowels(a, b) ? 0.3 : 0.6);
  return stress + (a.vowel || b.vowel ? 1.5 : 0.8);
}

const indelCost = (u) => (u.key === ' ' ? 3 : u.silent || u.text.includes('(') ? 0.2 : 1);

function alignmentCost(a, b) {
  let prev = [0];
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + indelCost(b[j - 1]);
  for (let i = 1; i <= a.length; i++) {
    const row = [prev[0] + indelCost(a[i - 1])];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j - 1] + substitutionCost(a[i - 1], b[j - 1]),
        prev[j] + indelCost(a[i - 1]),
        row[j - 1] + indelCost(b[j - 1]),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Replaces the stretch of `full` that best matches the partial. "ˈmɒl-"
 * replaces a stretch at the start, "-bɛri" one at the end, "-ˈbrɒl-" one
 * anywhere. Returns undefined when nothing matches well enough.
 * @returns {{ text: string, cost: number } | undefined}
 */
export function expandPartial(variant, full) {
  const atStart = !variant.startsWith('-');
  const atEnd = !variant.endsWith('-');
  const core = variant.replace(/^-|-$/g, '');
  const whole = units(full);

  // Hints from how the partial is written:
  const stressNext = /[ˈˌ]\s*$/.test(core); // "məˈ-": a stressed syllable follows
  const wordEnd = /\s$/.test(core); //         "ˌtɑːʒ -": the partial is whole words
  const wordStart = /^\s/.test(core); //       "- ˈbæreɪ"
  const fits = (i, j) =>
    (!stressNext || whole[j]?.stress) &&
    (!wordEnd || j === whole.length || whole[j].key === ' ') &&
    (!wordStart || i === 0 || whole[i - 1].key === ' ');
  // Stress only counts as a change if the partial marks any.
  const marksStress = /[ˈˌ]/.test(core.replace(/[ˈˌ]\s*$/, ''));
  const sound = (u) => (marksStress ? u.text : u.text.replace(/[ˈˌ]/g, ''));

  // A final r may end a vowel (ɜːr) or start the next syllable: try both.
  const readings = [false, true].map((splitFinalR) => units(core.trim(), { splitFinalR }));
  if (!readings[0].length) return undefined;

  // "ˈmɒl-" replaces the start of a word and "-bɛri" the end of one; usually the
  // first or last word, but in names like "ˈdeɪəs ɛks ˈmækɪnə, ˈmɑːk-" any word.
  const wordStarts = [0, ...whole.flatMap((u, k) => (u.key === ' ' ? [k + 1] : []))];
  const wordEnds = [...wordStarts.slice(1).map((k) => k - 1), whole.length];
  const starts = atStart ? wordStarts : whole.map((_, k) => k).concat(whole.length);
  const ends = atEnd ? wordEnds : null;

  const candidates = [];
  let repeatsFull = false;
  for (const part of readings) {
    for (const i of starts) {
      for (const j of ends ?? whole.map((_, k) => k + 1).concat(i).filter((k) => k >= i)) {
        if (j < i) continue;
        const stretch = whole.slice(i, j);
        if (stretch.length === part.length && part.every((u, k) => sound(u) === sound(stretch[k]))) {
          repeatsFull = true; // a partial always changes something
          continue;
        }
        let cost = alignmentCost(part, stretch);
        // Partials are written to line up with the full form at their open edges.
        if (!atStart) cost += edgeCost(part[0], whole[i]);
        if (!atEnd) cost += edgeCost(part.at(-1), whole[j - 1]);
        // Prefer the first word for "X-" and the last for "-X".
        if (atStart && i > 0) cost += 0.2;
        if (atEnd && j < whole.length) cost += 0.2;
        candidates.push({ part, i, j, cost, lengthDiff: Math.abs(j - i - part.length), fits: fits(i, j) });
      }
    }
  }
  const pool = candidates.some((c) => c.fits) ? candidates.filter((c) => c.fits) : candidates;
  const best = pool.reduce((a, b) => (b.cost < a.cost || (b.cost === a.cost && b.lengthDiff < a.lengthDiff) ? b : a), pool[0]);
  // Some partials just restate part of the full form ("ˈdɒpəlɡæŋər, -ɡæŋ-").
  if (repeatsFull && (!best || best.cost > 0.6)) return { text: full, cost: 0 };
  if (!best || best.cost > MAX_COST_PER_UNIT * best.part.length) return undefined;

  const before = whole.slice(0, best.i).map((u) => u.text);
  const after = whole.slice(best.j).map((u) => u.text);
  const middle = best.part.map((u) => u.text);
  if (!marksStress && whole[best.i]?.stress) {
    middle[0] = whole[best.i].stress + middle[0]; // keep the full form's stress
  } else if (best.part.some((u) => u.stress === 'ˈ')) {
    // The partial moves the main stress: demote the old one in the same word.
    for (const side of [before.reverse(), after]) {
      for (let k = 0; k < side.length && side[k] !== ' '; k++) side[k] = side[k].replace('ˈ', 'ˌ');
    }
    before.reverse();
  }
  return { text: [...before, ...middle, ...after].join(''), cost: best.cost };
}

function edgeCost(a, b) {
  if (a.key === b?.key) return 0;
  if (a.vowel && b?.vowel) return similarVowels(a, b) ? 0.1 : 0.3;
  return a.vowel === b?.vowel ? 0.5 : 1;
}

/**
 * @param {string} raw IPA text for a single pronunciation, e.g. "/ˈʃwɔːrtsən(ˌ)ɛɡər/"
 * @param {Record<string, number[]>} idMap a Piper voice's phoneme_id_map
 * @param {string} [language] the voice's espeak language (config.espeak.voice),
 *   which enables accent-specific rules, e.g. "en-gb-x-rp"
 * @returns {{ ids: number[], phonemes: string[], dropped: string[] }}
 *   dropped lists symbols the voice can't say (they were skipped).
 */
export function ipaToIds(raw, idMap, language = '') {
  let phonemes = [];
  const dropped = new Set();

  for (const ch of raw.normalize('NFD').toLowerCase()) {
    if (STRUCTURAL.has(ch)) continue;
    const replacement = SUBSTITUTIONS[ch] ?? ch;
    for (const p of replacement) {
      if (/\s/.test(p)) {
        if (phonemes.length && phonemes.at(-1) !== ' ') phonemes.push(' ');
      } else if (idMap[p]) {
        phonemes.push(p);
      } else {
        dropped.add(p);
      }
    }
  }
  if (phonemes.at(-1) === ' ') phonemes.pop();

  // Piper voices were trained on espeak-ng's IPA, so match its conventions.
  if (language.startsWith('en')) phonemes = englishToEspeak(phonemes, language, idMap);
  phonemes = stressBeforeNucleus(phonemes);

  // Piper framing: BOS, then each phoneme followed by PAD, then EOS.
  const ids = [...idMap['^']];
  for (const p of phonemes) ids.push(...idMap[p], ...idMap['_']);
  ids.push(...idMap['$']);

  return { ids, phonemes, dropped: [...dropped] };
}

const VOWELS = new Set('aeiouyæɐɑɒɔəɘɚɛɜɞɤɨɪɯɵɶʉʊʌʏøœᵻ');
const STRESS = new Set(['ˈ', 'ˌ']);
const SYLLABIC = '̩'; // n̩: a consonant acting as the syllable's vowel
const RHOTIC_ENGLISH = new Set(['en-us', 'en-gb-scotland']);

const isNucleus = (phonemes, i) => VOWELS.has(phonemes[i]) || phonemes[i + 1] === SYLLABIC;

// Wikipedia puts stress marks at the start of the syllable (ˈpærɪs);
// espeak puts them right before its vowel (pˈærɪs).
// A mark with no vowel after it in the same word stays where it is.
function stressBeforeNucleus(phonemes) {
  const out = [...phonemes];
  for (let i = 0; i < out.length; i++) {
    if (!STRESS.has(out[i])) continue;
    let j = i + 1;
    while (j < out.length && out[j] !== ' ' && !STRESS.has(out[j]) && !isNucleus(out, j)) j++;
    if (j > i + 1 && j < out.length && isNucleus(out, j)) {
      out.splice(j - 1, 0, ...out.splice(i, 1));
      i = j - 1;
    }
  }
  return out;
}

// Wikipedia's English IPA is accent-neutral: it writes every r and uses /oʊ/.
// espeak writes English r as ɹ, and British accents drop r unless a vowel
// follows (bɜːrˈlɪn -> bɜːˈlɪn) and say /əʊ/.
function englishToEspeak(phonemes, language, idMap) {
  const rhotic = RHOTIC_ENGLISH.has(language);
  const out = [];
  phonemes.forEach((p, i) => {
    if (p === 'r' && idMap['ɹ']) {
      let next = i + 1;
      while (STRESS.has(phonemes[next])) next++;
      if (!rhotic && !isNucleus(phonemes, next)) return;
      p = 'ɹ';
    } else if (!rhotic && p === 'o' && phonemes[i + 1] === 'ʊ') {
      p = 'ə';
    }
    out.push(p);
  });
  return out;
}
