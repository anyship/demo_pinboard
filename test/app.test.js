import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  ensureSeedPins,
  parseCookies,
  sessionToken,
} from "../src/worker.js";

test("serves a distinct shell for the pinboard landing page", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  const html = await r.text();
  assert.match(html, /<title>Pinboard<\/title>/);
  assert.match(html, /shared team board for links, notes, and decisions/i);
  assert.match(html, /<style>/);
  assert.match(html, /app\.js/);
  assert.match(html, /style\.css/);
});

test("serves separate JS and CSS assets", async () => {
  const js = await worker.fetch(new Request("https://x/app.js"), {});
  const css = await worker.fetch(new Request("https://x/style.css"), {});
  assert.match(await js.text(), /Static shell \+ browser app over an edge API/);
  assert.match(await css.text(), /Fraunces/);
});

test("authenticated client render path executes without throwing", async () => {
  const js = await (await worker.fetch(new Request("https://x/app.js"), {})).text();
  const root = {
    _html: "",
    set innerHTML(v) {
      this._html = v;
    },
    get innerHTML() {
      return this._html;
    },
  };
  const form = { onsubmit: null };
  const noteInput = { value: "Helpful context" };
  const makeButtons = () =>
    Array.from(root.innerHTML.matchAll(/data-id="([^"]+)"/g), (m) => ({
      dataset: { id: m[1] },
      onclick: null,
    }));
  const document = {
    querySelector(selector) {
      if (selector === "#app") return root;
      if (selector === ".composer" && root.innerHTML.includes('class="composer"')) {
        return form;
      }
      if (selector === "#note-input" && root.innerHTML.includes('id="note-input"')) {
        return noteInput;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-id]") return makeButtons();
      return [];
    },
  };
  const fetchCalls = [];
  const fetch = async (url) => {
    fetchCalls.push(String(url));
    return {
      status: 200,
      ok: true,
      async json() {
        return {
          user: { name: "Alex Rivera", email: "alex@example.com" },
          pins: [
            {
              id: 1,
              title: "Launch brief",
              url: "https://example.com",
              note: "Ship it",
              category: "Launch",
            },
          ],
        };
      },
    };
  };
  const console = { error() {} };
  globalThis.document = document;
  globalThis.fetch = fetch;
  globalThis.console = console;
  globalThis.FormData = class {
    constructor() {
      return new Map([["title", "x"]]);
    }
  };
  new Function(js)();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(root.innerHTML, /Launch brief/);
  assert.ok(fetchCalls.includes("/api/me"));
});

test("seeds starter pins for a new user", async () => {
  const rows = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("COUNT(*)")) {
                return { count: rows.filter((x) => x.user_id === args[0]).length };
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO pins(")) {
                rows.push({
                  user_id: args[0],
                  title: args[1],
                  url: args[2],
                  note: args[3],
                  category: args[4],
                  saves: args[5] ?? 0,
                });
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
  const seeded = await ensureSeedPins(db, "u1");
  assert.equal(seeded, true);
  assert.equal(rows.length, 3);
  assert.match(rows[0].title, /launch brief/i);
  const seededAgain = await ensureSeedPins(db, "u1");
  assert.equal(seededAgain, false);
  assert.equal(rows.length, 3);
});

test("creates secure session tokens and parses cookies", () => {
  assert.match(sessionToken(), /^[a-f0-9]{64}$/);
  assert.equal(parseCookies("session=hello%20team").session, "hello team");
});

test("has a database-independent health endpoint", async () => {
  assert.deepEqual(
    await (await worker.fetch(new Request("https://x/api/health"), {})).json(),
    { ok: true },
  );
});
