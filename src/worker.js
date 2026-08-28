const APP = {
  name: "Pinboard",
  hero: "The shared wall for links, notes, and decisions worth keeping.",
  copy:
    "Collect the product briefs, launch links, customer notes, and design inspiration your team always ends up searching for later.",
  kicker: "TEAM MEMORY",
  section: "Pinned items",
};

export const STATUSES = ["backlog", "ready", "in-play", "review", "blocked", "done"];

export const STATUS_LABELS = {
  backlog: "Backlog",
  ready: "Ready",
  "in-play": "In play",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const SEEDED_PINS = [
  {
    title: "Launch brief for the September release",
    url: "https://example.com/launch-brief",
    note: "The one-pager with timeline, owners, and cutover notes for the release review.",
    category: "Launch",
    status: "in-play",
    saves: 8,
  },
  {
    title: "Customer interview highlights",
    url: "https://example.com/customer-notes",
    note: "Useful quotes to reuse in onboarding, homepage messaging, and the sales deck.",
    category: "Research",
    status: "review",
    saves: 5,
  },
  {
    title: "Design inspiration board",
    url: "https://example.com/design-board",
    note: "A shared visual reference for the refreshed dashboard treatment and motion direction.",
    category: "Design",
    status: "backlog",
    saves: 3,
  },
  {
    title: "API deprecation timeline",
    url: "https://example.com/api-deprecation",
    note: "Track which endpoints sunset in Q4 and what clients need migration.",
    category: "Engineering",
    status: "ready",
    saves: 4,
  },
  {
    title: "Onboarding flow feedback",
    url: "https://example.com/onboarding-feedback",
    note: "Consolidated notes from the last three user tests on the new signup wizard.",
    category: "Product",
    status: "blocked",
    saves: 6,
  },
  {
    title: "Shipped: dashboard redesign",
    url: "https://example.com/dashboard-v2",
    note: "The new dashboard went live. Metrics show 20% engagement lift in the first week.",
    category: "Launch",
    status: "done",
    saves: 12,
  },
];

export const parseCookies = (value = "") =>
  Object.fromEntries(
    String(value || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );

export const sessionToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

async function init(db) {
  for (const query of [
    "CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,name TEXT,email TEXT)",
    "CREATE TABLE IF NOT EXISTS pins(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,title TEXT,url TEXT,note TEXT,category TEXT,status TEXT DEFAULT 'backlog',saves INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  ]) {
    await db.prepare(query).run();
  }
}

export async function ensureSeedPins(db, userId) {
  const existing = await db
    .prepare("SELECT COUNT(*) AS count FROM pins WHERE user_id=?")
    .bind(userId)
    .first();
  if (Number(existing?.count || 0) > 0) return false;
  for (const pin of SEEDED_PINS) {
    await db
      .prepare("INSERT INTO pins(user_id,title,url,note,category,status,saves) VALUES(?,?,?,?,?,?,?)")
      .bind(userId, pin.title, pin.url, pin.note, pin.category, pin.status, pin.saves)
      .run();
  }
  return true;
}

async function verify(token, env) {
  try {
    const [header, payload, signature] = token.split(".");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.ANYSHIP_AUTH_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const decodeBase64Url = (part) =>
      Uint8Array.from(
        atob(part.replace(/-/g, "+").replace(/_/g, "/")),
        (char) => char.charCodeAt(0),
      );
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    if (!isValid) return null;
    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    );
    return claims.exp > Date.now() / 1000 ? claims : null;
  } catch {
    return null;
  }
}

const esc = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function renderCard(pin, index) {
  return `<article class="card" draggable="true" data-pin-id="${pin.id || index}" data-status="${esc(pin.status)}"><div class="card-head"><h3>${esc(pin.title)}</h3>${pin.url ? `<a href="${esc(pin.url)}" target="_blank" rel="noreferrer">${esc(pin.url)}</a>` : ""}</div><p>${esc(pin.note)}</p><div class="card-meta"><span class="chip">${esc(pin.category)}</span><span class="saves">▲ ${pin.saves || 0}</span></div><div class="card-actions">${STATUSES.filter((s) => s !== pin.status).map((s) => `<button class="move-btn" data-target="${s}">${STATUS_LABELS[s]}</button>`).join("")}</div></article>`;
}

function renderBoard(pins) {
  return STATUSES.map(
    (status) =>
      `<section class="column" data-status="${status}"><h2 class="column-title">${STATUS_LABELS[status]}</h2><div class="column-cards" data-status="${status}">${pins.filter((p) => p.status === status).map((p, i) => renderCard(p, i)).join("")}</div></section>`,
  ).join("");
}

function guestMarkup() {
  const pins = SEEDED_PINS.map((p, i) => ({ ...p, id: `seed-${i}` }));
  return `<div class="shell"><div class="frame"><header class="mast"><div class="brand"><div class="badge">↗</div><div><b>Pinboard</b><small>Shared team board for links, notes, and decisions</small></div></div><a href="/login" class="ghost">Sign in</a></header><div class="board">${renderBoard(pins)}</div></div></div>`;
}

function page() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="Pinboard is a shared team board for links, notes, and decisions.">
    <title>${APP.name}</title>
    <style>${CSS}</style>
  </head>
  <body>
    <div id="app">${guestMarkup()}</div>
    <script>${CLIENT}</script>
  </body>
</html>`;
}

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
:root{--paper:#f6f1e8;--ink:#18212b;--muted:#5f6b78;--line:#e5d7bf;--card:#fffdf8;--shadow:0 28px 60px rgba(24,33,43,.11)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#fff7df 0,#f6f1e8 38%,#efe9dd 100%);color:var(--ink);font:15px 'IBM Plex Sans',sans-serif}a{color:inherit}.shell{min-height:100vh;padding:28px}.frame{max-width:1400px;margin:0 auto}.mast{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.brand{display:flex;align-items:center;gap:12px}.badge{width:42px;height:42px;border-radius:14px;background:#18212b;color:#fff;display:grid;place-items:center;font-weight:700;box-shadow:var(--shadow)}.brand b{display:block}.brand small,.muted{color:var(--muted)}.button,.ghost{appearance:none;border:0;border-radius:14px;padding:14px 18px;font:600 15px 'IBM Plex Sans',sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.button{background:#18212b;color:#fff}.ghost{background:#fff;border:1px solid var(--line)}
.board{display:flex;gap:16px;overflow-x:auto;padding-bottom:16px;align-items:stretch}
.column{flex:1 0 210px;min-width:210px;background:rgba(255,253,248,.7);border:1px solid var(--line);border-radius:18px;padding:14px;min-height:300px}
.column-title{font:700 16px/1.2 'Fraunces',serif;margin:0 0 12px;padding:0 4px;letter-spacing:-.02em}
.column-cards{min-height:60px;display:flex;flex-direction:column;gap:10px}
.column-cards.drag-over{background:rgba(229,215,191,.3);border-radius:12px}
.card{padding:14px;background:var(--card);border:1px solid var(--line);border-radius:16px;cursor:grab;user-select:none;transition:box-shadow .15s,transform .15s}
.card:active{cursor:grabbing}
.card.dragging{opacity:.5;transform:rotate(2deg)}
.card-head h3{margin:0 0 4px;font-size:15px;line-height:1.3}
.card-head a{color:#2d5bd1;text-decoration:none;font-size:13px;word-break:break-all}
.card p{margin:6px 0;color:#4c5967;font-size:13px;line-height:1.5}
.card-meta{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted)}
.card-meta .chip{padding:4px 8px;border-radius:999px;background:#fff0ea;color:#a1452d;font-weight:600;font-size:11px;letter-spacing:.04em}
.card-meta .saves{font-weight:600}
.card-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.move-btn{appearance:none;border:1px solid var(--line);background:#fff;border-radius:8px;padding:3px 7px;font-size:11px;cursor:pointer;color:var(--muted)}
.move-btn:hover{background:var(--paper);color:var(--ink)}
@media(max-width:900px){.board{grid-template-columns:1fr}.mast{flex-direction:column;align-items:flex-start}}`;

const CLIENT = `const STATUSES=${JSON.stringify(STATUSES)};
const STATUS_LABELS=${JSON.stringify(STATUS_LABELS)};
const root=document.querySelector('#app');
const esc=(v)=>String(v||'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function getGuestMoves(){
  try{return JSON.parse(localStorage.getItem('pinboard_moves')||'{}');}catch(e){return {};}
}
function saveGuestMove(pinId,newStatus){
  const moves=getGuestMoves();
  moves[pinId]=newStatus;
  localStorage.setItem('pinboard_moves',JSON.stringify(moves));
}

function applyGuestMoves(pins){
  const moves=getGuestMoves();
  return pins.map(p=>{
    const override=moves[p.id];
    return override&&STATUSES.includes(override)?{...p,status:override}:p;
  });
}

function renderCard(pin){
  return '<article class="card" draggable="true" data-pin-id="'+esc(pin.id)+'" data-status="'+esc(pin.status)+'"><div class="card-head"><h3>'+esc(pin.title)+'</h3>'+(pin.url?'<a href="'+esc(pin.url)+'" target="_blank" rel="noreferrer">'+esc(pin.url)+'</a>':'')+'</div><p>'+esc(pin.note)+'</p><div class="card-meta"><span class="chip">'+esc(pin.category)+'</span><span class="saves">▲ '+(pin.saves||0)+'</span></div><div class="card-actions">'+STATUSES.filter(s=>s!==pin.status).map(s=>'<button class="move-btn" data-target="'+s+'">'+STATUS_LABELS[s]+'</button>').join('')+'</div></article>';
}

function renderBoard(pins){
  return '<div class="shell"><div class="frame"><header class="mast"><div class="brand"><div class="badge">↗</div><div><b>Pinboard</b><small>Shared team board for links, notes, and decisions</small></div></div><a href="/login" class="ghost">Sign in</a></header><div class="board">'+STATUSES.map(status=>'<section class="column" data-status="'+status+'"><h2 class="column-title">'+STATUS_LABELS[status]+'</h2><div class="column-cards" data-status="'+status+'">'+pins.filter(p=>p.status===status).map(p=>renderCard(p)).join('')+'</div></section>').join('')+'</div></div></div>';
}

function moveCard(pinId,newStatus,isAuthenticated){
  saveGuestMove(pinId,newStatus);
  if(isAuthenticated){
    fetch('/api/pins/'+pinId+'/status',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:newStatus})}).catch(()=>{});
  }
  refreshBoard();
}

let currentPins=[];
let isAuthenticated=false;

function refreshBoard(){
  const pins=applyGuestMoves(currentPins);
  root.innerHTML=renderBoard(pins);
  bindDragListeners();
  bindMoveButtons();
}

function bindDragListeners(){
  document.querySelectorAll('.card[draggable="true"]').forEach(card=>{
    card.addEventListener('dragstart',function(e){
      e.dataTransfer.setData('text/plain',this.dataset.pinId);
      e.dataTransfer.effectAllowed='move';
      this.classList.add('dragging');
    });
    card.addEventListener('dragend',function(){
      this.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
    });
  });
  document.querySelectorAll('.column-cards').forEach(col=>{
    col.addEventListener('dragover',function(e){
      e.preventDefault();
      e.dataTransfer.dropEffect='move';
      this.classList.add('drag-over');
    });
    col.addEventListener('dragleave',function(){
      this.classList.remove('drag-over');
    });
    col.addEventListener('drop',function(e){
      e.preventDefault();
      this.classList.remove('drag-over');
      const pinId=e.dataTransfer.getData('text/plain');
      const newStatus=this.dataset.status;
      if(pinId&&newStatus&&STATUSES.includes(newStatus)){
        moveCard(pinId,newStatus,isAuthenticated);
      }
    });
  });
}

function bindMoveButtons(){
  document.querySelectorAll('.move-btn').forEach(btn=>{
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      const card=this.closest('.card');
      if(card){
        moveCard(card.dataset.pinId,this.dataset.target,isAuthenticated);
      }
    });
  });
}

async function load(){
  try{
    const response=await fetch('/api/me');
    if(response.status===401){
      currentPins=${JSON.stringify(SEEDED_PINS.map((p, i) => ({ ...p, id: "seed-" + i })))};
      isAuthenticated=false;
    }else if(response.ok){
      const data=await response.json();
      currentPins=data.pins||[];
      isAuthenticated=true;
    }else{
      currentPins=${JSON.stringify(SEEDED_PINS.map((p, i) => ({ ...p, id: "seed-" + i })))};
      isAuthenticated=false;
    }
  }catch(e){
    currentPins=${JSON.stringify(SEEDED_PINS.map((p, i) => ({ ...p, id: "seed-" + i })))};
    isAuthenticated=false;
  }
  refreshBoard();
}

document.addEventListener('DOMContentLoaded',function(){
  bindDragListeners();
  bindMoveButtons();
});
load();`;

function asset(pathname) {
  if (pathname === "/") {
    return new Response(page(), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (pathname === "/style.css") {
    return new Response(CSS, {
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  }
  if (pathname === "/app.js") {
    return new Response(CLIENT, {
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/api/health") return json({ ok: true });

    const staticAsset = asset(url.pathname);
    if (staticAsset) return staticAsset;

    if (url.pathname === "/login") {
      const redirect = new URL(
        `${String(env.ANYSHIP_AUTH_URL).replace(/\/$/, "")}/broker/authorize`,
      );
      for (const [key, value] of Object.entries({
        app: env.ANYSHIP_AUTH_APP_ID,
        provider: "google",
        redirect_uri: `${url.origin}/auth/callback`,
      })) {
        redirect.searchParams.set(key, value);
      }
      return Response.redirect(redirect);
    }

    if (url.pathname === "/auth/callback") {
      const claims = await verify(url.searchParams.get("anyship_token") || "", env);
      if (!claims) return new Response("Sign-in failed", { status: 401 });
      await init(env.DB);
      const token = sessionToken();
      await env.DB
        .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
        .bind(token, claims.sub, claims.name || "Teammate", claims.email || "")
        .run();
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/`,
        },
      });
    }

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": "session=; Max-Age=0; Path=/",
        },
      });
    }

    await init(env.DB);
    const token = parseCookies(req.headers.get("cookie")).session;
    const session =
      token &&
      (await env.DB.prepare("SELECT * FROM sessions WHERE token=?").bind(token).first());

    if (url.pathname.match(/^\/api\/pins\/[^/]+\/status$/) && req.method === "PATCH") {
      if (!session) return json({ error: "unauthorized" }, 401);
      const body = await req.json();
      if (!body.status || !STATUSES.includes(body.status)) {
        return json({ error: "invalid status", valid: STATUSES }, 400);
      }
      const pinId = url.pathname.split("/")[3];
      await env.DB
        .prepare("UPDATE pins SET status=? WHERE id=? AND user_id=?")
        .bind(body.status, Number(pinId), session.user_id)
        .run();
      return json({ ok: true });
    }

    if (!session) return json({ error: "unauthorized" }, 401);
    await ensureSeedPins(env.DB, session.user_id);

    if (url.pathname === "/api/me") {
      const pins = await env.DB
        .prepare("SELECT * FROM pins WHERE user_id=? ORDER BY id DESC")
        .bind(session.user_id)
        .all();
      return json({ user: session, pins: pins.results });
    }

    if (url.pathname === "/api/pins" && req.method === "POST") {
      const body = await req.json();
      const status = body.status && STATUSES.includes(body.status) ? body.status : "backlog";
      await env.DB
        .prepare("INSERT INTO pins(user_id,title,url,note,category,status) VALUES(?,?,?,?,?,?)")
        .bind(
          session.user_id,
          String(body.title || "").slice(0, 80),
          String(body.url || "").slice(0, 200),
          String(body.note || "").slice(0, 200),
          String(body.category || "").slice(0, 40),
          status,
        )
        .run();
      return json({ ok: true }, 201);
    }

    if (url.pathname.startsWith("/api/pins/") && req.method === "PATCH") {
      await env.DB
        .prepare("UPDATE pins SET saves=saves+1 WHERE id=? AND user_id=?")
        .bind(Number(url.pathname.split("/").pop()), session.user_id)
        .run();
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
};
