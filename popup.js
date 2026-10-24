const input = document.getElementById('ipa');
const status = document.getElementById('status');

async function speak(rate) {
  status.textContent = 'Speaking…';
  const res = await chrome.runtime.sendMessage({ target: 'background', type: 'speak', ipa: input.value, rate });
  if (!res?.ok) status.textContent = res?.error ?? 'Something went wrong';
  else status.textContent = res.dropped.length ? `Skipped: ${res.dropped.join(' ')}` : '';
}

document.getElementById('speak').addEventListener('click', () => speak(1));
document.getElementById('slow').addEventListener('click', () => speak(0.6));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    speak(e.shiftKey ? 0.6 : 1);
  }
});
