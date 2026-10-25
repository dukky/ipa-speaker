import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ipaToIds } from '../src/ipa.js';

const { phoneme_id_map: idMap } = JSON.parse(
  readFileSync(new URL('../models/en_GB-alan-medium.onnx.json', import.meta.url)));
const phonemes = (ipa, language) => ipaToIds(ipa, idMap, language).phonemes.join('');

test('strips delimiters, syllable dots and optional-sound parens', () => {
  assert.equal(phonemes('/ʃwɔːrtsən(ˌ)ɛɡər/'), 'ʃwɔːrtsənˌɛɡər');
  assert.equal(phonemes('[bɛʁ.liːn]'), 'bɛʁliːn');
});

test('moves stress marks to just before the vowel, like espeak', () => {
  assert.equal(phonemes('/ˌwɪkɪˈpiːdiə/'), 'wˌɪkɪpˈiːdiə');
  assert.equal(phonemes('/ˈɑːnəld/'), 'ˈɑːnəld');
  assert.equal(phonemes('[ˈʃvartsn̩]'), 'ʃvˈartsn̩');
  assert.equal(phonemes('/ˈstrɛŋkθs ˈplʌm/'), 'strˈɛŋkθs plˈʌm');
});

test('British English: r -> ɹ, drops r before consonants, oʊ -> əʊ', () => {
  assert.equal(phonemes('/bɜːrˈlɪn/', 'en-gb-x-rp'), 'bɜːlˈɪn');
  assert.equal(phonemes('/ˈpærɪs/', 'en-gb-x-rp'), 'pˈæɹɪs');
  assert.equal(phonemes('/ˈtoʊkjoʊ/', 'en-gb-x-rp'), 'tˈəʊkjəʊ');
  assert.equal(phonemes('/fɑːr əˈweɪ/', 'en-gb-x-rp'), 'fɑː əwˈeɪ');
});

test('American English keeps every r as ɹ and keeps oʊ', () => {
  assert.equal(phonemes('/bɜːrˈlɪn/', 'en-us'), 'bɜːɹlˈɪn');
  assert.equal(phonemes('/ˈtoʊkjoʊ/', 'en-us'), 'tˈoʊkjoʊ');
});

test('leaves r alone for non-English voices', () => {
  assert.equal(phonemes('[ˈroma]', 'it'), 'rˈoma');
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
