import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { AVAILABLE_MONTHS, LATEST_MONTH } from "@/lib/upi/queries";
import { Metric, MONTH_TO_NUM } from "@/lib/upi/types";

type Ctx = {
  year: number;
  month: string;
  metric: Metric;
  setYear: (y: number) => void;
  setMonth: (m: string) => void;
  setMonthYear: (y: number, m: string) => void;
  setMetric: (m: Metric) => void;
  prevMonth: () => void;
  nextMonth: () => void;
};

const DashboardCtx = createContext<Ctx | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [year, setYear] = useState(LATEST_MONTH.year);
  const [month, setMonth] = useState(LATEST_MONTH.month);
  const [metric, setMetric] = useState<Metric>("volume");

  useEffect(() => {
    // ensure latest on mount
    setYear(LATEST_MONTH.year);
    setMonth(LATEST_MONTH.month);
  }, []);

  const prevMonth = useCallback(() => {
    const idx = AVAILABLE_MONTHS.findIndex(
      (m) => m.year === year && m.month_num === MONTH_TO_NUM[month],
    );
    if (idx > 0) {
      const prev = AVAILABLE_MONTHS[idx - 1];
      setYear(prev.year);
      setMonth(prev.month);
    }
  }, [year, month]);

  const nextMonth = useCallback(() => {
    const idx = AVAILABLE_MONTHS.findIndex(
      (m) => m.year === year && m.month_num === MONTH_TO_NUM[month],
    );
    if (idx >= 0 && idx < AVAILABLE_MONTHS.length - 1) {
      const next = AVAILABLE_MONTHS[idx + 1];
      setYear(next.year);
      setMonth(next.month);
    }
  }, [year, month]);

  return (
    <DashboardCtx.Provider
      value={{
        year,
        month,
        metric,
        setYear,
        setMonth,
        setMonthYear: (y, m) => {
          setYear(y);
          setMonth(m);
        },
        setMetric,
        prevMonth,
        nextMonth,
      }}
    >
      {children}
    </DashboardCtx.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardCtx);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
