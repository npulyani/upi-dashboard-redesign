/**
 * Email templates for the subscription flows. Kept as plain template strings —
 * no React Email until there's a reason. The circular-notification email
 * itself is NOT here: it's sent by the ingest pipeline in GitHub Actions,
 * which only shares the DB with this server, not code.
 */

const footerNote =
  "You're receiving this because you asked to subscribe to NPCI circular " +
  "updates on upidashboard.com. We only use your details to send you new " +
  "circulars — no sharing, no selling.";

export function confirmationEmail({ name, confirmUrl }) {
  const subject = "Confirm your subscription to NPCI circular updates";
  const text = [
    `Hi ${name},`,
    "",
    "Click the link below to confirm your subscription. You'll then get every",
    "new NPCI circular by email — summary, full text and the original PDF.",
    "",
    confirmUrl,
    "",
    "If you didn't request this, ignore this email and nothing will happen.",
    "",
    footerNote,
  ].join("\n");
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
  <h2 style="font-size: 18px;">Confirm your subscription</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Click the button below to confirm your subscription. You'll then get every
  new NPCI circular by email — summary, full text and the original PDF.</p>
  <p style="margin: 28px 0;">
    <a href="${confirmUrl}" style="background: #1a1a1a; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
      Confirm subscription
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">Or paste this link into your browser:<br>
  <a href="${confirmUrl}">${confirmUrl}</a></p>
  <p style="font-size: 13px; color: #666;">If you didn't request this, ignore this email and nothing will happen.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">
  <p style="font-size: 12px; color: #888;">${footerNote}</p>
</div>`;
  return { subject, html, text };
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
