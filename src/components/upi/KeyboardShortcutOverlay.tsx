import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: ["←", "→"], description: "Navigate to previous / next month" },
  { keys: ["V"], description: "Toggle Volume / Value metric" },
  { keys: ["1"], description: "Go to Overview" },
  { keys: ["2"], description: "Go to Trends" },
  { keys: ["3"], description: "Go to Data" },
  { keys: ["4"], description: "Go to Year Review" },
  { keys: ["/"], description: "Focus search (Data page)" },
  { keys: ["?"], description: "Show this help" },
];

export function KeyboardShortcutOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <table className="w-full mt-2 text-sm">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.description} className="border-b border-foreground/5 last:border-0">
                <td className="py-2.5 pr-4">
                  <span className="flex gap-1.5">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded border border-foreground/20 bg-foreground/5 font-mono text-[11px]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </td>
                <td className="py-2.5 text-muted-foreground text-xs">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
