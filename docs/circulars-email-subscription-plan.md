# Circulars Email Subscription — Feature Brainstorm

**Status (2026-07-08):** Backend live on branch `circulars-email-subscription` — subscribe/confirm/unsubscribe/notify all working end to end, verified in production dry-run. Frontend (subscribe modal) and admin subscriber view are not built yet. Wireframes below are still the target design for those. See [Implementation status](#implementation-status) for what's actually running.
**Date:** 2026-07-06 (brainstorm) — updated 2026-07-08

## What it is

Let visitors subscribe to NPCI circulars by email. Whenever the ingestion pipeline fetches a new circular, every active subscriber receives an email containing:

- the circular's **smart summary**
- the **full extracted text** (or a readable excerpt with a "read more" link back to the site)
- the **original PDF as an attachment**

The site owner (admin) can view and manage the subscriber list.

## Functionality overview

### 1. Subscribing (visitor)

- Entry points: a **"Get new circulars by email"** button on the Circulars page, plus an inline banner/card at the top of the circulars list.
- Clicking opens a subscribe form (modal or inline card) collecting:
  - **Name** (required)
  - **Email** (required, validated)
  - **Company name** (required)
  - **Role in the company** (required — dropdown with common roles + "Other" free text, e.g. Compliance, Product, Engineering, Founder, Analyst, Legal)
- On submit: subscriber is stored as **pending**, and a **confirmation email** (double opt-in) is sent with a "Confirm subscription" link. Only confirmed subscribers receive circulars. This protects sender reputation and is the privacy-friendly default.
- Form footer carries a **data-privacy disclaimer** (see below), and every outgoing email carries an **unsubscribe link** (one click, no login).

### 2. Notification email (per new circular)

- Triggered when the ingestion job detects and stores a new circular.
- One email per circular (if a fetch run brings in multiple circulars, subscribers get one email per circular — or optionally a single digest if >3 arrive at once; open question below).
- Content: circular number + title, issue date, smart summary, full text, link to the circular on upidashboard.com, PDF attached.
- Footer: who this is from, why you're receiving it, unsubscribe link, privacy note.

### 3. Subscriber management (admin)

- **Decided 2026-07-08: no custom admin UI.** Manage subscribers directly via
  Supabase Studio's Table Editor on the `circular_subscribers` table —
  project-owner login bypasses RLS, so view/search/filter/edit/delete/export
  CSV are all already available with zero extra build. See Implementation
  status below for why a bespoke page would just duplicate this.
- Bounce / complaint handling: repeated hard bounces automatically flip a subscriber to **bounced** so we stop mailing them (already live via the Resend webhook).

### 4. Data privacy

- Disclaimer shown in the subscribe form footer and echoed in every email:
  - What we collect (name, email, company, role) and the **sole purpose** (sending new NPCI circulars and related updates).
  - Data is never sold or shared with third parties; stored securely; deleted on unsubscribe or on request.
  - Contact address for data-deletion requests.
  - Consent line: "By subscribing you agree to receive circular notification emails."
- Unsubscribe is honored immediately and removes the subscriber from all future sends.

---

## Implementation status

Built so far (branch `circulars-email-subscription`, not yet merged to `main`):

- **`server/` — a small always-on Node service on Railway.** The static GitHub Pages
  build can't hold secrets or receive webhooks, so this is the one non-static
  piece of the stack. Plain ESM + Hono, no build step, deployed from the same
  repo (Railway watches `server/**`). Full endpoint reference and env-var list:
  [server/README.md](../server/README.md).
- **Endpoints, all live:** `POST /api/subscribe` (validates, honeypot + per-IP
  rate limit, upserts a `pending` row, sends the double-opt-in email),
  `GET /api/confirm` (flips `pending → confirmed`, standalone success page —
  these render outside the SPA since they're opened from email clients),
  `GET/POST /api/unsubscribe` (also serves RFC 8058 one-click unsubscribe),
  `POST /api/notify-circulars` (the send step, see below), `POST
  /api/webhooks/resend` (bounce/complaint → flips subscriber to `bounced`).
- **DB:** two new Supabase tables, `circular_subscribers` and
  `circular_notifications` (migrations `add_circular_subscribers.sql` /
  `add_circular_notifications.sql`, applied). Both have RLS **enabled with
  zero policies on purpose** — service-role (the server) only, invisible to
  the anon key. Do not "fix" this the way [statewise RLS gotcha] was fixed;
  here no-policy is the intended posture, not a bug.
- **Send step is pull-based and idempotent, not push-triggered:** the ingest
  GitHub Action (`scripts/run_circulars_update.mjs`, commit f70287a) calls
  `POST /api/notify-circulars` unconditionally at the end of every run. The
  endpoint itself finds summarized circulars past a `NOTIFY_EPOCH`
  (2026-07-08 — same epoch-floor pattern as the frontend's NEW badge, so the
  back-catalog of ~240 already-summarized circulars is never mailed) that
  lack a `circular_notifications` row per confirmed subscriber, and sends
  only those pairs. Re-running after a partial failure resumes without
  duplicate sends. Supports `{"dry_run": true}` to preview counts with no
  sends.
- **Architecture rule locked in:** the server only answers real-time events
  (a click, a webhook). Ingest, OCR, summarization, and the notify trigger
  itself all stay batch jobs in GitHub Actions. Site reads never proxy
  through the server — browser talks to Supabase directly, same as before
  this feature existed.
- **Email service decided and configured:** Resend, with `mail.upidashboard.com`
  verified as the sending subdomain and `circulars@mail.upidashboard.com` as
  the from-address (isolates this feature's sender reputation from the rest
  of the domain). Bounce/complaint webhook wired to `/api/webhooks/resend`.
- **Verified in production:** subscribe → confirmation email → confirmed row
  (user-tested end to end 2026-07-08); notify endpoint dry-run tested against
  prod data.
- **Not built yet:** the subscribe-form frontend (still just the wireframes
  below), the welcome email (see Open questions #3), and merging this branch
  to `main` (the notify call is inert until then, since the ingest cron runs
  `main`'s workflow). No admin UI to build — see §3 above.
- **Pending before this is fully live:** add `NOTIFY_SERVER_URL` +
  `NOTIFY_SECRET` as GitHub repo secrets, a `workflow_dispatch` test run on
  this branch, then the frontend + welcome-email work above, then merge.

## Wireframes

### A. Circulars page — subscribe entry point

```
┌──────────────────────────────────────────────────────────────┐
│  NPCI Circulars                                  [ Search 🔍 ] │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📬  Never miss a circular                                 │ │
│ │ Get every new NPCI circular in your inbox — summary,      │ │
│ │ full text and the original PDF.        [ Subscribe → ]    │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ● OC 212 — Interchange revision for P2M ...        NEW      │
│  ● OC 211 — UPI Lite enhancements ...                        │
│  ● OC 210 — ...                                              │
└──────────────────────────────────────────────────────────────┘
```

### B. Subscribe form (modal)

```
┌───────────────────────────────────────────────┐
│  Subscribe to new circulars              [✕]  │
├───────────────────────────────────────────────┤
│  Name *                                       │
│  ┌─────────────────────────────────────────┐  │
│  │                                         │  │
│  └─────────────────────────────────────────┘  │
│  Work email *                                 │
│  ┌─────────────────────────────────────────┐  │
│  │                                         │  │
│  └─────────────────────────────────────────┘  │
│  Company *                                    │
│  ┌─────────────────────────────────────────┐  │
│  │                                         │  │
│  └─────────────────────────────────────────┘  │
│  Role *                                       │
│  ┌─────────────────────────────────────────┐  │
│  │ Compliance ▾                            │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│            [ Subscribe ]                      │
│                                               │
│ ─────────────────────────────────────────────│
│  🔒 We only use your details to send you new  │
│  NPCI circulars. No sharing, no selling.      │
│  Unsubscribe anytime with one click.          │
│  Read our data privacy note →                 │
└───────────────────────────────────────────────┘
```

### C. Post-submit + confirmation states

```
┌───────────────────────────────────────────────┐
│  ✉️  Almost there!                             │
│                                               │
│  We've sent a confirmation link to            │
│  priya@examplebank.com.                       │
│  Click it to activate your subscription.      │
│                                               │
│                 [ Done ]                      │
└───────────────────────────────────────────────┘

(after clicking the email link — lands on the site)
┌───────────────────────────────────────────────┐
│  ✅  You're subscribed!                        │
│  You'll get every new NPCI circular by email. │
│           [ Browse circulars → ]              │
└───────────────────────────────────────────────┘
```

### D. Notification email layout

```
┌──────────────────────────────────────────────────┐
│  UPI Dashboard — New NPCI Circular               │
├──────────────────────────────────────────────────┤
│  OC 212 · 05 Jul 2026                            │
│  Interchange revision for P2M merchant           │
│  categories                                      │
│                                                  │
│  ── Summary ────────────────────────────────     │
│  • Point 1 of the smart summary                  │
│  • Point 2 ...                                   │
│  • Point 3 ...                                   │
│                                                  │
│  ── Full text ──────────────────────────────     │
│  Complete extracted circular text (long-form,    │
│  scrollable in the email body)...                │
│                                                  │
│  [ View on upidashboard.com ]                    │
│                                                  │
│  📎 OC-212.pdf (original circular attached)      │
├──────────────────────────────────────────────────┤
│  You're receiving this because you subscribed    │
│  to NPCI circular updates on upidashboard.com.   │
│  We never share or sell your data.               │
│  Unsubscribe · Privacy note                      │
└──────────────────────────────────────────────────┘
```

### E. Admin — subscriber management

```
┌────────────────────────────────────────────────────────────────────┐
│  Subscribers (142)                    [ Search… ]  [ Export CSV ]  │
│  Filter: [ Status ▾ ] [ Role ▾ ]                                   │
├────────────────────────────────────────────────────────────────────┤
│  Name         Email                Company        Role       Status│
│  ─────────────────────────────────────────────────────────────────│
│  Priya S.     priya@examplebk.com  Example Bank   Compliance  ✅ ⋮ │
│  Arjun M.     arjun@fintechco.in   FintechCo      Product     ✅ ⋮ │
│  Neha R.      neha@paysoft.com     PaySoft        Analyst     ⏳ ⋮ │
│  Vikram T.    vik@oldmail.com      —              Founder     ⛔ ⋮ │
│                                                                    │
│  ✅ confirmed  ⏳ pending  ⛔ unsubscribed/bounced                   │
│  ⋮ row menu: Remove · Resend confirmation · Copy email             │
└────────────────────────────────────────────────────────────────────┘
```

---

## Email service (the one technical piece)

**Decided and live: [Resend](https://resend.com).** Simple REST API, generous free tier (~3k emails/month, 100/day), supports attachments up to 40 MB total, and built-in webhook events for bounces/complaints (feeds the `bounced` status). Account created and `mail.upidashboard.com` verified (SPF + DKIM) 2026-07-07.

- **Alternatives considered, not chosen:**
  - **Amazon SES** — cheapest at scale ($0.10/1k), but more setup friction (sandbox exit request, IAM, bounce handling via SNS). Overkill until subscriber count is large.
  - **Postmark** — best-in-class deliverability for transactional mail, but paid from the start (~$15/month).
  - **Brevo / Mailchimp-style platforms** — bring their own list management UI, but heavyweight, branded footers on free tiers, and awkward for per-circular transactional sends with attachments.
- **Sending model, as built:** transactional sends (one API call per subscriber per circular), triggered by the ingest GitHub Action but actually sent by `server/`'s `/api/notify-circulars` (the Action holds no Resend key — see Implementation status above). No marketing-platform "campaigns" — the circular *is* the content.
- **Attachment note, as built:** the notify endpoint downloads the PDF from Supabase Storage and skips the attachment (keeping the view-on-site link) if it would push the message past 35 MB, leaving headroom under Resend's 40 MB cap.
- **From address, as built:** `circulars@mail.upidashboard.com` on the verified subdomain, isolating this feature's sender reputation from the rest of `upidashboard.com`. No-reply in practice — no inbound routing configured; replies go nowhere. Revisit if that turns out to matter.

---

## Tech decisions (2026-07-07)

- **Interactive server on Railway** (`server/`, Node + Hono, no build step)
  hosts the four real-time paths: subscribe, confirm, unsubscribe, Resend
  bounce/complaint webhook. Chosen over Supabase Edge Functions to keep one
  runtime (Node) across scripts and server; chosen over a VPS to stay managed.
- **Scheduled ingestion stays on GitHub Actions** — free (public repo),
  observable (issue notifications), queued concurrency, manual dispatch.
- **Send step revised 2026-07-08:** the Action *triggers* sending by calling
  the server's `POST /api/notify-circulars` (Bearer `NOTIFY_SECRET`) at the
  end of each ingest run; sending itself lives on the server, where the Resend
  key, templates and unsubscribe tokens already live. The endpoint is
  pull-based and idempotent (per-pair send log in `circular_notifications`,
  epoch floor so the back-catalog is never mailed), so the Action calls it
  unconditionally — same self-healing idiom as the rest of the pipeline.
- **Decision rule:** the server only gets paths that must respond to an
  external event in real time. Batch → Actions; reads → browser → Supabase.
- **Data:** `circular_subscribers` table (migration
  `supabase/migrations/add_circular_subscribers.sql`), RLS on with zero
  policies — service-role access only, first private table in the project.
- Setup runbook: [server/README.md](../server/README.md).

## Open questions

1. ~~Digest vs. per-circular emails~~ — **Resolved: per-circular**, as built. One email per circular; a burst of NPCI publishes just means several emails in short succession, throttled by the notify loop (600ms between sends, Resend free-tier's 2 req/s cap).
2. ~~Full text in email body vs. summary + PDF only~~ — **Resolved: full text in the body**, alongside summary and PDF, as built. Gmail's ~102 KB clip risk on very long circulars was accepted; the "View on upidashboard.com" link is placed above the full-text section so it's never lost even if a client clips the email.
3. ~~Backfill welcome email~~ — **Resolved 2026-07-08:** yes. On confirmation, send a welcome email (separate from the plain "you're subscribed" confirm-page) containing the **last 3 circulars** (title, summary, link to PDF each) plus a line explaining that from now on they'll get an **individual email as soon as each new circular is fetched from NPCI**. This is distinct from `NOTIFY_EPOCH`, which still governs the *ongoing* per-circular sends — the welcome email is a one-time, separately-triggered digest of recent history, not a retroactive catch-up through the notify pipeline. Not built yet: needs a new email template (`welcomeEmail` in `server/src/emails.js`) and a query for the 3 most recent summarized circulars, fired from `GET /api/confirm` right after the status flip to `confirmed`.
4. ~~Admin auth~~ — **Resolved 2026-07-08: not needed.** No custom admin view is being built (see §3 above) — Supabase Studio login is the access control.
5. ~~Rate/abuse protection on the subscribe form~~ — **Resolved: both built.** Honeypot field (`website`) and a per-IP in-memory rate limit (5 submissions / 10 min) live in `POST /api/subscribe`. No captcha added; revisit only if abuse actually shows up.
