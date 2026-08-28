# Pinboard

Save the links, decisions and bright ideas that keep your team moving — without another meeting.

## What this demo shows

Pinboard is the "browser app over an edge API" example for Anyship. Unlike `opsroom`, this is not an internal queue dashboard. It is a collaborative board for saved links, launch notes, research references, and small team decisions.

## Stack

- Runtime: Cloudflare Workers
- Language: vanilla JavaScript ES modules
- UI delivery: HTML shell at `/`, separate module JavaScript at `/app.js`, and separate stylesheet at `/style.css`
- Frontend: client-rendered browser app
- Backend: Worker routes for auth, JSON APIs, and D1 persistence
- Auth: Anyship managed Google sign-in
- Data: Cloudflare D1 via the `DB` binding declared in `wrangler.toml`
- Tests: Node's built-in test runner

## Why this is a different demo

This app is intentionally different from `opsroom` in both product shape and delivery model:

- `opsroom` is an operations queue with a Worker-rendered UI
- `pinboard` is a shared knowledge board with a browser-rendered UI
- `opsroom` feels like an internal dashboard
- `pinboard` feels like a lightweight product workspace

Together they show that Anyship can deploy more than one style of JavaScript application, even when both run on the edge.

## Project layout

- `src/worker.js`: HTML shell, CSS/JS asset responses, auth flow, and D1-backed API routes
- `test/app.test.js`: smoke tests for the shell, external assets, helpers, and health route
- `wrangler.toml`: Worker entrypoint and D1 binding

## Anyship-specific behavior

You do not need to manually provision Google OAuth or a D1 database for this demo:

- Anyship injects `ANYSHIP_AUTH_URL`, `ANYSHIP_AUTH_APP_ID`, and `ANYSHIP_AUTH_SECRET`
- Anyship creates and wires the D1 database bound as `DB`
- the `database_id` in `wrangler.toml` is a placeholder and is replaced at deploy time
