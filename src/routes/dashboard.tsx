import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { DashboardProvider, useDashboard } from "@/components/upi/DashboardContext";
import { MetricToggle, MonthScrubber } from "@/components/upi/Controls";
import { analytics } from "@/lib/analytics";
import { allMonthsQuery } from "@/lib/upi/queryOptions";
import type { Metric } from "@/lib/upi/types";
import { KeyboardShortcutOverlay } from "@/components/upi/KeyboardShortcutOverlay";

export const Route = createFileRoute("/dashboard")({
  loader: ({ context }) => {
    // Warm the shared history cache without blocking navigation or SSR.
    // Client-only: a server-side prefetch would be discarded with the request.
    if (typeof window !== "undefined") {
      void context.queryClient.prefetchQuery(allMonthsQuery());
    }
  },
  head: () => ({
    meta: [
      { title: "State of UPI — Dashboard" },
      {
        name: "description",
        content:
          "Monthly transaction volume and value across India's UPI ecosystem, 2021–2026.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: DashboardLayout,
});

const TABS = [
  { name: "Overview", href: "/dashboard", key: "1" },
  { name: "Trends", href: "/dashboard/trends", key: "2" },
  { name: "All apps", href: "/dashboard/data", key: "3" },
  { name: "Year Review", href: "/dashboard/year", key: "4" },
  { name: "Spending", href: "/dashboard/spending", key: "5" },
] as const;

function DashboardLayout() {
  return (
    <DashboardProvider>
      <Shell />
    </DashboardProvider>
  );
}

function Shell() {
  const { year, month, metric, setMonthYear, setMetric, prevMonth, nextMonth } = useDashboard();

  const handleMonthChange = (y: number, m: string) => {
    analytics.monthChanged(y, m, "scrubber");
    setMonthYear(y, m);
  };

  const handleMetricChange = (m: Metric) => {
    analytics.metricToggled(m);
    setMetric(m);
  };
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowLeft") { e.preventDefault(); analytics.keyboardShortcutUsed("ArrowLeft", "prev_month"); analytics.monthChanged(year, month, "arrow_left"); prevMonth(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); analytics.keyboardShortcutUsed("ArrowRight", "next_month"); analytics.monthChanged(year, month, "arrow_right"); nextMonth(); }
      else if (e.key === "v" || e.key === "V") { analytics.keyboardShortcutUsed("v", "toggle_metric"); setMetric(metric === "volume" ? "value" : "volume"); }
      else if (e.key === "1") navigate({ to: "/dashboard" });
      else if (e.key === "2") navigate({ to: "/dashboard/trends" });
      else if (e.key === "3") navigate({ to: "/dashboard/data" });
      else if (e.key === "4") navigate({ to: "/dashboard/year" });
      else if (e.key === "5") navigate({ to: "/dashboard/spending" });
      else if (e.key === "?") setShortcutsOpen(true);
      else if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i]');
        input?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevMonth, nextMonth, metric, setMetric, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <KeyboardShortcutOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {/* Header */}
      <header className="border-b border-foreground/5 bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 pt-7 pb-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="size-2 rounded-full bg-primary animate-pulse" />
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Live Index · NPCI
                </span>
              </div>
              <Link to="/dashboard" className="font-serif text-4xl lg:text-5xl leading-none hover:opacity-80 transition-opacity">
                State of <em className="italic">UPI</em>
              </Link>
            </div>
            <nav className="hidden md:flex bg-foreground/[0.04] p-1 rounded-full text-sm font-medium ring-1 ring-black/5 overflow-x-auto">
              {TABS.map((t) => {
                const active =
                  t.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    to={t.href}
                    className={`px-4 py-2 rounded-full transition-all whitespace-nowrap ${
                      active
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Controls bar */}
          <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="flex-1">
              <MonthScrubber year={year} month={month} onChange={handleMonthChange} />
            </div>
            <MetricToggle metric={metric} onChange={handleMetricChange} />
          </div>

          {/* Mobile nav */}
          <nav className="md:hidden mt-4 flex gap-0.5 overflow-x-auto bg-foreground/[0.04] p-1 rounded-full text-xs font-medium ring-1 ring-black/5">
            {TABS.map((t) => {
              const active =
                t.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  to={t.href}
                  className={`flex-shrink-0 text-center px-3 py-2 rounded-full transition-all whitespace-nowrap ${
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {t.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 lg:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-foreground/5 mt-16">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Data: NPCI monthly reports · Jan 2021 — May 2026
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                aria-label="Keyboard shortcuts"
              >
                <kbd className="inline-flex items-center justify-center w-5 h-5 rounded border border-foreground/20 bg-foreground/5 text-[10px]">?</kbd>
                Shortcuts
              </button>
              <p className="font-mono text-[10px] text-muted-foreground">
                State of UPI &mdash; Made with{" "}
                <span aria-label="love">❤️</span>
                {", "}
                <span className="font-semibold" style={{ color: "#D4773A" }}>Claude</span>
                {" & "}
                <span className="font-semibold" style={{ color: "#E85D75" }}>Lovable</span>
                {" by "}
                <a
                  href="https://www.linkedin.com/in/nitinpulyani/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Nitin Pulyani
                </a>
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/80 leading-relaxed border-t border-foreground/5 pt-4">
            Disclaimer: This website is an independent, non-commercial project built using
            publicly available data published on the{" "}
            <a
              href="https://www.npci.org.in/what-we-do/upi/upi-ecosystem-statistics"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              NPCI website
            </a>
            . It is not affiliated with or endorsed by NPCI or any of the UPI apps listed.
          </p>
        </div>
      </footer>
    </div>
  );
}
