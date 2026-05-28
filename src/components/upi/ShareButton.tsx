import { useRef, useState, cloneElement, ReactElement, isValidElement } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";

interface ShareButtonProps {
  /** The element whose ref will be captured for export */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Optional label override */
  label?: string;
}

export function ShareButton({ targetRef, label = "Share" }: ShareButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    if (!targetRef.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(targetRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-card")
          .trim() || "#ffffff",
      });
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        analytics.shareClicked("clipboard", true);
        toast.success("Copied to clipboard");
      } catch {
        // Fallback: download
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `upi-insight-${Date.now()}.png`;
        a.click();
        analytics.shareClicked("download", true);
        toast.success("Downloaded as PNG");
      }
    } catch (err) {
      analytics.shareClicked("clipboard", false);
      toast.error("Could not capture image");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-widest border border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-all disabled:opacity-50"
      title="Copy card as image"
    >
      {busy ? "…" : "↗"} {label}
    </button>
  );
}
