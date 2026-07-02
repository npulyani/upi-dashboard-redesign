import { Search } from "lucide-react";

export function CircularSearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 bg-foreground/[0.04] rounded-3xl px-6 py-4 ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-primary/40 transition-all">
        <Search className="size-5 text-muted-foreground flex-shrink-0" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='Ask in plain English — "volume cap for third party apps"…'
          className="bg-transparent outline-none text-lg w-full placeholder:text-muted-foreground"
        />
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Searches the full text of every circular — describe a topic in your own words, or jump
        straight to a reference like <span className="font-mono">193</span> or{" "}
        <span className="font-mono">OC 193A</span>.
      </p>
    </div>
  );
}
