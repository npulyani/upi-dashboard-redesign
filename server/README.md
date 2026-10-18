# server/ — interactive server (Vercel)

The one non-static piece of the stack. It exists because the static GitHub
Pages build can't hold secrets or receive webhooks; see
[docs/circulars-email-subscription-plan.md](../docs/circulars-email-subscription-plan.md).

It runs as a Vercel serverless function (Hobby plan, non-commercial use):
Vercel detects `src/index.js` and runs its default export, so there's no
`vercel.json` and no build step. It was on Railway until that plan lapsed
(2026-10).

**Scope rule:** something belongs here only if it must respond to an external
event in real time (user click, webhook). Batch work stays in GitHub Actions;
site reads stay browser → Supabase direct.

## Endpoints

| Route | What it does |
| --- | --- |
| `POST /api/subscribe` | Subscribe form: validates, honeypot + per-IP rate limit (rows in `subscribe_attempts`), upserts a `pending` row in `circular_subscribers`, sends the double-opt-in email via Resend |
| `GET /api/confirm?token=` | Confirmation link: flips `pending → confirmed`, renders a standalone success page, and sends a one-time welcome email with the 3 most recent summarized circulars (best-effort, only on the actual flip) |
| `GET /api/unsubscribe?token=` | Unsubscribe link from email footers, idempotent (a `POST` variant serves RFC 8058 one-click unsubscribe from mail clients) |
| `POST /api/notify-circulars` | Emails confirmed subscribers about summarized circulars newer than `NOTIFY_EPOCH` that they haven't been sent yet (per-pair send log in `circular_notifications`). Called by the ingest Action after every run; safe to re-call. Stops starting new sends after 270 s (Vercel Hobby kills functions at 300 s) and answers `truncated: true` — the Action calls again until it isn't. `Authorization: Bearer <NOTIFY_SECRET>`; body `{"dry_run": true}` previews without sending |
| `POST /api/webhooks/resend` | Bounce/complaint events (svix-signed): flips subscriber to `bounced` |
| `GET /healthz` | Liveness check |

Plain Node ESM (like `scripts/`), Hono for routing, no build step. The
PII tables (`circular_subscribers`, `circular_notifications`) and
`subscribe_attempts` have RLS enabled with **no policies on purpose** — only
this server (service role) touches them.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` (or `VITE_SUPABASE_URL`) | yes | same project as the site |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | bypasses RLS |
| `RESEND_API_KEY` | yes (prod) | boots without it; sends fail |
| `RESEND_WEBHOOK_SECRET` | for webhook | `whsec_…` from the Resend webhook endpoint page |
| `NOTIFY_SECRET` | for notify | shared with the ingest Action (`openssl rand -hex 32`); endpoint answers 503 until set |
| `PUBLIC_SERVER_URL` | yes (prod) | this server's public URL — used to build email links. Use a custom domain you control (`https://api.upidashboard.com`), not the `*.vercel.app` one: links in already-sent emails point here forever, so the URL must survive a future host change |
| `SITE_URL` | no | defaults to `https://upidashboard.com` |
| `MAIL_FROM` | no | defaults to `UPI Dashboard <circulars@mail.upidashboard.com>`; must match the Resend-verified domain |
| `PORT` | no | local dev only; defaults to 8787 |

## Local dev

```sh
cd server && npm install && npm run dev   # reads ../.env.local, listens on :8787
curl localhost:8787/healthz
```

`.env.local` already has the Supabase vars. Add `RESEND_API_KEY` +
`PUBLIC_SERVER_URL=http://localhost:8787` to test real confirmation sends.
Locally a plain Node listener starts; on Vercel (`VERCEL=1`) it doesn't — the
default export is the function.

## Deploying to Vercel (one-time setup)

1. Apply `supabase/migrations/add_circular_subscribers.sql`,
   `add_circular_notifications.sql` and `add_subscribe_attempts.sql` in the
   Supabase SQL editor (usual paste-and-run workflow; all idempotent). If
   `subscribe_attempts` is missing the server still works but the per-IP rate
   limit silently does nothing.
2. [vercel.com](https://vercel.com) → Add New → Project → import
   `npulyani/upi-dashboard-redesign`. Settings:
   - **Root Directory**: `server`
   - Framework preset: Hono (auto-detected); no build/output overrides
   - Production branch: `main`
3. Settings → Environment Variables (Production): set the required vars from
   the table above. Leave `PUBLIC_SERVER_URL` for step 5.
4. Deploy, then check `https://<project>.vercel.app/healthz`.
5. Settings → Domains → add `api.upidashboard.com`; in Cloudflare DNS add the
   CNAME record Vercel shows (set it to **DNS only**, not proxied). Then set
   `PUBLIC_SERVER_URL=https://api.upidashboard.com` and redeploy.
6. Point the consumers at the new URL:
   - GitHub repo secret `NOTIFY_SERVER_URL` → `https://api.upidashboard.com`
     (the Pages build bakes it in as `VITE_SERVER_URL`, so re-run the Pages
     deploy afterwards).
   - Resend dashboard → Webhooks → endpoint URL
     `https://api.upidashboard.com/api/webhooks/resend`.

Deploys after that are automatic on every push to `main`. (Vercel redeploys the
server even for pushes that don't touch `server/`; harmless on Hobby.)

## Smoke test after deploy

```sh
curl https://api.upidashboard.com/healthz
curl -X POST https://api.upidashboard.com/api/subscribe -H 'content-type: application/json' \
  -d '{"name":"Test","email":"you@example.com","company":"Test Co","role":"Engineering"}'
# → confirmation email should arrive; click it → success page → row 'confirmed'
```

Rate limit check (no side effects — the honeypot field short-circuits after the
limiter runs): six calls with `"website":"x"` in the body from one IP → the
sixth answers 429.
