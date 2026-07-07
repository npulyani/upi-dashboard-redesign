# Circulars Email Subscription — Feature Brainstorm

**Status:** Brainstorm / wireframe only — no tech plan yet (except the email service section, included by request).
**Date:** 2026-07-06

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

- Admin-only view (not linked from public nav) to:
  - See all subscribers: name, email, company, role, status (pending / confirmed / unsubscribed / bounced), subscribed date.
  - Search / filter by status, company, role.
  - Manually remove (or re-activate) a subscriber.
  - Export the list as CSV.
- Bounce / complaint handling: repeated hard bounces automatically flip a subscriber to **bounced** so we stop mailing them.

### 4. Data privacy

- Disclaimer shown in the subscribe form footer and echoed in every email:
  - What we collect (name, email, company, role) and the **sole purpose** (sending new NPCI circulars and related updates).
  - Data is never sold or shared with third parties; stored securely; deleted on unsubscribe or on request.
  - Contact address for data-deletion requests.
  - Consent line: "By subscribing you agree to receive circular notification emails."
- Unsubscribe is honored immediately and removes the subscriber from all future sends.

---

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

The only implementation detail worth settling now is **how emails get sent**, since everything else hangs off it.

- **Recommended: [Resend](https://resend.com)** — simple REST API, generous free tier (~3k emails/month, 100/day), supports attachments up to 40 MB total, React Email templates if we ever want richer HTML, and built-in webhook events for bounces/complaints (needed for the admin status column). Requires verifying the `upidashboard.com` domain (SPF + DKIM DNS records) so mails don't land in spam.
- **Alternatives considered:**
  - **Amazon SES** — cheapest at scale ($0.10/1k), but more setup friction (sandbox exit request, IAM, bounce handling via SNS). Overkill until subscriber count is large.
  - **Postmark** — best-in-class deliverability for transactional mail, but paid from the start (~$15/month).
  - **Brevo / Mailchimp-style platforms** — bring their own list management UI, but heavyweight, branded footers on free tiers, and awkward for per-circular transactional sends with attachments.
- **Sending model:** transactional sends (one API call per subscriber per circular) triggered from the existing ingestion GitHub Action after a new circular is stored. No marketing-platform "campaigns" — the circular *is* the content.
- **Attachment note:** NPCI PDFs are typically well under attachment limits, but the send step should fall back to a download link if a PDF ever exceeds the provider cap.
- **From address:** something like `circulars@upidashboard.com` (subdomain `mail.upidashboard.com` is an option to isolate sender reputation).

---

## Tech decisions (2026-07-07)

- **Interactive server on Railway** (`server/`, Node + Hono, no build step)
  hosts the four real-time paths: subscribe, confirm, unsubscribe, Resend
  bounce/complaint webhook. Chosen over Supabase Edge Functions to keep one
  runtime (Node) across scripts and server; chosen over a VPS to stay managed.
- **Scheduled ingestion stays on GitHub Actions** — free (public repo),
  observable (issue notifications), queued concurrency, manual dispatch. The
  send-on-new-circular step will also live there, reading `circular_subscribers`.
- **Decision rule:** the server only gets paths that must respond to an
  external event in real time. Batch → Actions; reads → browser → Supabase.
- **Data:** `circular_subscribers` table (migration
  `supabase/migrations/add_circular_subscribers.sql`), RLS on with zero
  policies — service-role access only, first private table in the project.
- Setup runbook: [server/README.md](../server/README.md).

## Open questions

1. **Digest vs. per-circular emails** when a single ingestion run finds several circulars (NPCI sometimes publishes in bursts). Per-circular is simpler and keeps the PDF-attachment model clean; a digest is less noisy.
2. **Should full text be in the email body** or just summary + PDF? Full text makes very long emails (Gmail clips at ~102 KB); an excerpt + link may be the better default.
3. **Backfill welcome email** — when someone subscribes, do they get the latest circular immediately as a taste, or only future ones?
4. **Admin auth** — the dashboard is a static public site today; the admin view needs some form of gating (decide with tech plan).
5. **Rate/abuse protection** on the subscribe form (honeypot field vs. captcha).
