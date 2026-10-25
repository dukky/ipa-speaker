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

const SOUNDLESS = /[ˈˌːˑ̀-ͯ]/u; // stress, length and combining marks

/**
 * Splits a transcription listing alternatives into separate pronunciations,
 * expanding Wikipedia's partial forms against the first full one:
 *   "/ˈmɔːlvərn, ˈmɒl-/"      -> ["ˈmɔːlvərn", "ˈmɒlvərn"]
 *   "/ˈɡlɑːstənbəri, -bɛri/"  -> ["ˈɡlɑːstənbəri", "ˈɡlɑːstənbɛri"]
 * @param {string} raw
 * @returns {string[]}
 */
export function splitVariants(raw) {
  const variants = raw.normalize('NFD').replace(/[/[\]⟨⟩]/g, '')
    .split(/[,;~]/).map((v) => v.trim()).filter(Boolean);
  const full = variants.find((v) => !v.startsWith('-') && !v.endsWith('-'));
  if (!full) return variants;
  return variants.map((v) => expandPartial(v, full));
}

// "ˈmɒl-" replaces the start of the full form up to its matching "l";
// "-bɛri" replaces the end of the full form from its last "b".
function expandPartial(variant, full) {
  const leading = variant.endsWith('-');
  const trailing = variant.startsWith('-');
  if (leading === trailing) return variant; // full form, or "-x-" which we can't place
  const part = variant.replace(/-/g, '');
  const sounds = [...part].filter((c) => !SOUNDLESS.test(c));
  if (leading) {
    const i = full.indexOf(sounds.at(-1));
    return i < 0 ? part : part + full.slice(i + 1);
  }
  const i = full.lastIndexOf(sounds[0]);
  if (i < 0) return part;
  const prefix = full.slice(0, i);
  // Use the partial's own stress mark rather than the full form's.
  return (/^[ˈˌ]/.test(part) ? prefix.replace(/[ˈˌ]$/, '') : prefix) + part;
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
