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

## On a phone

`web/` is a standalone page with the same engine, published at
<https://dukky.github.io/ipa-speaker/web/>. It downloads the voice from Hugging Face
once and caches it. Open it with `?ipa=/ˈpærɪs/` to prefill; the page has steps for
an iOS Shortcut that sends selected IPA there from the share sheet.

## Development

```sh
npm test                                     # IPA front-end tests, incl. reviewed Wikipedia cases
npm run say -- "/ˈwɪkɪpiːdiə/" out.wav 0.6   # synthesise from the CLI (rate optional)
IPA_VOICE=en_GB-cori-medium npm run say -- "/ˈpærɪs/"   # try another voice in models/
```

### How the IPA is prepared

Piper voices are trained on [espeak-ng](https://github.com/espeak-ng/espeak-ng)'s
IPA, which writes some things differently from Wikipedia (stress marks before the
vowel, `ɹ` for English r, no r in British accents where it isn't pronounced).
`src/ipa.js` rewrites Wikipedia-style IPA to match. To see how espeak-ng itself
transcribes a word, for comparison (optional, macOS):

```sh
brew install espeak-ng
espeak-ng -q --ipa -v en-gb-x-rp "Glastonbury"
```

Wikipedia also lists alternative pronunciations with partial forms, e.g.
`/ˈmɔːlvərn, ˈmɒl-/`. `splitVariants` expands these by aligning the partial
against the full form. `npm run check:wikipedia` collects every partial it can
find on Wikipedia (around 500 articles, takes a few minutes), and reports any
expansion that's new or differs from the reviewed set in
`test/fixtures/wikipedia-partials.json`. After reviewing the report, save it
with `npm run check:wikipedia -- --update`.

## License

Code: [Apache-2.0](LICENSE). The Piper voice downloaded by `npm run setup` has its own license; see its [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_GB/alan/medium/MODEL_CARD).
