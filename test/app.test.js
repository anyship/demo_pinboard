import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import worker, {
  ensureSeedPins,
  parseCookies,
  sessionToken,
} from "../src/worker.js";

// --- Kanban board tests ---

test("unauthenticated GET / includes at least 3 status columns", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  const html = await r.text();
  assert.match(html, /Backlog/);
  assert.match(html, /In play/i);
  assert.match(html, /Done/);
});

test("unauthenticated GET / has seeded notes in more than one column", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  const html = await r.text();
  const columnPattern = /class="kanban-column"/g;
  const columns = html.match(columnPattern);
  assert.ok(columns && columns.length >= 3, "Expected at least 3 kanban columns");

  const notePattern = /class="kanban-card"/g;
  const notes = html.match(notePattern);
  assert.ok(notes && notes.length >= 3, "Expected at least 3 kanban cards");

  const backlogSection = html.split(/data-status="backlog"/)[1]?.split(/data-status="/)[0] || "";
  const inPlaySection = html.split(/data-status="in-play"/)[1]?.split(/data-status="/)[0] || "";
  const doneSection = html.split(/data-status="done"/)[1]?.split(/data-status="/)[0] || "";

  const backlogCards = (backlogSection.match(/class="kanban-card"/g) || []).length;
  const inPlayCards = (inPlaySection.match(/class="kanban-card"/g) || []).length;
  const doneCards = (doneSection.match(/class="kanban-card"/g) || []).length;

  const columnsWithCards = [backlogCards, inPlayCards, doneCards].filter((n) => n > 0).length;
  assert.ok(columnsWithCards >= 2, `Expected cards in at least 2 columns, got cards in ${columnsWithCards}`);
});

test("page JS (/app.js) is syntactically valid", async () => {
  const r = await worker.fetch(new Request("https://x/app.js"), {});
  const js = await r.text();
  assert.doesNotThrow(() => {
    new vm.Script(js, { filename: "app.js" });
  }, "Client JS must be syntactically valid");
});

test("moving a note does not require login for the guest UI", async () => {
  const r = await worker.fetch(new Request("https://x/app.js"), {});
  const js = await r.text();
  assert.match(js, /localStorage/i, "Guest moves should use localStorage");
  assert.match(js, /kanban|status|column/i, "JS should reference kanban/status/columns");
});

test("/login still redirects to Anyship Google auth broker", async () => {
  const env = {
    ANYSHIP_AUTH_URL: "https://auth.anyship.dev",
    ANYSHIP_AUTH_APP_ID: "test-app",
  };
  const r = await worker.fetch(new Request("https://x/login"), env);
  assert.equal(r.status, 302);
  const location = r.headers.get("location");
  assert.ok(location, "Should redirect");
  assert.match(location, /auth\.anyship\.dev\/broker\/authorize/);
  assert.match(location, /provider=google/);
});

test("/api/health still works", async () => {
  const r = await worker.fetch(new Request("https://x/api/health"), {});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test("D1 write routes 401 without a session", async () => {
  const db = {
    prepare() {
      return {
        run: async () => ({ success: true }),
        bind() {
          return this;
        },
        async first() {
          return null;
        },
      };
    },
  };
  const env = { DB: db };

  const postR = await worker.fetch(
    new Request("https://x/api/pins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "spam" }),
    }),
    env,
  );
  assert.equal(postR.status, 401);

  const patchR = await worker.fetch(
    new Request("https://x/api/pins/1", { method: "PATCH" }),
    env,
  );
  assert.equal(patchR.status, 401);
});

test("PATCH /api/pins/:id/status 401 without a session", async () => {
  const db = {
    prepare() {
      return {
        run: async () => ({ success: true }),
        bind() {
          return this;
        },
        async first() {
          return null;
        },
      };
    },
  };
  const env = { DB: db };

  const r = await worker.fetch(
    new Request("https://x/api/pins/1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    }),
    env,
  );
  assert.equal(r.status, 401);
});

// --- Existing tests kept working ---

test("serves a distinct shell for the pinboard landing page", async () => {
  const r = await worker.fetch(new Request("https://x/"), {});
  const html = await r.text();
  assert.match(html, /<title>Pinboard<\/title>/);
  assert.match(html, /<style>/);
  assert.match(html, /app\.js/);
  assert.match(html, /style\.css/);
});

test("serves separate JS and CSS assets", async () => {
  const js = await worker.fetch(new Request("https://x/app.js"), {});
  const css = await worker.fetch(new Request("https://x/style.css"), {});
  assert.ok((await js.text()).length > 100, "JS asset should have content");
  assert.match(await css.text(), /Fraunces/);
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
