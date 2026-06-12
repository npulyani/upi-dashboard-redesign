import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { AVAILABLE_MONTHS, LATEST_MONTH } from "@/lib/upi/queries";
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
  // year+month live in one state object so prev/next can use functional
  // updates — keeping every action referentially stable across renders.
  const [ym, setYm] = useState({ year: LATEST_MONTH.year, month: LATEST_MONTH.month });
  const [metric, setMetric] = useState<Metric>("volume");

  useEffect(() => {
    // ensure latest on mount
    setYm({ year: LATEST_MONTH.year, month: LATEST_MONTH.month });
  }, []);

  const setYear = useCallback((y: number) => setYm((c) => ({ ...c, year: y })), []);
  const setMonth = useCallback((m: string) => setYm((c) => ({ ...c, month: m })), []);
  const setMonthYear = useCallback((y: number, m: string) => setYm({ year: y, month: m }), []);

  const prevMonth = useCallback(() => {
    setYm((cur) => {
      const idx = AVAILABLE_MONTHS.findIndex(
        (m) => m.year === cur.year && m.month_num === MONTH_TO_NUM[cur.month],
      );
      if (idx > 0) {
        const prev = AVAILABLE_MONTHS[idx - 1];
        return { year: prev.year, month: prev.month };
      }
      return cur;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setYm((cur) => {
      const idx = AVAILABLE_MONTHS.findIndex(
        (m) => m.year === cur.year && m.month_num === MONTH_TO_NUM[cur.month],
      );
      if (idx >= 0 && idx < AVAILABLE_MONTHS.length - 1) {
        const next = AVAILABLE_MONTHS[idx + 1];
        return { year: next.year, month: next.month };
      }
      return cur;
    });
  }, []);

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
