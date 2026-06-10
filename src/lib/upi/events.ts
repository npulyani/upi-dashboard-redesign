import { supabase } from "../supabase";
import { MONTHS } from "./types";
import localEvents from "./market-events.json";

export type EventCategory = "regulatory" | "corporate" | "product" | "policy";

export interface MarketEvent {
  /** ISO date, e.g. "2024-01-31" */
  event_date: string;
  title: string;
  description: string;
  category: EventCategory;
  apps_affected: string[];
  source: string;
}

const LOCAL_EVENTS = localEvents as MarketEvent[];

let eventsCache: Promise<MarketEvent[]> | null = null;

/**
 * Curated market events. Reads the market_events table when present so events
 * can be updated between deploys; falls back to the bundled JSON otherwise.
 */
export function getMarketEvents(): Promise<MarketEvent[]> {
  if (!eventsCache) {
    eventsCache = (async () => {
      const { data, error } = await supabase
        .from("market_events")
        .select("event_date, title, description, category, apps_affected, source")
        .order("event_date", { ascending: true });
      if (error || !data?.length) return LOCAL_EVENTS;
      return data as MarketEvent[];
    })().catch(() => LOCAL_EVENTS);
  }
  return eventsCache;
}

/** Chart month label for an event, matching trend rows: "Jan '24" */
export function eventMonthLabel(e: MarketEvent): string {
  const [y, m] = e.event_date.split("-").map(Number);
  return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
}

/** Display date, e.g. "31 Jan 2024" */
export function eventDateDisplay(e: MarketEvent): string {
  const [y, m, d] = e.event_date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const EVENT_CATEGORY_COLORS: Record<EventCategory, string> = {
  regulatory: "var(--color-chart-2)",
  corporate: "var(--color-chart-4)",
  product: "var(--color-chart-3)",
  policy: "var(--color-chart-5)",
};
