const SEEDED_PINS = [
  { title: 'Launch checklist', note: 'Final items before go-live' },
  { title: 'Brand color palette', note: 'Coral, sand, navy — approved by design' },
  { title: 'Weekly standup notes', note: 'Async updates every Monday' },
  { title: 'API design doc', note: 'REST endpoints v2 proposal' },
  { title: 'Coffee chat schedule', note: 'Rotating pairs for July' },
  { title: 'Q3 roadmap draft', note: 'Features + timeline in one page' },
  { title: 'Team offsite ideas', note: 'Cooking class? Escape room?' },
  { title: 'Design review feedback', note: 'Notes from last Thursday' },
];

export const parseCookies = (v = '') =>
  Object.fromEntries(
    String(v || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
      const i = x.indexOf('=');
      return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
    })
  );

export const sessionToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), x =>
    x.toString(16).padStart(2, '0')
  ).join('');

const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { 'content-type': 'application/json', ...h },
  });

const esc = s => String(s || '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
);

async function initDB(db) {
  for (const q of [
    'CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT, name TEXT, email TEXT)',
    'CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, title TEXT, detail TEXT, votes INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  ]) await db.prepare(q).run();
}

async function verifyToken(t, env) {
  try {
    const [a, b, c] = t.split('.');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.ANYSHIP_AUTH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const decode = x =>
      Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), z => z.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', key, decode(c), new TextEncoder().encode(a + '.' + b)))
      return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(b)));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

function renderPinCard(pin, idx) {
  const colors = ['#fef3e2', '#e8f4f8', '#fce4ec', '#e8f5e9', '#fff3e0', '#ede7f6', '#fff8e1', '#e3f2fd'];
  const bg = colors[idx % colors.length];
  return `<div class="pin" style="background:${bg}"><h3>${esc(pin.title)}</h3><p>${esc(pin.note)}</p></div>`;
}

function renderPage(user, items) {
  const pins = items || SEEDED_PINS;
  const pinCards = pins.map((p, i) => renderPinCard(p, i)).join('');
  const isAuthed = !!user;

  const userBar = isAuthed
    ? `<div class="user-bar"><span>Hey, <b>${esc(user.name.split(' ')[0])}</b></span><a href="/logout" class="sign-out">Sign out</a></div>`
    : `<a href="/login" class="sign-in-btn">Sign in with Google</a>`;

  const addForm = isAuthed
    ? `<form class="add-form" id="add-form"><input name="title" required placeholder="Pin a title\u2026" maxlength="80"><input name="detail" placeholder="Note or URL (optional)" maxlength="160"><button type="submit" class="add-btn">Pin it</button></form>`
    : `<p class="guest-hint">Sign in to pin your own cards</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pinboard</title>
<style>${CSS}</style>
</head>
<body>
<header class="top-bar">
  <h1 class="logo">Pinboard</h1>
  ${userBar}
</header>
<main class="board">
  ${addForm}
  <div class="pin-wall">${pinCards}</div>
</main>
<script>${CLIENT(isAuthed)}</script>
</body>
</html>`;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#faf7f4;color:#2d2a26;font:15px/1.5 'Inter',system-ui,sans-serif;min-height:100vh}
.top-bar{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;border-bottom:1px solid #ebe6e0}
.logo{font-size:20px;font-weight:700;color:#c0562b;letter-spacing:-.02em}
.sign-in-btn{background:#fff;border:1px solid #d4cfc8;border-radius:8px;padding:8px 16px;font:500 14px inherit;color:#2d2a26;text-decoration:none;cursor:pointer;transition:box-shadow .15s}
.sign-in-btn:hover{box-shadow:0 2px 8px #0001}
.user-bar{display:flex;align-items:center;gap:14px;font-size:14px}
.sign-out{color:#9a8e82;font-size:13px;text-decoration:none}
.sign-out:hover{color:#c0562b}
.board{max-width:900px;margin:0 auto;padding:32px 24px}
.add-form{display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap}
.add-form input{flex:1;min-width:140px;padding:12px 14px;border:1px solid #ddd7cf;border-radius:10px;font:inherit;background:#fff}
.add-form input:focus{outline:none;border-color:#c0562b;box-shadow:0 0 0 3px #c0562b18}
.add-btn{background:#c0562b;color:#fff;border:none;border-radius:10px;padding:12px 20px;font:600 14px inherit;cursor:pointer}
.add-btn:hover{background:#a8481f}
.guest-hint{color:#9a8e82;font-size:14px;margin-bottom:20px;font-style:italic}
.pin-wall{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.pin{border-radius:14px;padding:20px;border:1px solid #ebe6e0;transition:transform .12s,box-shadow .12s}
.pin:hover{transform:translateY(-2px);box-shadow:0 6px 20px #0001}
.pin h3{font-size:15px;font-weight:600;margin-bottom:6px;color:#2d2a26}
.pin p{font-size:13px;color:#6b635a;line-height:1.4}
@media(max-width:600px){.top-bar{padding:14px 16px}.board{padding:20px 14px}.add-form{flex-direction:column}.pin-wall{grid-template-columns:1fr 1fr}}
@media(max-width:380px){.pin-wall{grid-template-columns:1fr}}
`.trim();

function CLIENT(isAuthed) {
  if (!isAuthed) {
    return `document.querySelector(".sign-in-btn").addEventListener("click",function(e){e.preventDefault();location.href="/login"});`;
  }
  return `(function(){
var form=document.getElementById("add-form");
if(form){form.addEventListener("submit",function(e){
e.preventDefault();
var fd=new FormData(form);
var body=JSON.stringify({title:fd.get("title"),detail:fd.get("detail")});
fetch("/api/items",{method:"POST",headers:{"content-type":"application/json"},body:body}).then(function(){location.reload()});
});}
})();`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/api/health') return json({ ok: true });

    if (url.pathname === '/login') {
      const authUrl = new URL(
        String(env.ANYSHIP_AUTH_URL).replace(/\/$/, '') + '/broker/authorize'
      );
      authUrl.searchParams.set('app', env.ANYSHIP_AUTH_APP_ID);
      authUrl.searchParams.set('provider', 'google');
      authUrl.searchParams.set('redirect_uri', url.origin + '/auth/callback');
      return Response.redirect(authUrl);
    }

    if (url.pathname === '/auth/callback') {
      const claims = await verifyToken(url.searchParams.get('anyship_token') || '', env);
      if (!claims) return new Response('Sign-in failed', { status: 401 });
      await initDB(env.DB);
      const tok = sessionToken();
      await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)')
        .bind(tok, claims.sub, claims.name || 'Teammate', claims.email || '')
        .run();
      return new Response(null, {
        status: 302,
        headers: {
          location: '/',
          'set-cookie': `session=${tok}; HttpOnly; Secure; SameSite=Lax; Path=/`,
        },
      });
    }

    if (url.pathname === '/logout') {
      return new Response(null, {
        status: 302,
        headers: { location: '/', 'set-cookie': 'session=; Max-Age=0; Path=/' },
      });
    }

    // Try to identify the user (optional for page render)
    let session = null;
    if (env.DB) {
      const tok = parseCookies(req.headers.get('cookie')).session;
      if (tok) {
        await initDB(env.DB);
        session = await env.DB.prepare('SELECT * FROM sessions WHERE token=?').bind(tok).first();
      }
    }

    if (url.pathname === '/') {
      let userItems = null;
      if (session && env.DB) {
        const rows = await env.DB.prepare('SELECT * FROM items WHERE user_id=? ORDER BY id DESC')
          .bind(session.user_id).all();
        if (rows.results && rows.results.length > 0) {
          userItems = rows.results.map(r => ({ title: r.title, note: r.detail || '' }));
        }
      }
      const pins = userItems || SEEDED_PINS;
      const html = renderPage(session, pins);
      return new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8' } });
    }

    // API routes below require auth
    if (!session) return json({ error: 'unauthorized' }, 401);

    if (url.pathname === '/api/me') {
      await initDB(env.DB);
      const items = (await env.DB.prepare('SELECT * FROM items WHERE user_id=? ORDER BY id DESC')
        .bind(session.user_id).all()).results;
      return json({ user: session, items });
    }

    if (url.pathname === '/api/items' && req.method === 'POST') {
      const body = await req.json();
      await initDB(env.DB);
      await env.DB.prepare('INSERT INTO items(user_id,title,detail) VALUES(?,?,?)')
        .bind(session.user_id, String(body.title || '').slice(0, 80), String(body.detail || '').slice(0, 160))
        .run();
      return json({ ok: true }, 201);
    }

    if (url.pathname.startsWith('/api/items/') && req.method === 'PATCH') {
      await initDB(env.DB);
      await env.DB.prepare('UPDATE items SET votes=votes+1 WHERE id=? AND user_id=?')
        .bind(+url.pathname.split('/').pop(), session.user_id)
        .run();
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
