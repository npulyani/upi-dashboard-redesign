import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { LATEST_MONTH } from "@/lib/upi/queries";
import { Metric } from "@/lib/upi/types";

type Ctx = {
  year: number;
  month: string;
  metric: Metric;
  setYear: (y: number) => void;
  setMonth: (m: string) => void;
  setMonthYear: (y: number, m: string) => void;
  setMetric: (m: Metric) => void;
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
