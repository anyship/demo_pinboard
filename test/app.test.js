import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker, { parseCookies, sessionToken } from '../src/worker.js';

function extractInlineScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  return match ? match[1] : '';
}

test('serves a responsive Google-authenticated app', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  assert.match(html, /Sign in with Google/);
  assert.match(html, /viewport/);
});

test('inline script in served HTML is syntactically valid JavaScript', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  const script = extractInlineScript(html);
  assert.ok(script.length > 0, 'should have an inline script');

  // This will throw SyntaxError if the JS is invalid
  assert.doesNotThrow(() => {
    new vm.Script(script, { filename: 'inline-page-script.js' });
  }, SyntaxError, 'inline script must be syntactically valid JavaScript');
});

test('login HTML does not use inline onclick with nested single quotes', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  const script = extractInlineScript(html);

  // The login function's innerHTML should not contain onclick attributes
  // that nest single quotes inside single-quoted JS strings
  const hasBrokenOnclick = /innerHTML\s*=\s*'[^']*onclick="[^"]*'[^"]*'[^"]*"[^']*'/.test(script);
  assert.equal(hasBrokenOnclick, false,
    'login HTML must not nest single quotes inside onclick inside a single-quoted JS string');
});

test('login function renders without runtime errors', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  const script = extractInlineScript(html);

  // Create a minimal DOM-like environment and execute the script
  const mockEl = {
    innerHTML: '',
    focus: () => {},
    onsubmit: null,
    addEventListener: () => {},
    querySelector: () => mockEl,
    querySelectorAll: () => [],
    getElementById: () => mockEl,
    dataset: {},
  };
  const context = vm.createContext({
    document: {
      querySelector: () => mockEl,
      querySelectorAll: () => [],
      getElementById: () => mockEl,
    },
    fetch: async () => ({ status: 401, json: async () => ({}) }),
    location: { href: '' },
    FormData: class { entries() { return []; } },
    console,
  });

  // Should execute without throwing (specifically no SyntaxError from bad quotes)
  assert.doesNotThrow(() => {
    vm.runInContext(script, context, { filename: 'inline-page-script.js' });
  }, 'inline script must execute without throwing');
});

test('creates secure session tokens and parses cookies', () => {
  assert.match(sessionToken(), /^[a-f0-9]{64}$/);
  assert.equal(parseCookies('session=hello%20team').session, 'hello team');
});

test('has a database-independent health endpoint', async () => {
  assert.deepEqual(
    await (await worker.fetch(new Request('https://x/api/health'), {})).json(),
    { ok: true }
  );
});
