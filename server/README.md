# server/ — interactive server (Railway)

The one always-on piece of the stack. It exists because the static GitHub
Pages build can't hold secrets or receive webhooks; see
[docs/circulars-email-subscription-plan.md](../docs/circulars-email-subscription-plan.md).

**Scope rule:** something belongs here only if it must respond to an external
event in real time (user click, webhook). Batch work stays in GitHub Actions;
site reads stay browser → Supabase direct.

## Endpoints

| Route | What it does |
| --- | --- |
| `POST /api/subscribe` | Subscribe form: validates, honeypot + per-IP rate limit, upserts a `pending` row in `circular_subscribers`, sends the double-opt-in email via Resend |
| `GET /api/confirm?token=` | Confirmation link: flips `pending → confirmed`, renders a standalone success page |
| `GET /api/unsubscribe?token=` | Unsubscribe link from email footers, idempotent (a `POST` variant serves RFC 8058 one-click unsubscribe from mail clients) |
| `POST /api/notify-circulars` | Emails confirmed subscribers about summarized circulars newer than `NOTIFY_EPOCH` that they haven't been sent yet (per-pair send log in `circular_notifications`). Called by the ingest Action after every run; safe to re-call. `Authorization: Bearer <NOTIFY_SECRET>`; body `{"dry_run": true}` previews without sending |
| `POST /api/webhooks/resend` | Bounce/complaint events (svix-signed): flips subscriber to `bounced` |
| `GET /healthz` | Liveness check |

Plain Node ESM (like `scripts/`), Hono for routing, no build step. The
subscribers table has RLS enabled with **no policies on purpose** — only this
server (service role) touches it.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` (or `VITE_SUPABASE_URL`) | yes | same project as the site |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | bypasses RLS |
| `RESEND_API_KEY` | yes (prod) | boots without it; sends fail |
| `RESEND_WEBHOOK_SECRET` | for webhook | `whsec_…` from the Resend webhook endpoint page |
| `NOTIFY_SECRET` | for notify | shared with the ingest Action (`openssl rand -hex 32`); endpoint answers 503 until set |
| `PUBLIC_SERVER_URL` | yes (prod) | this server's public URL — used to build email links |
| `SITE_URL` | no | defaults to `https://upidashboard.com` |
| `MAIL_FROM` | no | defaults to `UPI Dashboard <circulars@mail.upidashboard.com>`; must match the Resend-verified domain |
| `PORT` | no | Railway injects it; defaults to 8787 |

## Local dev

```sh
cd server && npm install && npm run dev   # reads ../.env.local, listens on :8787
curl localhost:8787/healthz
```

`.env.local` already has the Supabase vars. Add `RESEND_API_KEY` +
`PUBLIC_SERVER_URL=http://localhost:8787` to test real confirmation sends.

## Deploying to Railway (one-time setup)

1. Apply `supabase/migrations/add_circular_subscribers.sql` and
   `supabase/migrations/add_circular_notifications.sql` in the Supabase SQL
   editor (usual paste-and-run workflow).
2. [railway.com](https://railway.com) → New Project → **Deploy from GitHub repo**
   → `npulyani/upi-dashboard-redesign`.
3. Service → Settings:
   - **Root Directory**: `server`
   - **Watch Paths**: `server/**` (so app/docs pushes don't redeploy it)
   - **Healthcheck Path**: `/healthz`
   - Region: Southeast Asia (Singapore)
4. Service → Variables: set the required vars from the table above (skip
   `PUBLIC_SERVER_URL` until step 5).
5. Settings → Networking → **Generate Domain**, then set `PUBLIC_SERVER_URL`
   to that URL (e.g. `https://upi-dashboard-server-production.up.railway.app`).
   A custom domain (`api.upidashboard.com`) can replace it later.
6. Resend dashboard → Webhooks → Add endpoint:
   `https://<domain>/api/webhooks/resend`, events `email.bounced` +
   `email.complained`; copy the signing secret into `RESEND_WEBHOOK_SECRET`.

Deploys after that are automatic on push to `main` (within the watch path).

## Smoke test after deploy

```sh
curl https://<domain>/healthz
curl -X POST https://<domain>/api/subscribe -H 'content-type: application/json' \
  -d '{"name":"Test","email":"you@example.com","company":"Test Co","role":"Engineering"}'
# → confirmation email should arrive; click it → success page → row 'confirmed'
```
