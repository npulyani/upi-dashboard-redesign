import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useAvailableMonths } from "@/lib/upi/hooks";
import { Metric, MONTH_TO_NUM } from "@/lib/upi/types";

type DashboardState = {
  year: number;
  month: string;
  metric: Metric;
};

type DashboardActions = {
  setYear: (y: number) => void;
  setMonth: (m: string) => void;
  setMonthYear: (y: number, m: string) => void;
  setMetric: (m: Metric) => void;
  prevMonth: () => void;
  nextMonth: () => void;
};

const DashboardStateCtx = createContext<DashboardState | null>(null);
const DashboardActionsCtx = createContext<DashboardActions | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { availableMonths, latestMonth } = useAvailableMonths();

  // year+month live in one state object so prev/next can use functional
  // updates — keeping every action referentially stable across renders.
  const [ym, setYm] = useState({ year: latestMonth.year, month: latestMonth.month });
  const [metric, setMetric] = useState<Metric>("volume");

  // The DB-driven latest month resolves asynchronously (starts from the
  // static fallback in useAvailableMonths). Keep tracking it as the default
  // selection only until the user actually touches the month controls —
  // afterwards their choice takes priority.
  const userTouchedRef = useRef(false);

  useEffect(() => {
    if (userTouchedRef.current) return;
    setYm({ year: latestMonth.year, month: latestMonth.month });
  }, [latestMonth.year, latestMonth.month]);

  const setYear = useCallback((y: number) => {
    userTouchedRef.current = true;
    setYm((c) => ({ ...c, year: y }));
  }, []);
  const setMonth = useCallback((m: string) => {
    userTouchedRef.current = true;
    setYm((c) => ({ ...c, month: m }));
  }, []);
  const setMonthYear = useCallback((y: number, m: string) => {
    userTouchedRef.current = true;
    setYm({ year: y, month: m });
  }, []);

  const prevMonth = useCallback(() => {
    userTouchedRef.current = true;
    setYm((cur) => {
      const idx = availableMonths.findIndex(
        (m) => m.year === cur.year && m.month_num === MONTH_TO_NUM[cur.month],
      );
      if (idx > 0) {
        const prev = availableMonths[idx - 1];
        return { year: prev.year, month: prev.month };
      }
      return cur;
    });
  }, [availableMonths]);

  const nextMonth = useCallback(() => {
    userTouchedRef.current = true;
    setYm((cur) => {
      const idx = availableMonths.findIndex(
        (m) => m.year === cur.year && m.month_num === MONTH_TO_NUM[cur.month],
      );
      if (idx >= 0 && idx < availableMonths.length - 1) {
        const next = availableMonths[idx + 1];
        return { year: next.year, month: next.month };
      }
      return cur;
    });
  }, [availableMonths]);

  const state = useMemo(
    () => ({ year: ym.year, month: ym.month, metric }),
    [ym.year, ym.month, metric],
  );

  const actions = useMemo(
    () => ({ setYear, setMonth, setMonthYear, setMetric, prevMonth, nextMonth }),
    [setYear, setMonth, setMonthYear, prevMonth, nextMonth],
  );

  return (
    <DashboardActionsCtx.Provider value={actions}>
      <DashboardStateCtx.Provider value={state}>{children}</DashboardStateCtx.Provider>
    </DashboardActionsCtx.Provider>
  );
}

export function useDashboardState() {
  const ctx = useContext(DashboardStateCtx);
  if (!ctx) throw new Error("useDashboardState must be used inside DashboardProvider");
  return ctx;
}

export function useDashboardActions() {
  const ctx = useContext(DashboardActionsCtx);
  if (!ctx) throw new Error("useDashboardActions must be used inside DashboardProvider");
  return ctx;
}

/** Compatibility hook: merged state + actions, memoized per consumer. */
export function useDashboard() {
  const state = useDashboardState();
  const actions = useDashboardActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
