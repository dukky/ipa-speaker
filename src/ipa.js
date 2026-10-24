// IPA front end: turns IPA as written on the web (Wikipedia, Wiktionary, ...)
// into the phoneme IDs a Piper voice expects. Piper's phoneme_id_map is keyed
// by single IPA codepoints, so most of the work is normalising notation.

// Characters that only carry notation, not sound.
const STRUCTURAL = new Set([
  '/', '[', ']', '⟨', '⟩', '(', ')', // transcription delimiters, optional-sound parens
  '.', '‿', // syllable break, linking
  '͡', '͜', // tie bars (t͡ʃ -> tʃ)
  '​', '‌', '‍', // zero-width characters
]);

// Symbols with an equivalent spelling the voice knows.
const SUBSTITUTIONS = {
  g: 'ɡ', // ASCII g -> IPA script g (U+0261)
  "'": 'ˈ', '’': 'ˈ', ',': 'ˌ', ':': 'ː', '˸': 'ː',
  ʧ: 'tʃ', ʤ: 'dʒ', ʦ: 'ts', ʣ: 'dz', ʨ: 'tɕ', ʥ: 'dʑ',
  ɝ: 'ɜ˞', ɩ: 'ɪ', ɷ: 'ʊ', ɼ: 'r',
  ʷ: 'w', ˡ: 'l', ⁿ: 'n', ʱ: 'ʰ', ˀ: 'ʔ',
  '|': ' ', '‖': ' ',
};

/**
 * @param {string} raw IPA text, e.g. "/ˈʃwɔːrtsən(ˌ)ɛɡər/"
 * @param {Record<string, number[]>} idMap a Piper voice's phoneme_id_map
 * @returns {{ ids: number[], phonemes: string[], dropped: string[] }}
 *   dropped lists symbols the voice can't say (they were skipped).
 */
export function ipaToIds(raw, idMap) {
  const phonemes = [];
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

  // Piper framing: BOS, then each phoneme followed by PAD, then EOS.
  const ids = [...idMap['^']];
  for (const p of phonemes) ids.push(...idMap[p], ...idMap['_']);
  ids.push(...idMap['$']);

  return { ids, phonemes, dropped: [...dropped] };
}
