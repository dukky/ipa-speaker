import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ipaToIds } from '../src/ipa.js';

const { phoneme_id_map: idMap } = JSON.parse(
  readFileSync(new URL('../models/en_GB-alan-medium.onnx.json', import.meta.url)));
const phonemes = (ipa) => ipaToIds(ipa, idMap).phonemes.join('');

test('strips delimiters, syllable dots and optional-sound parens', () => {
  assert.equal(phonemes('/ˈʃwɔːrtsən(ˌ)ɛɡər/'), 'ˈʃwɔːrtsənˌɛɡər');
  assert.equal(phonemes('[ˈbɛʁ.liːn]'), 'ˈbɛʁliːn');
});

test('normalises lookalikes and ligatures', () => {
  assert.equal(phonemes("'gʧ"), 'ˈɡtʃ');
  assert.equal(phonemes('t͡ʃ'), 'tʃ');
  assert.equal(phonemes('bɝd'), 'bɜ˞d');
});

test('keeps supported diacritics and drops unsupported ones', () => {
  const { phonemes: p, dropped } = ipaToIds('ɑ̃n̥', idMap);
  assert.deepEqual(p, ['ɑ', '̃', 'n']);
  assert.deepEqual(dropped, ['̥']);
});

test('collapses whitespace and frames with BOS/PAD/EOS', () => {
  const { ids, phonemes: p } = ipaToIds('  a   b ', idMap);
  assert.deepEqual(p, ['a', ' ', 'b']);
  const [bos, pad, eos, a, sp, b] = ['^', '_', '$', 'a', ' ', 'b'].map((k) => idMap[k][0]);
  assert.deepEqual(ids, [bos, a, pad, sp, pad, b, pad, eos]);
});
