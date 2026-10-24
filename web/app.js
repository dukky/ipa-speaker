import { PiperVoice } from '../src/piper.js';

// Standalone page version of the extension, for phones and anywhere else the
// extension can't run. Open with ?ipa=... to prefill (used by the iOS Shortcut).

const VOICE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx';
const CACHE = 'ipa-speaker-v1';
const SLOW_RATE = 0.6;

const ort = globalThis.ort;
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
ort.env.wasm.numThreads = 1; // threads need cross-origin isolation

const input = document.getElementById('ipa');
const status = document.getElementById('status');
const buttons = [document.getElementById('play'), document.getElementById('slow')];

let audioCtx;
let current;

// Fetches through the Cache API so the 60 MB voice downloads only once.
async function cachedArrayBuffer(url, onProgress) {
  const cache = await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) return hit.arrayBuffer();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let received = 0;
  for (const reader = res.body.getReader(); ;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }
  const buffer = await new Blob(chunks).arrayBuffer();
  await cache?.put(url, new Response(buffer)).catch(() => {});
  return buffer;
}

// Drop voices cached by earlier versions of the page.
caches.open(CACHE).then(async (cache) => {
  for (const req of await cache.keys()) {
    if (!req.url.startsWith(VOICE_URL)) await cache.delete(req);
  }
}).catch(() => {});

const voicePromise = (async () => {
  status.textContent = 'Loading voice…';
  const [model, config] = await Promise.all([
    cachedArrayBuffer(VOICE_URL, (p) => { status.textContent = `Downloading voice (60 MB, once)… ${Math.round(p * 100)}%`; }),
    cachedArrayBuffer(VOICE_URL + '.json', () => {}).then((b) => JSON.parse(new TextDecoder().decode(b))),
  ]);
  const session = await ort.InferenceSession.create(model);
  status.textContent = input.value.trim() ? 'Ready — tap Play' : 'Ready';
  return new PiperVoice(ort, session, config);
})();
voicePromise.catch((err) => { status.textContent = `Couldn't load voice: ${err.message}`; });

async function speak(rate) {
  // iOS only allows audio that starts from a tap, so create/resume the
  // context synchronously here, before any awaits.
  if (navigator.audioSession) navigator.audioSession.type = 'playback'; // play even with the silent switch on
  audioCtx ??= new AudioContext();
  audioCtx.resume();

  buttons.forEach((b) => { b.disabled = true; });
  try {
    const voice = await voicePromise;
    const { samples, dropped } = await voice.synthesize(input.value, { rate });
    if (!samples.length) {
      status.textContent = 'No speakable IPA found';
      return;
    }
    const buffer = audioCtx.createBuffer(1, samples.length, voice.sampleRate);
    buffer.copyToChannel(samples, 0);
    current?.stop();
    current = audioCtx.createBufferSource();
    current.buffer = buffer;
    current.connect(audioCtx.destination);
    current.start();
    status.textContent = dropped.length ? `Skipped: ${dropped.join(' ')}` : '';
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

buttons[0].addEventListener('click', () => speak(1));
buttons[1].addEventListener('click', () => speak(SLOW_RATE));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    speak(e.shiftKey ? SLOW_RATE : 1);
  }
});
for (const example of document.querySelectorAll('.examples button')) {
  example.addEventListener('click', () => {
    input.value = example.textContent;
    speak(1);
  });
}

input.value = new URLSearchParams(location.search).get('ipa') ?? '';
