// Adds a speaker button after each IPA transcription on the page.
// Wikipedia and Wiktionary wrap transcriptions in <span class="IPA">.
//
// Clicks are handled by one document-level listener rather than per button:
// Wikipedia's reference previews copy footnote HTML (buttons included) into a
// popup, and copied elements don't keep their listeners.

const SLOW_RATE = 0.6;
const BUTTON_CLASS = 'ipa-speaker-button';

// Top-level IPA spans, skipping IPA nested inside other IPA.
const transcriptions = (root) =>
  [...root.querySelectorAll('.IPA')].filter((span) => !span.parentElement?.closest('.IPA'));

// Partial forms are often a separate transcription ("/ˈbɔːstən/, /ˈbɒ-/"), so
// pass the others along for the engine to expand against: those in the same
// paragraph first, then the rest of the page, nearest earlier one first.
function contextFor(span) {
  const block = span.closest('p, li, dd, td, th, .reference-text');
  const isBefore = (s) => s.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING;
  const byDistance = (spans) => [...spans.filter(isBefore).reverse(), ...spans.filter((s) => !isBefore(s))];
  const others = transcriptions(document).filter((s) => s !== span && s.lang === span.lang);
  const inBlock = others.filter((s) => block?.contains(s));
  return [...byDistance(inBlock), ...byDistance(others.filter((s) => !inBlock.includes(s)))]
    .map((s) => s.textContent)
    .join(', ');
}

function addButtons(root) {
  for (const span of transcriptions(root)) {
    // Skip anything already handled.
    if (span.nextElementSibling?.classList.contains(BUTTON_CLASS)) continue;
    if (!span.textContent.trim()) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.textContent = '🔊';
    button.title = 'Play pronunciation (Shift+click for slow)';
    button.setAttribute('aria-label', `Play pronunciation of ${span.textContent}`);
    span.after(button);
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest?.(`.${BUTTON_CLASS}`);
  const span = button?.previousElementSibling;
  if (!span?.classList.contains('IPA')) return;

  event.preventDefault();
  event.stopPropagation();
  button.classList.add('ipa-speaker-busy');
  try {
    const res = await chrome.runtime.sendMessage({
      target: 'background',
      type: 'speak',
      ipa: span.textContent,
      context: contextFor(span),
      rate: event.shiftKey ? SLOW_RATE : 1,
    });
    if (!res?.ok) console.warn('IPA Speaker:', res?.error);
    if (res?.dropped?.length) {
      button.title = `Approximated, skipped: ${res.dropped.join(' ')} (Shift+click for slow)`;
    }
  } finally {
    button.classList.remove('ipa-speaker-busy');
  }
}, true);

addButtons(document);

// Catch IPA that appears later, e.g. in page previews of other articles.
let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    addButtons(document);
  });
}).observe(document.body, { childList: true, subtree: true });
