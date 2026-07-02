import { useMemo } from "react";
import { parseCircularBlocks } from "@/lib/upi/circularText";

/**
 * Readable rendering of the OCR'd circular body: the letterhead (reference,
 * date, recipients, salutation) collapses into a compact mono block, the
 * subject line is emphasized, numbered/lettered lists get hanging indents,
 * and columnar OCR output stays monospaced so its alignment survives.
 */
export function CircularTextView({ text }: { text: string }) {
  const blocks = useMemo(() => parseCircularBlocks(text), [text]);

  return (
    <div className="max-w-prose">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "letterhead":
            return (
              <details key={i} className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer select-none py-1">
                  Letterhead and addressee block
                </summary>
                <pre className="mt-1 font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {block.text}
                </pre>
              </details>
            );
          case "subject":
            return (
              <p key={i} className="mt-5 text-sm font-semibold leading-relaxed">
                {block.text}
              </p>
            );
          case "list":
            return (
              <ul key={i} className="mt-4 space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed pl-6 -indent-6">
                    {item}
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <pre
                key={i}
                className="mt-4 font-mono text-xs whitespace-pre overflow-x-auto leading-relaxed"
              >
                {block.text}
              </pre>
            );
          default:
            return (
              <p key={i} className="mt-4 text-sm leading-relaxed whitespace-pre-line">
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}
