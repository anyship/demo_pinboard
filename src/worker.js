const APP = {
  name: "Pinboard",
  hero: "The shared wall for links, notes, and decisions worth keeping.",
  copy:
    "Collect the product briefs, launch links, customer notes, and design inspiration your team always ends up searching for later.",
  kicker: "TEAM MEMORY",
  section: "Pinned items",
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
    note:
      "The one-pager with timeline, owners, and cutover notes for the release review.",
    category: "Launch",
    saves: 8,
  },
  {
    title: "Customer interview highlights",
    url: "https://example.com/customer-notes",
    note:
      "Useful quotes to reuse in onboarding, homepage messaging, and the sales deck.",
    category: "Research",
    saves: 5,
  },
  {
    title: "Design inspiration board",
    url: "https://example.com/design-board",
    note:
      "A shared visual reference for the refreshed dashboard treatment and motion direction.",
    category: "Design",
    saves: 3,
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
    "CREATE TABLE IF NOT EXISTS pins(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,title TEXT,url TEXT,note TEXT,category TEXT,saves INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
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
      .prepare("INSERT INTO pins(user_id,title,url,note,category,saves) VALUES(?,?,?,?,?,?)")
      .bind(userId, pin.title, pin.url, pin.note, pin.category, pin.saves)
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
    <div id="app">${guestMarkup()}</div>
    <script type="module" src="/app.js"></script>
  </body>
</html>`;
}

function guestMarkup() {
  return `<div class="shell"><div class="frame"><header class="mast"><div class="brand"><div class="badge">↗</div><div><b>Pinboard</b><small>Static shell + browser app over an edge API</small></div></div><a href="/login" class="ghost">Sign in</a></header><section class="hero"><article class="intro"><span class="kicker">${APP.kicker}</span><h1>${APP.hero}</h1><p>${APP.copy}</p><div class="actions"><a href="/login" class="button">Sign in with Google</a><a href="/#stack" class="ghost">See why it is different</a></div></article><aside class="board-preview"><div class="preview-grid"><section class="note"><b>LAUNCH</b><p>Save the release brief, QA checklist, and customer-facing notes in one place.</p><small>Shared with product</small></section><section class="note"><b>RESEARCH</b><p>Keep design inspiration and market scans close to the roadmap discussion.</p><small>8 teammates viewed</small></section><section class="note"><b>SUPPORT</b><p>Pin the thread that explains the edge-cache regression before it disappears in chat.</p><small>Ready to revisit</small></section><section class="note"><b>DECISION</b><p>Capture the approved onboarding copy and the link to the working prototype.</p><small>Boosted by the team</small></section></div></aside></section><section id="stack" class="workspace"><aside class="side"><div class="dark-card"><small>DEMO SHAPE</small><h3>Not an ops dashboard.</h3><p>This app is a team scrapbook for links and notes, with a browser-rendered interface instead of a Worker-rendered document.</p><div class="chips"><span class="chip">HTML shell</span><span class="chip">Module JS</span><span class="chip">Edge API</span><span class="chip">D1</span></div></div></aside><main class="panel"><div class="head"><div><small class="muted">DIFFERENT PRODUCT, DIFFERENT STACK</small><h2>Built to feel like a pin wall.</h2></div><p class="muted">Anyship can host more than internal dashboards.</p></div><div class="empty">Sign in to open the private board and start pinning links, notes, and decisions.</div></main></section></div></div>`;
}

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
:root{--paper:#f6f1e8;--ink:#18212b;--muted:#5f6b78;--line:#e5d7bf;--card:#fffdf8;--shadow:0 28px 60px rgba(24,33,43,.11)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#fff7df 0,#f6f1e8 38%,#efe9dd 100%);color:var(--ink);font:15px 'IBM Plex Sans',sans-serif}a{color:inherit}.shell{min-height:100vh;padding:28px}.frame{max-width:1180px;margin:0 auto}.mast{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.brand{display:flex;align-items:center;gap:12px}.badge{width:42px;height:42px;border-radius:14px;background:#18212b;color:#fff;display:grid;place-items:center;font-weight:700;box-shadow:var(--shadow)}.brand b{display:block}.brand small,.muted{color:var(--muted)}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:22px}.panel,.note,.intro{background:rgba(255,253,248,.88);border:1px solid rgba(229,215,191,.95);border-radius:28px;box-shadow:var(--shadow);backdrop-filter:blur(12px)}.intro{padding:34px;overflow:hidden;position:relative}.kicker{display:inline-flex;padding:7px 11px;border-radius:999px;background:#fff0ea;color:#a1452d;font-size:12px;font-weight:700;letter-spacing:.08em}.intro h1{font:700 clamp(42px,6vw,76px)/.96 'Fraunces',serif;letter-spacing:-.05em;margin:18px 0 16px;max-width:9ch}.intro p{font-size:18px;line-height:1.7;color:#44505d;max-width:40ch}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.button,.ghost,.save{appearance:none;border:0;border-radius:14px;padding:14px 18px;font:600 15px 'IBM Plex Sans',sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.button{background:#18212b;color:#fff}.ghost{background:#fff;border:1px solid var(--line)}.board-preview{padding:18px;display:grid;gap:14px;background:linear-gradient(180deg,rgba(255,255,255,.8),rgba(255,247,232,.96))}.preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.note{padding:18px;min-height:166px}.note:nth-child(1){transform:rotate(-2deg)}.note:nth-child(2){transform:rotate(2deg);background:#fff7dd}.note:nth-child(3){transform:rotate(-1deg);background:#eef4ff}.note:nth-child(4){transform:rotate(1.5deg);background:#fff0ea}.note b{display:block;font-size:12px;letter-spacing:.08em;color:#7c6b56;margin-bottom:10px}.note p{margin:0;font-size:16px;line-height:1.52}.note small{display:block;margin-top:16px;color:#7c6b56}.workspace{display:grid;grid-template-columns:280px 1fr;gap:22px;margin-top:22px}.side{display:grid;gap:16px;align-content:start}.dark-card{background:#18212b;color:#fff;border-radius:24px;padding:22px}.dark-card small{color:#d7deea}.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.chip{padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.1);font-size:13px}.panel{padding:22px}.head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:18px}.head h2{font:700 34px/1 'Fraunces',serif;margin:6px 0}.composer{display:grid;grid-template-columns:1.2fr 1.2fr .8fr auto;gap:10px;margin-bottom:18px}.composer input{width:100%;padding:14px 16px;border-radius:14px;border:1px solid var(--line);background:#fff;font:inherit}.pins{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pin{padding:18px;background:var(--card);border:1px solid var(--line);border-radius:22px;display:grid;gap:12px}.pin-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.pin h3{margin:0;font-size:18px;line-height:1.3}.pin a{color:#2d5bd1;text-decoration:none;word-break:break-word}.pin p{margin:0;color:#4c5967;line-height:1.55}.meta{display:flex;justify-content:space-between;gap:10px;align-items:center;color:#7c6b56;font-size:13px}.save{background:#fff0ea;color:#a1452d;border-radius:999px;padding:10px 12px;font-size:13px;font-weight:700}.empty{padding:26px;border:1px dashed var(--line);border-radius:22px;background:rgba(255,255,255,.58);color:var(--muted)}@media (max-width:900px){.hero,.workspace,.composer,.preview-grid,.pins{grid-template-columns:1fr}.mast{flex-direction:column;align-items:flex-start}.intro h1{max-width:none}}`;

const CLIENT = `const APP=${JSON.stringify(APP)};
const root=document.querySelector('#app');
const esc=(value)=>String(value||'').replace(/[&<>"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const formatDate=(value)=>{if(!value)return 'Recently added';const date=new Date(value);return Number.isNaN(date.getTime())?'Recently added':date.toLocaleDateString();};

function guestView(){
  root.innerHTML='<div class="shell"><div class="frame"><header class="mast"><div class="brand"><div class="badge">↗</div><div><b>Pinboard</b><small>Static shell + browser app over an edge API</small></div></div><a href="/login" class="ghost">Sign in</a></header><section class="hero"><article class="intro"><span class="kicker">'+APP.kicker+'</span><h1>'+APP.hero+'</h1><p>'+APP.copy+'</p><div class="actions"><a href="/login" class="button">Sign in with Google</a><a href="/#stack" class="ghost">See why it is different</a></div></article><aside class="board-preview"><div class="preview-grid"><section class="note"><b>LAUNCH</b><p>Save the release brief, QA checklist, and customer-facing notes in one place.</p><small>Shared with product</small></section><section class="note"><b>RESEARCH</b><p>Keep design inspiration and market scans close to the roadmap discussion.</p><small>8 teammates viewed</small></section><section class="note"><b>SUPPORT</b><p>Pin the thread that explains the edge-cache regression before it disappears in chat.</p><small>Ready to revisit</small></section><section class="note"><b>DECISION</b><p>Capture the approved onboarding copy and the link to the working prototype.</p><small>Boosted by the team</small></section></div></aside></section><section id="stack" class="workspace"><aside class="side"><div class="dark-card"><small>DEMO SHAPE</small><h3>Not an ops dashboard.</h3><p>This app is a team scrapbook for links and notes, with a browser-rendered interface instead of a Worker-rendered document.</p><div class="chips"><span class="chip">HTML shell</span><span class="chip">Module JS</span><span class="chip">Edge API</span><span class="chip">D1</span></div></div></aside><main class="panel"><div class="head"><div><small class="muted">DIFFERENT PRODUCT, DIFFERENT STACK</small><h2>Built to feel like a pin wall.</h2></div><p class="muted">Anyship can host more than internal dashboards.</p></div><div class="empty">Sign in to open the private board and start pinning links, notes, and decisions.</div></main></section></div></div>';
}

function memberView(data){
  const user=data?.user||{};
  const pins=Array.isArray(data?.pins)?data.pins:[];
  root.innerHTML='<div class="shell"><div class="frame"><header class="mast"><div class="brand"><div class="badge">↗</div><div><b>Pinboard</b><small>Shared team links and lightweight knowledge capture</small></div></div><div class="muted">'+esc(user.email)+' · <a href="/logout">Sign out</a></div></header><section class="workspace"><aside class="side"><div class="dark-card"><small>WELCOME BACK</small><h3>'+esc(user.name)+'</h3><p>Keep your product notes, launch links, and customer references where the whole team can find them later.</p><div class="chips"><span class="chip">'+pins.length+' pins</span><span class="chip">Shared board</span><span class="chip">Google auth</span></div></div><div class="panel"><small class="muted">HOW THIS DEMO FEELS</small><p>This is a collaborative reference board, not a queue. Save URLs, add context, and boost the pins other people should read first.</p></div></aside><main class="panel"><div class="head"><div><small class="muted">'+APP.kicker+'</small><h2>'+APP.section+'</h2></div><p class="muted">Boost the best references so they stay visible.</p></div><form class="composer"><input name="title" required placeholder="Release brief, customer note, design inspo..."><input name="url" placeholder="https://example.com/article"><input name="category" placeholder="Category"><button class="button">Add pin</button></form><input id="note-input" style="width:100%;padding:14px 16px;border-radius:14px;border:1px solid #e5d7bf;background:#fff;font:inherit;margin-bottom:18px" name="note" placeholder="Add context or a takeaway for the team"><section class="pins">'+(pins.length?pins.map((pin)=>'<article class="pin"><div class="pin-head"><div><h3>'+esc(pin.title)+'</h3>'+(pin.url?'<a href="'+esc(pin.url)+'" target="_blank" rel="noreferrer">'+esc(pin.url)+'</a>':'')+'</div><button class="save" data-id="'+pin.id+'">Boost ▲ '+(pin.saves||0)+'</button></div><p>'+esc(pin.note||'Saved for the team with a short explanation of why this matters.')+'</p><div class="meta"><span>'+esc(pin.category||'General')+'</span><span>'+formatDate(pin.created_at)+'</span></div></article>').join(''):'<div class="empty">No pins yet. Start with a launch brief, design reference, or a key customer thread.</div>')+'</section></main></section></div></div>';
  const form=document.querySelector('.composer');
  form.onsubmit=async(event)=>{event.preventDefault();const payload=Object.fromEntries(new FormData(form));payload.note=document.querySelector('#note-input')?.value||'';await fetch('/api/pins',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});load()};
  document.querySelectorAll('[data-id]').forEach((button)=>{button.onclick=async()=>{await fetch('/api/pins/'+button.dataset.id,{method:'PATCH'});load()};});
}

async function load(){
  try{
    const response=await fetch('/api/me');
    if(response.status===401){guestView();return;}
    if(!response.ok)throw new Error('Failed to load board');
    memberView(await response.json());
  }catch(error){
    root.innerHTML='<div class="shell"><div class="frame"><section class="panel"><div class="head"><div><small class="muted">LOAD ERROR</small><h2>We could not open your board.</h2></div></div><div class="empty">Refresh the page to try again. If this happens again, the app still needs attention.</div></section></div></div>';
    console.error(error);
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
        .prepare("INSERT INTO pins(user_id,title,url,note,category) VALUES(?,?,?,?,?)")
        .bind(
          session.user_id,
          String(body.title || "").slice(0, 80),
          String(body.url || "").slice(0, 200),
          String(body.note || "").slice(0, 200),
          String(body.category || "").slice(0, 40),
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
