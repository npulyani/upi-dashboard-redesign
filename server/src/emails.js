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

/**
 * Notification email for one new circular. `summary` is the jsonb written by
 * scripts/summarize_npci_circulars.mjs: { tldr, category, audience,
 * effective_date, action_items[{action, owner, deadline}], references,
 * supersedes_note }. Full text goes in the body per the locked decision in
 * docs/circulars-email-subscription-plan.md (Gmail may clip very long ones —
 * accepted; the "View on upidashboard.com" link is always above the fold).
 */
export function notificationEmail({ circular, summary, viewUrl, unsubscribeUrl }) {
  const title = circular.oc_name ?? circular.doc_reference ?? circular.file_name;
  const dateLabel = circular.doc_date
    ? new Date(`${circular.doc_date}T00:00:00Z`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const subject = circular.oc_number
    ? `New NPCI circular — ${circular.oc_number}: ${title}`
    : `New NPCI circular: ${title}`;

  const actionLinesText = (summary?.action_items ?? []).map(
    (item) => `- ${item.action} (${item.owner}${item.deadline ? `, by ${item.deadline}` : ""})`,
  );
  const ocLabel = circular.oc_number ?? "NPCI circular";
  const text = [
    `${ocLabel}${dateLabel ? ` · ${dateLabel}` : ""}`,
    title,
    "",
    "SUMMARY",
    summary?.tldr ?? "(no summary available)",
    ...(summary?.effective_date ? ["", `Effective: ${summary.effective_date}`] : []),
    ...(actionLinesText.length ? ["", "Action items:", ...actionLinesText] : []),
    ...(summary?.supersedes_note ? ["", summary.supersedes_note] : []),
    "",
    `View on upidashboard.com: ${viewUrl}`,
    "",
    "FULL TEXT",
    circular.content_text ?? "",
    "",
    "—",
    footerNote,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const actionRowsHtml = (summary?.action_items ?? [])
    .map(
      (item) => `
    <tr>
      <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escapeHtml(item.action)}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #eee; white-space: nowrap;">${escapeHtml(item.owner)}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #eee; white-space: nowrap;">${escapeHtml(item.deadline ?? "—")}</td>
    </tr>`,
    )
    .join("");
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a1a;">
  <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #888;">UPI Dashboard — New NPCI Circular</p>
  <p style="font-size: 13px; color: #666; margin: 0;">${escapeHtml(ocLabel)}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ""}${summary?.category ? ` · ${escapeHtml(summary.category)}` : ""}</p>
  <h2 style="font-size: 20px; margin: 6px 0 16px;">${escapeHtml(title)}</h2>

  <h3 style="font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase; color: #888; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px;">Summary</h3>
  <p style="line-height: 1.55;">${escapeHtml(summary?.tldr ?? "(no summary available)")}</p>
  ${summary?.effective_date ? `<p style="font-size: 14px;"><strong>Effective:</strong> ${escapeHtml(summary.effective_date)}</p>` : ""}
  ${
    actionRowsHtml
      ? `<table style="border-collapse: collapse; font-size: 14px; width: 100%;">
    <tr>
      <th align="left" style="padding: 6px 10px; border-bottom: 2px solid #ddd;">Action</th>
      <th align="left" style="padding: 6px 10px; border-bottom: 2px solid #ddd;">Owner</th>
      <th align="left" style="padding: 6px 10px; border-bottom: 2px solid #ddd;">Deadline</th>
    </tr>${actionRowsHtml}
  </table>`
      : ""
  }
  ${summary?.supersedes_note ? `<p style="font-size: 13px; color: #666;">${escapeHtml(summary.supersedes_note)}</p>` : ""}

  <p style="margin: 24px 0;">
    <a href="${viewUrl}" style="background: #1a1a1a; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
      View on upidashboard.com
    </a>
  </p>

  <h3 style="font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase; color: #888; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px;">Full text</h3>
  <div style="font-size: 13px; line-height: 1.6; color: #333; white-space: pre-wrap;">${escapeHtml(circular.content_text ?? "")}</div>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">
  <p style="font-size: 12px; color: #888;">${footerNote}<br>
  <a href="${unsubscribeUrl}" style="color: #888;">Unsubscribe</a> — one click, effective immediately.</p>
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
