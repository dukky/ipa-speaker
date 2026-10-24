# IPA Speaker

Chrome extension that adds a 🔊 button next to IPA transcriptions on Wikipedia and
Wiktionary, and speaks them with a [Piper](https://github.com/rhasspy/piper) neural
voice running locally via onnxruntime-web. Piper voices take IPA symbols as input,
so the transcription is fed in directly; `src/ipa.js` normalises web IPA notation
into the voice's symbol set.

## Setup

```sh
npm install
npm run setup   # copies onnxruntime-web into vendor/, downloads the voice (~60 MB) into models/
```

Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → this folder.

## Use

- Click 🔊 next to any IPA on Wikipedia/Wiktionary. Shift+click plays it slowly.
- Select IPA on any page → right-click → **Speak as IPA**.
- Toolbar popup: paste IPA and press Speak.

## Development

```sh
npm test                                     # IPA front-end tests
npm run say -- "/ˈwɪkɪpiːdiə/" out.wav 0.6   # synthesise from the CLI (rate optional)
```
