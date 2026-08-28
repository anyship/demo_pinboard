const APP = {
  name: "Pinboard",
  hero: "The shared wall for links, notes, and decisions worth keeping.",
  copy:
    "Collect the product briefs, launch links, customer notes, and design inspiration your team always ends up searching for later.",
  kicker: "TEAM MEMORY",
  section: "Pinned items",
};

const STATUSES = ["backlog", "in-play", "done"];
const STATUS_LABELS = { backlog: "Backlog", "in-play": "In play", done: "Done" };

const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const SEEDED_PINS = [
  {
    title: "Launch brief for the September release",
    url: "https://example.com/launch-brief",
    note:
      "The one-pager with timeline, owners, and cutover notes for the release review.",
    category: "Launch",
    saves: 8,
    status: "in-play",
  },
  {
    title: "Customer interview highlights",
    url: "https://example.com/customer-notes",
    note:
      "Useful quotes to reuse in onboarding, homepage messaging, and the sales deck.",
    category: "Research",
    saves: 5,
    status: "backlog",
  },
  {
    title: "Design inspiration board",
    url: "https://example.com/design-board",
    note:
      "A shared visual reference for the refreshed dashboard treatment and motion direction.",
    category: "Design",
    saves: 3,
    status: "done",
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
    "CREATE TABLE IF NOT EXISTS pins(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,title TEXT,url TEXT,note TEXT,category TEXT,saves INTEGER DEFAULT 0,status TEXT DEFAULT 'backlog',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
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
      .prepare("INSERT INTO pins(user_id,title,url,note,category,saves,status) VALUES(?,?,?,?,?,?,?)")
      .bind(userId, pin.title, pin.url, pin.note, pin.category, pin.saves, pin.status)
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

function kanbanCards(pins) {
  return pins.map((pin) =>
    `<article class="kanban-card" data-id="${pin.id || ''}" data-status="${pin.status}"><div class="card-category">${pin.category || 'General'}</div><h3>${pin.title}</h3><p>${pin.note || ''}</p>${pin.url ? `<a href="${pin.url}" target="_blank" rel="noreferrer">${pin.url}</a>` : ''}<div class="card-meta"><span>${pin.saves || 0} boosts</span></div></article>`
  ).join("");
}

function kanbanMarkup() {
  const columns = STATUSES.map((status) => {
    const columnPins = SEEDED_PINS.filter((p) => p.status === status);
    return `<section class="kanban-column" data-status="${status}"><div class="column-header"><h2>${STATUS_LABELS[status]}</h2><span class="column-count">${columnPins.length}</span></div><div class="column-body">${kanbanCards(columnPins.map((p, i) => ({ ...p, id: `seed-${i}-${status}` })))}</div></section>`;
  }).join("");
  return `<div class="shell"><div class="frame"><header class="mast"><div class="brand"><div class="badge">↗</div><div><b>Pinboard</b><small>Drag notes between columns to organise your board</small></div></div><a href="/login" class="ghost">Sign in</a></header><main class="kanban-board">${columns}</main></div></div>`;
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
    <link rel="stylesheet" href="/style.css">
  </head>
  <body>
    <div id="app">${kanbanMarkup()}</div>
    <script type="module" src="/app.js"></script>
  </body>
</html>`;
}

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
:root{--paper:#f6f1e8;--ink:#18212b;--muted:#5f6b78;--line:#e5d7bf;--card:#fffdf8;--coral:#fff0ea;--coral-dark:#a1452d;--shadow:0 28px 60px rgba(24,33,43,.11)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#fff7df 0,#f6f1e8 38%,#efe9dd 100%);color:var(--ink);font:15px 'IBM Plex Sans',sans-serif}a{color:inherit}.shell{min-height:100vh;padding:28px}.frame{max-width:1280px;margin:0 auto}.mast{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.brand{display:flex;align-items:center;gap:12px}.badge{width:42px;height:42px;border-radius:14px;background:#18212b;color:#fff;display:grid;place-items:center;font-weight:700;box-shadow:var(--shadow)}.brand b{display:block}.brand small,.muted{color:var(--muted)}.button,.ghost,.save{appearance:none;border:0;border-radius:14px;padding:14px 18px;font:600 15px 'IBM Plex Sans',sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.button{background:#18212b;color:#fff}.ghost{background:#fff;border:1px solid var(--line)}.kanban-board{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;min-height:70vh}.kanban-column{background:rgba(255,253,248,.7);border:1px solid var(--line);border-radius:22px;padding:16px;display:flex;flex-direction:column;min-height:300px}.column-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line)}.column-header h2{font:700 20px/1 'Fraunces',serif;margin:0}.column-count{background:var(--coral);color:var(--coral-dark);font-size:13px;font-weight:700;padding:4px 10px;border-radius:999px}.column-body{flex:1;display:flex;flex-direction:column;gap:12px;min-height:60px}.column-body.drag-over{background:rgba(255,240,234,.5);border-radius:14px}.kanban-card{padding:16px;background:var(--card);border:1px solid var(--line);border-radius:16px;cursor:grab;transition:box-shadow .15s,transform .15s}.kanban-card:hover{box-shadow:var(--shadow);transform:translateY(-2px)}.kanban-card.dragging{opacity:.5;transform:rotate(2deg)}.kanban-card h3{margin:0 0 6px;font-size:16px;line-height:1.3}.kanban-card p{margin:0 0 8px;color:#4c5967;font-size:14px;line-height:1.5}.kanban-card a{color:#2d5bd1;text-decoration:none;font-size:13px;word-break:break-all}.card-category{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;color:#7c6b56;text-transform:uppercase;margin-bottom:8px}.card-meta{display:flex;justify-content:space-between;align-items:center;color:#7c6b56;font-size:12px;margin-top:8px}.move-buttons{display:flex;gap:4px;margin-top:8px}.move-btn{appearance:none;border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:600}.move-btn:hover{background:var(--coral);color:var(--coral-dark);border-color:var(--coral-dark)}.composer{display:grid;grid-template-columns:1.2fr 1.2fr .8fr auto;gap:10px;margin-bottom:18px;padding:16px;background:rgba(255,253,248,.88);border:1px solid var(--line);border-radius:22px}.composer input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:#fff;font:inherit}@media (max-width:900px){.kanban-board{grid-template-columns:1fr}.composer{grid-template-columns:1fr}.mast{flex-direction:column;align-items:flex-start}}`;

const CLIENT = `const APP=${JSON.stringify(APP)};
const STATUSES=${JSON.stringify(STATUSES)};
const STATUS_LABELS=${JSON.stringify(STATUS_LABELS)};
const root=document.querySelector('#app');
const esc=(v)=>String(v||'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function getGuestMoves(){try{return JSON.parse(localStorage.getItem('pinboard_moves')||'{}');}catch(e){return {};}}
function setGuestMove(id,status){const moves=getGuestMoves();moves[id]=status;localStorage.setItem('pinboard_moves',JSON.stringify(moves));}

function applyGuestMoves(pins){
  const moves=getGuestMoves();
  return pins.map(p=>{const override=moves[p.id]||moves[String(p.id)];return override?{...p,status:override}:p;});
}

function renderCard(pin,isGuest){
  const currentIdx=STATUSES.indexOf(pin.status);
  let moveHtml='<div class="move-buttons">';
  STATUSES.forEach((s,i)=>{if(i!==currentIdx)moveHtml+='<button class="move-btn" data-move-id="'+(pin.id)+'" data-move-to="'+s+'">→ '+STATUS_LABELS[s]+'</button>';});
  moveHtml+='</div>';
  return '<article class="kanban-card" draggable="true" data-id="'+pin.id+'" data-status="'+pin.status+'"><div class="card-category">'+esc(pin.category||'General')+'</div><h3>'+esc(pin.title)+'</h3><p>'+esc(pin.note||'')+'</p>'+(pin.url?'<a href="'+esc(pin.url)+'" target="_blank" rel="noreferrer">'+esc(pin.url)+'</a>':'')+'<div class="card-meta"><span>'+(pin.saves||0)+' boosts</span></div>'+moveHtml+'</article>';
}

function renderBoard(pins,user){
  const isGuest=!user;
  let html='<div class="shell"><div class="frame"><header class="mast"><div class="brand"><div class="badge">↗</div><div><b>Pinboard</b><small>Drag notes between columns to organise your board</small></div></div>';
  if(user)html+='<div class="muted">'+esc(user.email)+' · <a href="/logout">Sign out</a></div>';
  else html+='<a href="/login" class="ghost">Sign in</a>';
  html+='</header>';
  if(user)html+='<form class="composer"><input name="title" required placeholder="New note title..."><input name="url" placeholder="https://..."><input name="category" placeholder="Category"><button class="button">Add to Backlog</button></form>';
  html+='<main class="kanban-board">';
  STATUSES.forEach(status=>{
    const colPins=pins.filter(p=>p.status===status);
    html+='<section class="kanban-column" data-status="'+status+'"><div class="column-header"><h2>'+STATUS_LABELS[status]+'</h2><span class="column-count">'+colPins.length+'</span></div><div class="column-body" data-drop="'+status+'">';
    colPins.forEach(p=>{html+=renderCard(p,isGuest);});
    html+='</div></section>';
  });
  html+='</main></div></div>';
  root.innerHTML=html;
  bindDragDrop(isGuest);
  bindMoveButtons(isGuest);
  if(user)bindComposer();
}

function bindDragDrop(isGuest){
  const cards=document.querySelectorAll('.kanban-card');
  const dropZones=document.querySelectorAll('[data-drop]');
  cards.forEach(card=>{
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.id);card.classList.add('dragging');});
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');dropZones.forEach(z=>z.classList.remove('drag-over'));});
  });
  dropZones.forEach(zone=>{
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');});
    zone.addEventListener('dragleave',()=>{zone.classList.remove('drag-over');});
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');const newStatus=zone.dataset.drop;moveCard(id,newStatus,isGuest);});
  });
}

function bindMoveButtons(isGuest){
  document.querySelectorAll('[data-move-id]').forEach(btn=>{
    btn.addEventListener('click',()=>{moveCard(btn.dataset.moveId,btn.dataset.moveTo,isGuest);});
  });
}

function moveCard(id,newStatus,isGuest){
  if(isGuest){setGuestMove(id,newStatus);loadGuest();}
  else{fetch('/api/pins/'+id+'/status',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:newStatus})}).then(()=>load());}
}

function bindComposer(){
  const form=document.querySelector('.composer');
  if(!form)return;
  form.onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(form);const payload=Object.fromEntries(fd);await fetch('/api/pins',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});load();};
}

const SEEDED_PINS=${JSON.stringify(SEEDED_PINS.map((p, i) => ({ ...p, id: 'seed-' + i })))};

function loadGuest(){
  const pins=applyGuestMoves(SEEDED_PINS);
  renderBoard(pins,null);
}

async function load(){
  try{
    const r=await fetch('/api/me');
    if(r.status===401){loadGuest();return;}
    if(!r.ok)throw new Error('Failed');
    const data=await r.json();
    const pins=applyGuestMoves(Array.isArray(data.pins)?data.pins:[]);
    renderBoard(pins,data.user);
  }catch(err){
    loadGuest();
    console.error(err);
  }
}

load();`;

function asset(pathname) {
  if (pathname === "/") {
    return new Response(page(), {
      headers: { "content-type": "text/html; charset=utf-8" },
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
      await env.DB
        .prepare("INSERT INTO pins(user_id,title,url,note,category,status) VALUES(?,?,?,?,?,?)")
        .bind(
          session.user_id,
          String(body.title || "").slice(0, 80),
          String(body.url || "").slice(0, 200),
          String(body.note || "").slice(0, 200),
          String(body.category || "").slice(0, 40),
          "backlog",
        )
        .run();
      return json({ ok: true }, 201);
    }

    if (/^\/api\/pins\/\d+\/status$/.test(url.pathname) && req.method === "PATCH") {
      const id = Number(url.pathname.split("/")[3]);
      const body = await req.json();
      const newStatus = String(body.status || "").toLowerCase();
      if (!STATUSES.includes(newStatus)) return json({ error: "invalid status" }, 400);
      await env.DB
        .prepare("UPDATE pins SET status=? WHERE id=? AND user_id=?")
        .bind(newStatus, id, session.user_id)
        .run();
      return json({ ok: true });
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
