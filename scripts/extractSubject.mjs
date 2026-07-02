/**
 * Extracts the subject/title from an OCR'd circular body — this becomes the
 * circular's human-readable name (npci_circulars.oc_name).
 *
 * Kept in sync with deriveOcName() in src/lib/upi/circularText.ts (scripts/
 * and src/ are separate Node/browser build contexts — deliberate duplication,
 * same convention as parseOc).
 *
 * Three strategies, in order of reliability:
 *  1. A line starting "Subject:" / "Sub:" / "Sub." — the standard letterhead
 *     form. A dash directly attached ("sub-member") is NOT a separator —
 *     that's a real UPI term.
 *  2. An inline "Subject: …" anywhere in the head, for the occasional OCR
 *     that flattens the letterhead onto one line ("sub." is excluded here:
 *     body text cites other circulars as "(Sub. …)").
 *  3. The bare title line next to the salutation ("Dear Sir/Madam," etc.) —
 *     many circulars carry no "Subject" prefix at all. The title usually
 *     follows the salutation but occasionally precedes it, so the line just
 *     above is tried first (recipient/date/address lines are rejected).
 *     A candidate that looks like a body paragraph is rejected, not truncated.
 */
const SUBJECT_LINE_RE = /^[ \t]*(?:subject|sub)(?:\.?[ \t]*:|\.|[ \t]+[-–—])[ \t]*(.+)$/im;
const SUBJECT_INLINE_RE = /\bsubject[ \t]*:[ \t]*([^\n]+)/i;
const SALUTATION_RE = /^[ \t]*(?:(?:dear|respected|sir|madam|sirs|madams)[ \t/,.&-]*)+$/i;
// A bare "Subject:" line with the actual titles on the following lines.
const SUBJECT_HEADING_RE = /^[ \t]*(?:subject|sub)[ \t]*[:.]?[ \t]*$/i;
const LIST_MARKER_RE = /^[ \t]*(?:\d{1,2}[.)]|[a-z][.)]|[ivx]+[.)])[ \t]+/i;
// Letterhead lines that are never the title: recipients, dates, addresses.
const NON_TITLE_RE = /^(to\b|all\b|members?\b|dear\b|respected\b|\d)|CIN:|www\.|@/i;

function clean(raw) {
  const subject = raw
    .replace(/^[\s:.\-–—]+/, "") // "Sub:- Guidelines" leaves a leading "- "
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?<!\d)\.$/, ""); // trailing period, but keep "Version 3.0"
  // Shorter than a real title — usually a truncated OCR ("Reminder on").
  if (subject.length < 12) return null;
  return subject.length > 200 ? subject.slice(0, 197).trimEnd() + "…" : subject;
}

export function extractSubject(contentText) {
  if (!contentText) return null;
  // The subject sits in the letterhead; don't match "Sub." references deep in the body.
  const head = contentText.slice(0, 3000);

  const line = head.match(SUBJECT_LINE_RE);
  if (line) return clean(line[1]);

  const inline = head.match(SUBJECT_INLINE_RE);
  if (inline) {
    // Flattened one-line OCR: the body runs on after the subject, so stop at
    // the first sentence boundary.
    const cut = inline[1].split(/\.[ \t]/, 1)[0];
    return clean(cut.length > 160 ? cut.slice(0, 160) : cut);
  }

  const lines = head.split("\n");
  const salutationIdx = lines.findIndex((l) => l.trim() && SALUTATION_RE.test(l));
  if (salutationIdx < 0) return null;

  // Title occasionally sits just above the salutation (after the recipient list).
  const before = lines
    .slice(0, salutationIdx)
    .reverse()
    .find((l) => l.trim());
  if (before && before.trim().length <= 180 && !NON_TITLE_RE.test(before.trim())) {
    return clean(before);
  }

  // Otherwise: first non-empty block after the salutation, skipping a bare
  // "Subject:" heading (whose titles then follow as a numbered list).
  let i = salutationIdx + 1;
  while (i < lines.length && (!lines[i].trim() || SUBJECT_HEADING_RE.test(lines[i]))) i++;
  const block = [];
  while (i < lines.length && lines[i].trim()) block.push(lines[i++].trim());
  const candidate = block
    .join(" ")
    .replace(LIST_MARKER_RE, "")
    .replace(/\s+\d{1,2}[.)]\s+/g, " · "); // "1. Foo 2. Bar" → "Foo · Bar"
  // Titles are short; a long candidate means we grabbed the opening body
  // paragraph of a subject-less circular — better no name than a wrong one.
  if (!candidate || candidate.length > 180) return null;
  return clean(candidate);
}
