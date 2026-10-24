// Fetches everything the extension needs that isn't checked in:
// the onnxruntime-web runtime (from node_modules) and the Piper voice.
import { copyFile, mkdir, writeFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const VOICE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx';

await mkdir(new URL('vendor/', root), { recursive: true });
for (const file of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await copyFile(new URL(`node_modules/onnxruntime-web/dist/${file}`, root), new URL(`vendor/${file}`, root));
}

await mkdir(new URL('models/', root), { recursive: true });
for (const url of [VOICE, VOICE + '.json']) {
  const dest = new URL(`models/${url.split('/').pop()}`, root);
  if (await access(dest).then(() => true, () => false)) continue;
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}
console.log('Ready. Load this folder in chrome://extensions (Developer mode → Load unpacked).');
