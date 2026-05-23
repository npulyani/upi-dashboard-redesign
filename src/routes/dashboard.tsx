import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { DashboardProvider, useDashboard } from "@/components/upi/DashboardContext";
import { MetricToggle, MonthScrubber } from "@/components/upi/Controls";

export const Route = createFileRoute("/dashboard")({
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
  { name: "Overview", href: "/dashboard" },
  { name: "Trends", href: "/dashboard/trends" },
  { name: "Data", href: "/dashboard/data" },
] as const;

function DashboardLayout() {
  return (
    <DashboardProvider>
      <Shell />
    </DashboardProvider>
  );
}

function Shell() {
  const { year, month, metric, setMonthYear, setMetric } = useDashboard();
  const pathname = useLocation({ select: (l) => l.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
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
              <h1 className="font-serif text-4xl lg:text-5xl leading-none">
                State of <em className="italic">UPI</em>
              </h1>
            </div>
            <nav className="hidden md:flex bg-foreground/[0.04] p-1 rounded-full text-sm font-medium ring-1 ring-black/5">
              {TABS.map((t) => {
                const active =
                  t.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    to={t.href}
                    className={`px-5 py-2 rounded-full transition-all ${
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
              <MonthScrubber year={year} month={month} onChange={setMonthYear} />
            </div>
            <MetricToggle metric={metric} onChange={setMetric} />
          </div>

          {/* Mobile nav */}
          <nav className="md:hidden mt-4 flex bg-foreground/[0.04] p-1 rounded-full text-xs font-medium ring-1 ring-black/5">
            {TABS.map((t) => {
              const active =
                t.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  to={t.href}
                  className={`flex-1 text-center px-3 py-2 rounded-full transition-all ${
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
              Data: NPCI monthly reports · Jan 2021 — Mar 2026
            </p>
            <p className="font-serif italic text-sm text-muted-foreground">
              State of UPI — an editorial dashboard
            </p>
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
