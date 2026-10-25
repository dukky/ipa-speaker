// Real partial pronunciations from Wikipedia, with expansions reviewed by hand.
// Refresh with `npm run check:wikipedia` (see scripts/check-wikipedia.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitVariants } from '../src/ipa.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/wikipedia-partials.json', import.meta.url)));

test(`expands ${cases.length} reviewed Wikipedia partials`, async (t) => {
  for (const c of cases) {
    await t.test(`${c.title}: ${c.ipa}`, { todo: c.todo }, () => {
      const actual = splitVariants(c.ipa, c.context).map((v) => v.normalize('NFC'));
      assert.deepEqual(actual, c.expected);
    });
  }
});
