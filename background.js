// Routes speak requests (content script, popup, context menu) to the offscreen
// document, which owns the model and the audio output. Service workers can't
// play audio, so synthesis and playback both live there.

let creatingOffscreen;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play synthesized IPA pronunciations',
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function speak(ipa, rate = 1) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'speak', ipa, rate });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'background' || msg.type !== 'speak') return;
  speak(msg.ipa, msg.rate).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
  return true; // async response
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'speak-ipa', title: 'Speak as IPA', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'speak-ipa') speak(info.selectionText);
});
