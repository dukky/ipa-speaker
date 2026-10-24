import { PiperVoice } from './src/piper.js';

const MODEL = 'models/en_US-lessac-medium.onnx';

const ort = globalThis.ort;
ort.env.wasm.wasmPaths = chrome.runtime.getURL('vendor/');
ort.env.wasm.numThreads = 1; // threads need cross-origin isolation

let voicePromise;
let audioCtx;
let current;

function loadVoice() {
  voicePromise ??= (async () => {
    const [model, config] = await Promise.all([
      fetch(chrome.runtime.getURL(MODEL)).then((r) => r.arrayBuffer()),
      fetch(chrome.runtime.getURL(MODEL + '.json')).then((r) => r.json()),
    ]);
    const session = await ort.InferenceSession.create(model);
    return new PiperVoice(ort, session, config);
  })();
  return voicePromise;
}

async function speak(ipa, rate) {
  const voice = await loadVoice();
  const { samples, dropped } = await voice.synthesize(ipa, { rate });
  if (!samples.length) return { ok: false, error: 'No speakable IPA found', dropped };

  audioCtx ??= new AudioContext();
  const buffer = audioCtx.createBuffer(1, samples.length, voice.sampleRate);
  buffer.copyToChannel(samples, 0);
  current?.stop();
  current = audioCtx.createBufferSource();
  current.buffer = buffer;
  current.connect(audioCtx.destination);
  current.start();
  return { ok: true, dropped };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen' || msg.type !== 'speak') return;
  speak(msg.ipa, msg.rate).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
