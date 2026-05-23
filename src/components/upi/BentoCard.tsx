import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BentoCard({
  className,
  children,
  tone = "light",
  delay = 0,
}: {
  className?: string;
  children: ReactNode;
  tone?: "light" | "primary" | "dark";
  delay?: number;
}) {
  const toneClass =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : tone === "dark"
        ? "bg-foreground text-background"
        : "bg-card text-card-foreground ring-1 ring-black/5";
  return (
    <div
      className={cn(
        "rounded-[28px] p-6 lg:p-8 animate-in-up",
        toneClass,
        className,
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
