import { CircularRow } from "./types";

/**
 * Text utilities over the OCR'd circular body: title derivation, search-hit
 * snippets for the results list, and a block parser that turns the flat OCR
 * text into letterhead / subject / paragraph / list / table blocks for
 * readable rendering (see CircularTextView).
 */

// ── Title ─────────────────────────────────────────────────────────────────────
// Kept in sync with scripts/extractSubject.mjs (scripts/ isn't importable from
// src/ — separate Node/browser build contexts — so this is a deliberate
// duplication, same convention as parseOc). Used as a fallback for rows whose
// oc_name hasn't been backfilled yet.

const SUBJECT_LINE_RE = /^[ \t]*(?:subject|sub)(?:\.?[ \t]*:|\.|[ \t]+[-–—])[ \t]*(.+)$/im;
const SUBJECT_INLINE_RE = /\bsubject[ \t]*:[ \t]*([^\n]+)/i;
const SALUTATION_RE = /^[ \t]*(?:(?:dear|respected|sir|madam|sirs|madams)[ \t/,.&-]*)+$/i;
const SUBJECT_HEADING_RE = /^[ \t]*(?:subject|sub)[ \t]*[:.]?[ \t]*$/i;
const LIST_MARKER_RE = /^[ \t]*(?:\d{1,2}[.)]|[a-z][.)]|[ivx]+[.)])[ \t]+/i;
const NON_TITLE_RE = /^(to\b|all\b|members?\b|dear\b|respected\b|\d)|CIN:|www\.|@/i;

function cleanSubject(raw: string): string | null {
  const subject = raw
    .replace(/^[\s:.\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?<!\d)\.$/, "");
  if (subject.length < 12) return null;
  return subject.length > 200 ? subject.slice(0, 197).trimEnd() + "…" : subject;
}

export function deriveOcName(contentText: string | null | undefined): string | null {
  if (!contentText) return null;
  const head = contentText.slice(0, 3000);

  const line = head.match(SUBJECT_LINE_RE);
  if (line) return cleanSubject(line[1]);

  const inline = head.match(SUBJECT_INLINE_RE);
  if (inline) {
    const cut = inline[1].split(/\.[ \t]/, 1)[0];
    return cleanSubject(cut.length > 160 ? cut.slice(0, 160) : cut);
  }

  const lines = head.split("\n");
  const salutationIdx = lines.findIndex((l) => l.trim() && SALUTATION_RE.test(l));
  if (salutationIdx < 0) return null;

  const before = lines
    .slice(0, salutationIdx)
    .reverse()
    .find((l) => l.trim());
  if (before && before.trim().length <= 180 && !NON_TITLE_RE.test(before.trim())) {
    return cleanSubject(before);
  }

  let i = salutationIdx + 1;
  while (i < lines.length && (!lines[i].trim() || SUBJECT_HEADING_RE.test(lines[i]))) i++;
  const block: string[] = [];
  while (i < lines.length && lines[i].trim()) block.push(lines[i++].trim());
  const candidate = block
    .join(" ")
    .replace(LIST_MARKER_RE, "")
    .replace(/\s+\d{1,2}[.)]\s+/g, " · ");
  if (!candidate || candidate.length > 180) return null;
  return cleanSubject(candidate);
}

/** Display title for a circular: subject-derived name, then OCR ref, then file name. */
export function circularDisplayName(
  row: Pick<CircularRow, "oc_name" | "content_text" | "doc_reference" | "file_name">,
): string {
  return row.oc_name ?? deriveOcName(row.content_text) ?? row.doc_reference ?? row.file_name;
}

// ── Smart summary ─────────────────────────────────────────────────────────────

/**
 * Whether an action-item deadline string parses to a date in the future.
 * Deadlines are free text extracted verbatim from the circular ("by
 * 31.03.2025", "within 90 days") — only ones that parse as an actual date
 * get the urgency treatment; everything else (or no deadline) is muted.
 */
export function isFutureDeadline(deadline: string | null): boolean {
  if (!deadline) return false;
  const parsed = Date.parse(deadline);
  return Number.isFinite(parsed) && parsed > Date.now();
}

// ── Search snippets ───────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "what",
  "which",
  "how",
  "when",
  "where",
  "who",
  "does",
  "do",
  "did",
  "by",
  "from",
  "at",
  "as",
  "that",
  "this",
  "these",
  "those",
  "it",
  "be",
  "been",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",
  "must",
  "may",
  "all",
  "any",
  "there",
  "their",
  "about",
  "into",
  "not",
  "new",
]);

