/**
 * Parses an NPCI "OC" (operating circular) reference out of free text.
 * Used against both file_name (fetch-time, before OCR) and doc_reference
 * (OCR-time, the authoritative reference extracted from the PDF body).
 *
 * The separator class between "OC"/"No" and the digits covers every real
 * NPCI format observed in production: whitespace ("OC No. 96"), hyphen
 * ("OC-100", "OC-15A"), slash ("OC/76"), and period ("OC.121"). The suffix
 * letter is captured only when it directly follows the digits (optionally
 * across one space or dash) AND is not the start of a word — so
 * "OC 156 - Online Business" yields "OC 156", not "OC 156O".
 *
 * Deliberately does NOT match:
 *  - "OC/PD/001" style product-compliance refs (no digit immediately
 *    reachable after OC — "P" blocks it, correctly)
 *  - pre-2016/17 "Circular no.NN" refs (no "OC" token at all)
 *  - general notices with no circular-style reference
 */
export function parseOc(text) {
  const m = String(text ?? "").match(
    /\bOC[\s.\-/]*(?:No\.?)?[\s.\-/]*(\d{1,4})[\s-]?([A-Za-z])?(?![A-Za-z])/i,
  );
  if (!m) return { oc_number: null, oc_base: null };
  const base = `OC ${m[1]}`;
  const suffix = m[2] ? m[2].toUpperCase() : "";
  return { oc_number: `${base}${suffix}`, oc_base: base };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cases = [
    ["NPCI/UPI/OC No. 96/2020-21", "OC 96"],
    ["NPCI/UPI/OC-100/2020-21", "OC 100"],
    ["NPCI/UPI/OC-97/2020-21", "OC 97"],
    ["NPCI/UPI/OC-15A/2016-17", "OC 15A"],
    ["NPCI/UPI/OC- 82/2019-20", "OC 82"],
    ["NPCI/UPI/2019-20/OC/76", "OC 76"],
    ["NPCI/UPI/2021-22/OC.121", "OC 121"],
    ["NPCI/UPI/OC No.94A/2020-21", "OC 94A"],
    ["NPCI/IMPS/UPI /OC No 99/2020-21", "OC 99"],
    ["NPCI/UPI/OC No.13/2016-17", "OC 13"],
    ["OC 156 - Online Business", "OC 156"],
    ["NPCI/2022-23/OC/PD/001", null],
    ["NPCI/2025-26/PD/001", null],
    ["NPCI:2016-17:UPI:Circular no.02", null],
    ["NPCI/2021-22/GEN/007", null],
    ["Circular 96 - Merchant Ecosystem Enhancements & Introduction of B2B as a Separate Category", null],
  ];
  let fail = 0;
  for (const [input, expected] of cases) {
    const got = parseOc(input).oc_number;
    if (got !== expected) {
      fail++;
      console.error(`FAIL ${input} -> ${got}, want ${expected}`);
    }
  }
  console.log(fail ? `${fail} failure(s)` : `${cases.length} cases OK`);
  process.exit(fail ? 1 : 0);
}
