// Synthesise IPA to a WAV file from the command line, using the same pipeline
// as the extension:  node scripts/say.mjs "/ˈwɪkɪpiːdiə/" out.wav [rate]
// Set IPA_VOICE to use another voice in models/, e.g. IPA_VOICE=en_GB-alan-medium.
import { readFile, writeFile } from 'node:fs/promises';
import * as ort from 'onnxruntime-node';
import { PiperVoice } from '../src/piper.js';

const [ipa, outPath = 'out.wav', rate = '1'] = process.argv.slice(2);
if (!ipa) {
  console.error('usage: node scripts/say.mjs <ipa> [out.wav] [rate]');
  process.exit(1);
}

const voiceName = process.env.IPA_VOICE ?? 'en_GB-alan-medium';
const model = new URL(`../models/${voiceName}.onnx`, import.meta.url);
const config = JSON.parse(await readFile(new URL(model.href + '.json')));
const session = await ort.InferenceSession.create((await readFile(model)).buffer);
const voice = new PiperVoice(ort, session, config);

const { samples, dropped } = await voice.synthesize(ipa, { rate: Number(rate) });
await writeFile(outPath, toWav(samples, voice.sampleRate));
console.log(`${outPath}: ${(samples.length / voice.sampleRate).toFixed(2)}s` +
  (dropped.length ? `, dropped: ${dropped.join(' ')}` : ''));

function toWav(samples, sampleRate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}
