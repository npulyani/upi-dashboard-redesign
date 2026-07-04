import { Search } from "lucide-react";

export function CircularSearchBox({
  value,
  onChange,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Fired on first focus — used to prefetch the client-side search corpus. */
  onFocus?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 sm:gap-3 bg-foreground/[0.04] rounded-2xl sm:rounded-3xl px-4 sm:px-6 py-3 sm:py-4 ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-primary/40 transition-all">
        <Search className="size-4 sm:size-5 text-muted-foreground flex-shrink-0" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          placeholder="Search by circular name or keyword…"
          className="bg-transparent outline-none text-sm sm:text-lg w-full placeholder:text-muted-foreground"
        />
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground hidden sm:block">
        Matches the circular name and full text, or jump straight to a reference like{" "}
        <span className="font-mono">193</span> or <span className="font-mono">OC 193A</span>.
      </p>
    </div>
  );
}