export interface SnippetPart {
  text: string;
  match: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A short window of the circular text around the first occurrence of any
 * significant query term, split into highlight/plain parts. Terms are crudely
 * de-suffixed (mandates → mandat…) so client highlighting roughly follows
 * MiniSearch's stemless prefix match. Null when nothing matches.
 */
export function deriveSnippet(
  contentText: string | null | undefined,
  term: string,
): SnippetPart[] | null {
  if (!contentText || !term.trim()) return null;
  const tokens = term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (tokens.length === 0) return null;

  const stems = tokens.map((t) => {
    const stem = t.replace(/(ing|ed|es|s)$/, "");
    return stem.length >= 3 ? stem : t;
  });
  const matcher = new RegExp(`\\b(?:${stems.map(escapeRegExp).join("|")})[a-z0-9]*`, "gi");

  const first = matcher.exec(contentText);
  if (!first) return null;

  // ~260-char window around the first hit, snapped to word boundaries.
  let start = Math.max(0, first.index - 90);
  let end = Math.min(contentText.length, start + 260);
  if (start > 0) start = contentText.indexOf(" ", start) + 1 || start;
  if (end < contentText.length) end = contentText.lastIndexOf(" ", end);
  const window = contentText.slice(start, end);

  const parts: SnippetPart[] = [];
  if (start > 0) parts.push({ text: "… ", match: false });
  let cursor = 0;
  matcher.lastIndex = 0;
  for (const m of window.matchAll(matcher)) {
    if (m.index > cursor) parts.push({ text: window.slice(cursor, m.index), match: false });
    parts.push({ text: m[0], match: true });
    cursor = m.index + m[0].length;
  }
  if (cursor < window.length) parts.push({ text: window.slice(cursor), match: false });
  if (end < contentText.length) parts.push({ text: " …", match: false });

  // OCR linebreaks read poorly in a one-line snippet.
  return parts.map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ") }));
}

// ── Block parser for readable rendering ──────────────────────────────────────

export type CircularBlock =
  | { kind: "letterhead"; text: string }
  | { kind: "subject"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; text: string };

const BLOCK_LIST_MARKER_RE = /^[ \t]*(?:\d{1,2}[.)]|[a-z][.)]|[ivx]{1,4}[.)]|[•▪◦o*\-–][ \t])/i;
// Runs of 3+ spaces mean the OCR preserved columnar/tabular alignment.
const COLUMNAR_RE = / {3,}/;

function classifyBody(block: string): CircularBlock {
  const lines = block.split("\n").filter((l) => l.trim());
  if (lines.some((l) => COLUMNAR_RE.test(l.trim()))) {
    return { kind: "table", text: block };
  }
  const markers = lines.filter((l) => BLOCK_LIST_MARKER_RE.test(l)).length;
  if (lines.length >= 2 && markers >= Math.ceil(lines.length * 0.6)) {
    // Merge wrapped continuation lines into the preceding item.
    const items: string[] = [];
    for (const line of lines) {
      if (BLOCK_LIST_MARKER_RE.test(line) || items.length === 0) items.push(line.trim());
      else items[items.length - 1] += ` ${line.trim()}`;
    }
    return { kind: "list", items };
  }
  return { kind: "paragraph", text: block };
}

/**
 * Splits the OCR'd body into render-ready blocks. Everything up to the
 * "Subject:" line (reference number, date, recipients, salutation) becomes a
 * single compact letterhead block; the rest is classified per paragraph.
 */
export function parseCircularBlocks(contentText: string): CircularBlock[] {
  const lines = contentText.split("\n");
  const subjectIdx = lines.findIndex((l) => SUBJECT_LINE_RE.test(l));

  const blocks: CircularBlock[] = [];
  let body = contentText;
  if (subjectIdx > 0) {
    const letterhead = lines.slice(0, subjectIdx).join("\n").trim();
    if (letterhead) blocks.push({ kind: "letterhead", text: letterhead });
    blocks.push({ kind: "subject", text: lines[subjectIdx].trim() });
    body = lines.slice(subjectIdx + 1).join("\n");
  }

  for (const raw of body.split(/\n{2,}/)) {
    const block = raw.replace(/\s+$/, "");
    if (!block.trim()) continue;
    blocks.push(classifyBody(block));
  }
  return blocks;
}
