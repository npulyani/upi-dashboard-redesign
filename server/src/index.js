/**
 * Interactive server for upidashboard.com (Railway — see server/README.md).
 *
 * Owns the paths that need a held secret or an inbound webhook — everything
 * the static GitHub Pages build cannot do:
 *   POST /api/subscribe          subscribe form → pending row + confirm email
 *   GET  /api/confirm            double opt-in link from the confirm email
 *   GET  /api/unsubscribe        one-click link in every email footer
 *   POST /api/webhooks/resend    bounce/complaint events → status flips
 *   GET  /healthz                liveness check
 *
 * Batch work (ingest, OCR, summaries, the send-on-new-circular step) stays in
 * GitHub Actions; this server only answers real-time events. Reads for the
 * site keep going browser → Supabase directly — never proxy them through here.
 *
 * Local dev: `npm run dev` inside server/ (reads ../.env.local).
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { confirmationEmail, notificationEmail, welcomeEmail, escapeHtml } from "./emails.js";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
// Shared secret the ingest GitHub Action presents to /api/notify-circulars.
const NOTIFY_SECRET = process.env.NOTIFY_SECRET;
const SITE_URL = (process.env.SITE_URL ?? "https://upidashboard.com").replace(/\/$/, "");
// The URL this server is reachable at — used to build confirm/unsubscribe
// links in emails. On Railway: the generated (or custom) domain.
const PUBLIC_SERVER_URL = (process.env.PUBLIC_SERVER_URL ?? "").replace(/\/$/, "");
const MAIL_FROM = process.env.MAIL_FROM ?? "UPI Dashboard <circulars@mail.upidashboard.com>";
const PORT = Number(process.env.PORT ?? 8787);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!RESEND_API_KEY) console.warn("RESEND_API_KEY not set — confirmation emails will fail");
if (!PUBLIC_SERVER_URL) console.warn("PUBLIC_SERVER_URL not set — email links can't be built");
if (!NOTIFY_SECRET) console.warn("NOTIFY_SECRET not set — /api/notify-circulars is disabled");

// Node 20 lacks native WebSocket — same workaround as scripts/ and
// src/lib/supabase.ts. Realtime is never used here, but supabase-js
// constructs the client at startup and insists on a transport.
const wsImpl =
  typeof WebSocket !== "undefined" ? WebSocket : (await import("ws")).default;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: wsImpl },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanField(value, maxLen) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLen ? trimmed : null;
}

// In-memory per-IP limiter. Single Railway instance, low traffic — a Map is
// enough; restarts wiping it is acceptable.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const rateHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (rateHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateHits.set(ip, hits);
  return hits.length > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateHits) {
    if (hits.every((t) => now - t >= RATE_WINDOW_MS)) rateHits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

async function sendEmail({ to, subject, html, text, attachments, headers }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to,
      subject,
      html,
      text,
      ...(attachments?.length ? { attachments } : {}),
      ...(headers ? { headers } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Circulars created before this instant are back-catalog: never emailed, no
// matter how empty the send log is. Same epoch-floor pattern as the NEW badge.
const NOTIFY_EPOCH = "2026-07-08T00:00:00Z";

// Constant-time bearer check (hash both sides so lengths always match).
function bearerMatches(authorizationHeader, secret) {
  const token = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7) : "";
  return timingSafeEqual(
    createHash("sha256").update(token).digest(),
    createHash("sha256").update(secret).digest(),
  );
}

// Minimal standalone page for the confirm/unsubscribe links — they're opened
// from email clients, so they can't rely on the SPA being loaded.
function page({ title, body, status = 200 }) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · UPI Dashboard</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         display: grid; place-items: center; min-height: 100vh; margin: 0;
         background: #fafafa; color: #1a1a1a; }
  main { max-width: 420px; padding: 40px 32px; background: #fff; border: 1px solid #e5e5e5;
         border-radius: 12px; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { color: #555; line-height: 1.5; }
  a.btn { display: inline-block; margin-top: 16px; background: #1a1a1a; color: #fff;
          padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600; }
</style></head>
<body><main>${body}</main></body></html>`;
  return { html, status };
}

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: [
      SITE_URL,
      "https://www.upidashboard.com",
      // vite dev (8080 per vite.config), vite preview, legacy defaults
      "http://localhost:8080",
      "http://localhost:5173",
      "http://localhost:4173",
    ],
  }),
);

app.get("/healthz", (c) => c.json({ ok: true }));

// ---------------------------------------------------------------------------
// POST /api/subscribe
// ---------------------------------------------------------------------------
app.post("/api/subscribe", async (c) => {
  const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return c.json({ ok: false, error: "Too many requests — please try again later." }, 429);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "Invalid request body." }, 400);
  }

  // `website` is the honeypot field — hidden in the form, so any value means
  // a bot. Report success so the bot moves on.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return c.json({ ok: true });
  }

  const name = cleanField(body.name, 200);
  const company = cleanField(body.company, 200);
  const role = cleanField(body.role, 100);
  const emailRaw = cleanField(body.email, 320);
  const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw.toLowerCase() : null;
  if (!name || !company || !role || !email) {
    return c.json({ ok: false, error: "Please fill in all fields with a valid email." }, 400);
  }

  const { data: existing, error: lookupError } = await supabase
    .from("circular_subscribers")
    .select("id, status, token")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) {
    console.error("subscribe lookup failed:", lookupError.message);
    return c.json({ ok: false, error: "Something went wrong — please try again." }, 500);
  }

  // Already confirmed: report the same generic success (no email enumeration,
  // no way to spam a confirmed subscriber through the form).
  if (existing?.status === "confirmed") return c.json({ ok: true });

  let token;
  if (!existing) {
    const { data: inserted, error } = await supabase
      .from("circular_subscribers")
      .insert({ name, email, company, role })
      .select("token")
      .single();
    if (error) {
      console.error("subscribe insert failed:", error.message);
      return c.json({ ok: false, error: "Something went wrong — please try again." }, 500);
    }
    token = inserted.token;
  } else {
    // pending (resend confirm), unsubscribed or bounced (re-subscribe):
    // refresh details, rotate the token, back to pending.
    token = randomUUID();
    const { error } = await supabase
      .from("circular_subscribers")
      .update({ name, company, role, status: "pending", token, unsubscribed_at: null })
      .eq("id", existing.id);
    if (error) {
      console.error("subscribe update failed:", error.message);
      return c.json({ ok: false, error: "Something went wrong — please try again." }, 500);
    }
  }

  try {
    const confirmUrl = `${PUBLIC_SERVER_URL}/api/confirm?token=${token}`;
    if (!PUBLIC_SERVER_URL) throw new Error("PUBLIC_SERVER_URL not configured");
    await sendEmail({ to: email, ...confirmationEmail({ name, confirmUrl }) });
  } catch (err) {
    console.error("confirmation send failed:", err.message);
    return c.json(
      { ok: false, error: "Could not send the confirmation email — please try again." },
      500,
    );
  }

  return c.json({ ok: true });
});

// Welcome email on confirmation: a taste of the back catalog (the ongoing
// notify pipeline only mails circulars newer than NOTIFY_EPOCH, so without
// this a new subscriber's first real email could be weeks away).
async function sendWelcomeEmail(subscriber) {
  const { data: recent, error } = await supabase
    .from("npci_circulars")
    .select("oc_number, oc_name, doc_reference, file_name, doc_date, storage_path, summary")
    .eq("summary_status", "done")
    .order("doc_date", { ascending: false })
    .limit(3);
  if (error) throw new Error(`recent-circulars lookup failed: ${error.message}`);

  const circulars = recent.map((circ) => ({
    title: circ.oc_name ?? circ.doc_reference ?? circ.file_name,
    ocLabel: circ.oc_number ?? "NPCI circular",
    dateLabel: circ.doc_date
      ? new Date(`${circ.doc_date}T00:00:00Z`).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : null,
    tldr: circ.summary?.tldr ?? null,
    viewUrl: circ.oc_number
      ? `${SITE_URL}/dashboard/circulars/${encodeURIComponent(circ.oc_number)}`
      : `${SITE_URL}/dashboard/circulars`,
    // The circulars bucket is public — same URL shape the site itself uses.
    pdfUrl: circ.storage_path
      ? `${SUPABASE_URL}/storage/v1/object/public/circulars/${circ.storage_path.split("/").map(encodeURIComponent).join("/")}`
      : null,
  }));

  const unsubscribeUrl = `${PUBLIC_SERVER_URL}/api/unsubscribe?token=${subscriber.token}`;
  await sendEmail({
    to: subscriber.email,
    ...welcomeEmail({ name: subscriber.name, circulars, unsubscribeUrl }),
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/confirm?token=
// ---------------------------------------------------------------------------
app.get("/api/confirm", async (c) => {
  const token = c.req.query("token") ?? "";
  const invalid = page({
    title: "Link not valid",
    status: 400,
    body: `<h1>This link is no longer valid</h1>
      <p>It may have been superseded by a newer confirmation email, or the
      subscription was cancelled. You can subscribe again from the circulars page.</p>
      <a class="btn" href="${SITE_URL}/dashboard/circulars">Go to circulars</a>`,
  });
  if (!UUID_RE.test(token)) return c.html(invalid.html, invalid.status);

  const { data: sub, error } = await supabase
    .from("circular_subscribers")
    .select("id, status, name, email, token")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("confirm lookup failed:", error.message);
    return c.html(page({ title: "Error", body: "<h1>Something went wrong</h1><p>Please try the link again in a minute.</p>" }).html, 500);
  }
  if (!sub || sub.status === "unsubscribed" || sub.status === "bounced") {
    return c.html(invalid.html, invalid.status);
  }

  if (sub.status === "pending") {
    const { error: updateError } = await supabase
      .from("circular_subscribers")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", sub.id);
    if (updateError) {
      console.error("confirm update failed:", updateError.message);
      return c.html(page({ title: "Error", body: "<h1>Something went wrong</h1><p>Please try the link again in a minute.</p>" }).html, 500);
    }
    // One-time welcome email with the latest circulars. Only on the actual
    // pending → confirmed flip (re-clicks skip this branch), and best-effort:
    // a failure here must not break the confirmation page.
    try {
      await sendWelcomeEmail(sub);
    } catch (err) {
      console.error("welcome email failed:", err.message);
    }
  }

  // Re-clicks land here too (status already 'confirmed') — same success page.
  const ok = page({
    title: "Subscribed",
    body: `<h1>✅ You're subscribed!</h1>
      <p>You'll get every new NPCI circular by email — summary, full text and
      the original PDF.</p>
      <a class="btn" href="${SITE_URL}/dashboard/circulars">Browse circulars</a>`,
  });
  return c.html(ok.html, ok.status);
});

// ---------------------------------------------------------------------------
// GET /api/unsubscribe?token=
// ---------------------------------------------------------------------------
// Shared by the GET link (renders a page) and the RFC 8058 one-click POST
// (mail clients hit it headlessly, expect a bare 2xx). Returns
// 'ok' | 'invalid' | 'error'.
async function unsubscribeByToken(token) {
  if (!UUID_RE.test(token)) return "invalid";
  const { data: sub, error } = await supabase
    .from("circular_subscribers")
    .select("id, status")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("unsubscribe lookup failed:", error.message);
    return "error";
  }
  if (!sub) return "invalid";
  if (sub.status !== "unsubscribed") {
    const { error: updateError } = await supabase
      .from("circular_subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
      .eq("id", sub.id);
    if (updateError) {
      console.error("unsubscribe update failed:", updateError.message);
      return "error";
    }
  }
  return "ok";
}

app.post("/api/unsubscribe", async (c) => {
  const result = await unsubscribeByToken(c.req.query("token") ?? "");
  if (result === "error") return c.json({ ok: false }, 500);
  return c.json({ ok: result === "ok" }, result === "ok" ? 200 : 400);
});

app.get("/api/unsubscribe", async (c) => {
  const result = await unsubscribeByToken(c.req.query("token") ?? "");
  if (result === "invalid") {
    const invalid = page({
      title: "Link not valid",
      status: 400,
      body: `<h1>This link is not valid</h1>
        <p>If you're trying to unsubscribe, use the link from the most recent
        email — or write to us and we'll remove you manually.</p>`,
    });
    return c.html(invalid.html, invalid.status);
  }
  if (result === "error") {
    return c.html(page({ title: "Error", body: "<h1>Something went wrong</h1><p>Please try the link again in a minute.</p>" }).html, 500);
  }

  const ok = page({
    title: "Unsubscribed",
    body: `<h1>You're unsubscribed</h1>
      <p>You won't receive any more circular emails. Your details are no longer
      used for sends; write to us if you'd like them deleted entirely.</p>
      <a class="btn" href="${SITE_URL}/dashboard/circulars">Back to circulars</a>`,
  });
  return c.html(ok.html, ok.status);
});

// ---------------------------------------------------------------------------
// POST /api/notify-circulars — email confirmed subscribers about new circulars
// ---------------------------------------------------------------------------
// Called unconditionally at the end of every ingest run: GitHub Actions owns
// *when*, this endpoint owns *how to email people*. Pull-based and
// self-healing — it finds summarized circulars past NOTIFY_EPOCH lacking a
// send-log row per subscriber, so re-calls resume interrupted sends without
// duplicating delivered mail. Body { "dry_run": true } previews without
// sending. Auth: Authorization: Bearer <NOTIFY_SECRET>.
app.post("/api/notify-circulars", async (c) => {
  if (!NOTIFY_SECRET) return c.json({ ok: false, error: "Notify not configured." }, 503);
  if (!bearerMatches(c.req.header("authorization"), NOTIFY_SECRET)) {
    return c.json({ ok: false, error: "Unauthorized." }, 401);
  }
  const dryRun = (await c.req.json().catch(() => ({}))).dry_run === true;

  const [circularsRes, subscribersRes] = await Promise.all([
    supabase
      .from("npci_circulars")
      .select("id, oc_number, oc_name, doc_reference, file_name, doc_date, storage_path, content_text, summary")
      .eq("summary_status", "done")
      .gte("created_at", NOTIFY_EPOCH)
      .order("id", { ascending: true }),
    supabase.from("circular_subscribers").select("id, email, token").eq("status", "confirmed"),
  ]);
  if (circularsRes.error || subscribersRes.error) {
    console.error("notify lookup failed:", (circularsRes.error ?? subscribersRes.error).message);
    return c.json({ ok: false, error: "Lookup failed." }, 500);
  }
  const circulars = circularsRes.data;
  const subscribers = subscribersRes.data;
  if (circulars.length === 0 || subscribers.length === 0) {
    return c.json({ ok: true, dry_run: dryRun, circulars: [], totals: { sent: 0, failed: 0, skipped: 0 } });
  }

  const { data: sentLog, error: logError } = await supabase
    .from("circular_notifications")
    .select("circular_id, subscriber_id")
    .in("circular_id", circulars.map((circ) => circ.id));
  if (logError) {
    console.error("notify send-log lookup failed:", logError.message);
    return c.json({ ok: false, error: "Send-log lookup failed." }, 500);
  }
  const alreadySent = new Set(sentLog.map((row) => `${row.circular_id}:${row.subscriber_id}`));

  const report = [];
  const totals = { sent: 0, failed: 0, skipped: 0 };
  for (const circular of circulars) {
    const pending = subscribers.filter((s) => !alreadySent.has(`${circular.id}:${s.id}`));
    const entry = {
      oc_number: circular.oc_number ?? circular.file_name,
      recipients: pending.length,
      sent: 0,
      failed: 0,
      skipped: subscribers.length - pending.length,
    };
    totals.skipped += entry.skipped;
    report.push(entry);
    if (pending.length === 0 || dryRun) continue;

    // One storage download per circular; skip the attachment (the view link
    // stays) if the PDF would push the message past Resend's 40 MB cap.
    let attachments;
    if (circular.storage_path) {
      const { data: blob, error: dlError } = await supabase.storage
        .from("circulars")
        .download(circular.storage_path);
      if (dlError) {
        console.error(`notify: PDF download failed for ${entry.oc_number}:`, dlError.message);
      } else if (blob.size <= 35 * 1024 * 1024) {
        attachments = [
          {
            filename: circular.file_name ?? `${circular.oc_number}.pdf`,
            content: Buffer.from(await blob.arrayBuffer()).toString("base64"),
          },
        ];
      }
    }
    const viewUrl = circular.oc_number
      ? `${SITE_URL}/dashboard/circulars/${encodeURIComponent(circular.oc_number)}`
      : `${SITE_URL}/dashboard/circulars`;

    for (const subscriber of pending) {
      const unsubscribeUrl = `${PUBLIC_SERVER_URL}/api/unsubscribe?token=${subscriber.token}`;
      try {
        const { id: resendId } = await sendEmail({
          to: subscriber.email,
          ...notificationEmail({ circular, summary: circular.summary, viewUrl, unsubscribeUrl }),
          attachments,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        const { error: insertError } = await supabase
          .from("circular_notifications")
          .insert({ circular_id: circular.id, subscriber_id: subscriber.id, resend_id: resendId });
        // A failed log insert after a successful send risks a duplicate next
        // run — log loudly; that's the safe side of at-least-once.
        if (insertError) console.error("notify: send-log insert failed:", insertError.message);
        entry.sent += 1;
        totals.sent += 1;
      } catch (err) {
        console.error(`notify: send to ${subscriber.email} failed:`, err.message);
        entry.failed += 1;
        totals.failed += 1;
      }
      await sleep(600); // Resend free tier allows 2 requests/second
    }
  }

  return c.json({ ok: totals.failed === 0, dry_run: dryRun, circulars: report, totals });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/resend — bounce/complaint events (svix-signed)
// ---------------------------------------------------------------------------
app.post("/api/webhooks/resend", async (c) => {
  if (!RESEND_WEBHOOK_SECRET) {
    console.error("webhook received but RESEND_WEBHOOK_SECRET is not set");
    return c.json({ ok: false, error: "Webhook not configured." }, 503);
  }

  const payload = await c.req.text();
  let event;
  try {
    event = new Webhook(RESEND_WEBHOOK_SECRET).verify(payload, {
      "svix-id": c.req.header("svix-id") ?? "",
      "svix-timestamp": c.req.header("svix-timestamp") ?? "",
      "svix-signature": c.req.header("svix-signature") ?? "",
    });
  } catch {
    return c.json({ ok: false, error: "Invalid signature." }, 401);
  }

  // v1 keeps this coarse: any bounce or spam complaint flips the subscriber
  // to 'bounced' so sends stop. Distinguishing hard/soft bounces can come
  // later if soft bounces turn out to matter.
  if (event.type === "email.bounced" || event.type === "email.complained") {
    const to = event.data?.to;
    const emails = (Array.isArray(to) ? to : [to])
      .filter((e) => typeof e === "string")
      .map((e) => e.toLowerCase());
    if (emails.length > 0) {
      const { error } = await supabase
        .from("circular_subscribers")
        .update({ status: "bounced", last_event_at: new Date().toISOString() })
        .in("email", emails)
        .neq("status", "unsubscribed");
      if (error) {
        console.error("webhook status update failed:", error.message);
        return c.json({ ok: false }, 500); // non-2xx → Resend retries
      }
      console.log(`${event.type}: marked bounced —`, emails.join(", "));
    }
  }

  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`server listening on :${info.port}`);
});
