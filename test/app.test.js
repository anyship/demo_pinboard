import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  ensureSeedPins,
  parseCookies,
  sessionToken,
  STATUSES,
  STATUS_LABELS,
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

test("GET / HTML includes all six column labels", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  const html = await r.text();
  for (const label of Object.values(STATUS_LABELS)) {
    assert.match(html, new RegExp(label), `Missing column label: ${label}`);
  }
});

test("GET / HTML includes draggable='true' on seeded cards", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  const html = await r.text();
  assert.match(html, /draggable="true"/, "Cards must have draggable attribute");
  const count = (html.match(/draggable="true"/g) || []).length;
  assert.ok(count >= 3, `Expected at least 3 draggable cards, got ${count}`);
});

test("seeded notes appear in more than one column", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  const html = await r.text();
  const columnsWithCards = STATUSES.filter((status) => {
    const colRegex = new RegExp(
      `data-status="${status}"[\\s\\S]*?draggable="true"`,
    );
    return colRegex.test(html);
  });
  assert.ok(
    columnsWithCards.length > 1,
    `Seeded cards should span multiple columns, found in: ${columnsWithCards.join(", ")}`,
  );
});

test("serves separate JS and CSS assets", async () => {
  const js = await worker.fetch(new Request("https://x/app.js"), {});
  const css = await worker.fetch(new Request("https://x/style.css"), {});
  assert.match(await js.text(), /Pinboard/);
  assert.match(await css.text(), /Fraunces/);
});

test("/app.js is syntactically valid", async () => {
  const js = await (
    await worker.fetch(new Request("https://x/app.js"), {})
  ).text();
  assert.doesNotThrow(() => new Function(js), "app.js must parse without syntax errors");
});

test("/app.js includes dragstart and drop event handling", async () => {
  const js = await (
    await worker.fetch(new Request("https://x/app.js"), {})
  ).text();
  assert.match(js, /dragstart/, "app.js must handle dragstart");
  assert.match(js, /drop/, "app.js must handle drop");
  assert.match(js, /dragover/, "app.js must handle dragover");
  assert.match(js, /dataTransfer/, "app.js must use dataTransfer");
});

test("/app.js includes localStorage guest moves without login", async () => {
  const js = await (
    await worker.fetch(new Request("https://x/app.js"), {})
  ).text();
  assert.match(js, /localStorage/, "app.js must use localStorage for guest moves");
});

test("PATCH /api/pins/:id/status returns 401 without session", async () => {
  const db = mockDb([]);
  const r = await worker.fetch(
    new Request("https://x/api/pins/1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    }),
    { DB: db },
  );
  assert.equal(r.status, 401);
});

test("PATCH /api/pins/:id/status returns 400 for invalid status", async () => {
  const db = mockDb([], { withSession: true });
  const r = await worker.fetch(
    new Request("https://x/api/pins/1/status", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: "session=validtoken",
      },
      body: JSON.stringify({ status: "invalid-status" }),
    }),
    { DB: db },
  );
  assert.equal(r.status, 400);
});

test("/login redirects to Anyship Google auth", async () => {
  const r = await worker.fetch(new Request("https://x/login"), {
    ANYSHIP_AUTH_URL: "https://auth.anyship.dev",
    ANYSHIP_AUTH_APP_ID: "test-app",
  });
  assert.equal(r.status, 302);
  const location = r.headers.get("location");
  assert.match(location, /auth\.anyship\.dev/);
  assert.match(location, /provider=google/);
});

test("no login wall on GET /", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.doesNotMatch(
    html,
    /you must sign in|login required|please log in/i,
    "GET / must not gate content behind login",
  );
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
  assert.ok(rows.length >= 3, "Should seed at least 3 pins");
  assert.match(rows[0].title, /launch brief/i);
  const seededAgain = await ensureSeedPins(db, "u1");
  assert.equal(seededAgain, false);
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

test("STATUSES array has exactly 6 entries in correct order", () => {
  assert.deepEqual(STATUSES, [
    "backlog",
    "ready",
    "in-play",
    "review",
    "blocked",
    "done",
  ]);
});

function mockDb(rows, options = {}) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("COUNT(*)")) {
                return { count: rows.length };
              }
              if (sql.includes("sessions")) {
                if (options.withSession) {
                  return {
                    token: "validtoken",
                    user_id: "u1",
                    name: "Test",
                    email: "test@example.com",
                  };
                }
                return null;
              }
              return null;
            },
            async run() {
              return { success: true };
            },
            async all() {
              return { results: rows };
            },
          };
        },
        async run() {
          return { success: true };
        },
      };
    },
  };
}
