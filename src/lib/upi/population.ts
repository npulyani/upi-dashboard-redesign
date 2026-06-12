import { supabase } from "../supabase";

// Caching is handled by React Query (populationsQuery in queryOptions.ts).
export async function getStatePopulations(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("upi_state_population")
    .select("state_union_territory, population_mn");

  if (error || !data) {
    console.error("Failed to fetch population data:", error);
    return new Map();
  }

  return new Map(
    data.map((r) => [r.state_union_territory as string, Number(r.population_mn)]),
  );
}

function resolveKey(stateName: string): string {
  return stateName.replace(/ total$/i, "").trim().toUpperCase();
}

/** Returns txns/person/month, or null if state is not in population lookup. */
export function calcPerCapita(
  volume_in_mn: number,
  stateName: string,
  populations: Map<string, number>,
): number | null {
  const pop = populations.get(resolveKey(stateName));
  if (!pop) return null;
  return volume_in_mn / pop;
}

/**
 * Returns ₹ spend per person per month, or null if state is not in lookup.
 * value_in_cr (crores) × 1e7 / (population_mn × 1e6) = value_in_cr × 10 / population_mn
 */
export function calcSpendsPerCapita(
  value_in_cr: number,
  stateName: string,
  populations: Map<string, number>,
): number | null {
  const pop = populations.get(resolveKey(stateName));
  if (!pop) return null;
  return (value_in_cr * 10) / pop;
}
