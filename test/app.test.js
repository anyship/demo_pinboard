import test from 'node:test'; import assert from 'node:assert/strict'; import worker,{parseCookies,sessionToken} from '../src/worker.js';
test('serves a responsive Google-authenticated app',async()=>{const r=await worker.fetch(new Request('https://x/'),{});const html=await r.text();assert.match(html,/Sign in with Google/);assert.match(html,/viewport/)});
test('creates secure session tokens and parses cookies',()=>{assert.match(sessionToken(),/^[a-f0-9]{64}$/);assert.equal(parseCookies('session=hello%20team').session,'hello team')});
test('has a database-independent health endpoint',async()=>assert.deepEqual(await (await worker.fetch(new Request('https://x/api/health'),{})).json(),{ok:true}));
