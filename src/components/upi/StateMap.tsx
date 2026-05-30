import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { StatewiseRow, MapMetric } from "@/lib/upi/types";
import { formatIndianNumber } from "@/lib/upi/queries";
import { calcPerCapita, calcSpendsPerCapita } from "@/lib/upi/population";

// Maps GeoJSON NAME_1 (uppercased) → NPCI state_union_territory name.
// Only entries that differ from the straight uppercase match are listed.
const GEO_TO_NPCI: Record<string, string> = {
  "ANDAMAN AND NICOBAR": "ANDAMAN & NICOBAR",
  "DADRA AND NAGAR HAVELI": "DADRA & NAGAR HAVELI & DAMAN & DIU",
  "DAMAN AND DIU": "DADRA & NAGAR HAVELI & DAMAN & DIU",
  "ORISSA": "ODISHA",
  "UTTARANCHAL": "UTTARAKHAND",
  // J&K and Ladakh are merged in old GeoJSON; map J&K to J&K only
  "JAMMU AND KASHMIR": "JAMMU AND KASHMIR",
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Sequential scale: light blue → deep indigo (volume / value mode)
const SEQ_MIN = { r: 219, g: 234, b: 254 }; // blue-100
const SEQ_MAX = { r: 30,  g: 58,  b: 138 }; // blue-900

// Diverging scale for per-capita: below-avg (warm grey) → above-avg (emerald)
const DIV_BELOW = { r: 229, g: 229, b: 229 }; // neutral-200
const DIV_ABOVE = { r: 5,   g: 150, b: 105 }; // emerald-600

function seqColor(value: number, min: number, max: number): string {
  if (max === min) return `rgb(${SEQ_MIN.r},${SEQ_MIN.g},${SEQ_MIN.b})`;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `rgb(${Math.round(lerp(SEQ_MIN.r, SEQ_MAX.r, t))},${Math.round(lerp(SEQ_MIN.g, SEQ_MAX.g, t))},${Math.round(lerp(SEQ_MIN.b, SEQ_MAX.b, t))})`;
}

function divColor(value: number, avg: number, maxDev: number): string {
  // t = 0 at or below avg, t = 1 at maxDev above avg
  if (value <= avg) {
    // grey scale: the further below, the darker the grey
    const t = maxDev > 0 ? Math.max(0, Math.min(1, (avg - value) / maxDev)) : 0;
    const shade = Math.round(lerp(229, 150, t)); // neutral-200 → neutral-400
    return `rgb(${shade},${shade},${shade})`;
  }
  const t = maxDev > 0 ? Math.max(0, Math.min(1, (value - avg) / maxDev)) : 0;
  return `rgb(${Math.round(lerp(DIV_BELOW.r, DIV_ABOVE.r, t))},${Math.round(lerp(DIV_BELOW.g, DIV_ABOVE.g, t))},${Math.round(lerp(DIV_BELOW.b, DIV_ABOVE.b, t))})`;
}

interface TooltipState {
  name: string;
  value: number;
  secondary: string;
  x: number;
  y: number;
}

interface StateMapProps {
  data: StatewiseRow[];
  mapMetric: MapMetric;
  populations?: Map<string, number>;
}

export function StateMap({ data, mapMetric, populations = new Map() }: StateMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Build lookup: NPCI name → row (handles regular and " Total" suffix months)
  const dataMap = useMemo(() => {
    const m = new Map<string, StatewiseRow>();
    const isGeo = (s: string) =>
      s.trim() !== "" &&
      !s.toLowerCase().includes("unclassified") &&
      !s.toLowerCase().includes("total");
    const statewiseRows = data.filter((r) => r.district === "" && isGeo(r.state_union_territory));
    const totalRows = data.filter(
      (r) =>
        r.district === "" &&
        r.state_union_territory.toLowerCase().endsWith(" total") &&
        !r.state_union_territory.toLowerCase().includes("unclassified"),
    );
    const source = statewiseRows.length > 0 ? statewiseRows : totalRows;
    for (const row of source) {
      const name = row.state_union_territory.replace(/ total$/i, "").trim();
      m.set(name, row);
    }
    return m;
  }, [data]);

  const isPerCapita = mapMetric === "txnsPerCapita" || mapMetric === "spendsPerCapita";

  // Per-capita values and national average (shared for both per-capita modes)
  const { perCapitaMap, nationalAvg, maxDev } = useMemo(() => {
    if (!isPerCapita || !populations.size) {
      return { perCapitaMap: new Map<string, number>(), nationalAvg: 0, maxDev: 0 };
    }
    const pcMap = new Map<string, number>();
    let totalNumerator = 0;
    let totalPop = 0;
    for (const [name, row] of dataMap) {
      const val =
        mapMetric === "txnsPerCapita"
          ? calcPerCapita(row.volume_in_mn, name, populations)
          : calcSpendsPerCapita(row.value_in_cr, name, populations);
      if (val !== null) {
        pcMap.set(name, val);
        totalNumerator += mapMetric === "txnsPerCapita" ? row.volume_in_mn : row.value_in_cr * 10;
        const pop = populations.get(name.trim().toUpperCase()) ?? 0;
        totalPop += pop;
      }
    }
    const avg = totalPop > 0 ? totalNumerator / totalPop : 0;
    const maxDeviation = Math.max(...Array.from(pcMap.values()).map((v) => Math.abs(v - avg)));
    return { perCapitaMap: pcMap, nationalAvg: avg, maxDev: maxDeviation };
  }, [dataMap, mapMetric, populations, isPerCapita]);

  const { min, max } = useMemo(() => {
    if (isPerCapita) return { min: 0, max: 0 };
    const values = Array.from(dataMap.values()).map((r) =>
      mapMetric === "volume" ? r.volume_in_mn : r.value_in_cr,
    );
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [dataMap, mapMetric]);

  function getRow(geoName: string): StatewiseRow | undefined {
    const npciName = GEO_TO_NPCI[geoName.toUpperCase()] ?? geoName.toUpperCase();
    return dataMap.get(npciName);
  }

  function getFill(geoName: string): string {
    const npciName = GEO_TO_NPCI[geoName.toUpperCase()] ?? geoName.toUpperCase();
    const row = dataMap.get(npciName);
    if (!row) return "#e5e7eb";
    if (isPerCapita) {
      const tpc = perCapitaMap.get(npciName);
      if (tpc === undefined) return "#e5e7eb";
      return divColor(tpc, nationalAvg, maxDev);
    }
    const value = mapMetric === "volume" ? row.volume_in_mn : row.value_in_cr;
    return seqColor(value, min, max);
  }

  function getTooltipSecondary(row: StatewiseRow, npciName: string): string {
    if (isPerCapita) {
      const val = perCapitaMap.get(npciName);
      if (val === undefined) return "No data";
      const pct = nationalAvg > 0 ? ((val - nationalAvg) / nationalAvg) * 100 : 0;
      const sign = pct >= 0 ? "+" : "";
      const avgLabel =
        mapMetric === "txnsPerCapita"
          ? nationalAvg.toFixed(2)
          : `₹${nationalAvg.toFixed(0)}`;
      return `${sign}${pct.toFixed(1)}% vs India avg (${avgLabel})`;
    }
    const contribution =
      mapMetric === "volume" ? row.volume_contribution : row.value_contribution;
    return `${contribution.toFixed(2)}% share`;
  }

  return (
    <div className="relative w-full h-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [82, 24], scale: 760 }}
        width={440}
        height={460}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography="/india-states.json">
          {({ geographies }) =>
            geographies.map((geo) => {
              const geoName: string = geo.properties.NAME_1 ?? "";
              const npciName = GEO_TO_NPCI[geoName.toUpperCase()] ?? geoName.toUpperCase();
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getFill(geoName)}
                  stroke="#ffffff"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", opacity: 0.85 },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={(e) => {
                    const row = getRow(geoName);
                    if (!row) return;
                    const value =
                      isPerCapita
                        ? (perCapitaMap.get(npciName) ?? 0)
                        : mapMetric === "volume"
                        ? row.volume_in_mn
                        : row.value_in_cr;
                    // Anchor tooltip to the state's visual center
                    const bbox = (e.target as SVGPathElement).getBoundingClientRect();
                    setTooltip({
                      name: row.state_union_territory,
                      value,
                      secondary: getTooltipSecondary(row, npciName),
                      x: bbox.left + bbox.width / 2,
                      y: bbox.top + bbox.height / 2,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border bg-popover px-3 py-2 shadow-md text-xs font-mono"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <p className="font-semibold text-foreground capitalize">
            {tooltip.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {mapMetric === "txnsPerCapita"
              ? `${tooltip.value.toFixed(3)} txns/person/month`
              : mapMetric === "spendsPerCapita"
              ? `₹${tooltip.value.toFixed(0)}/person/month`
              : mapMetric === "volume"
              ? `${tooltip.value.toFixed(2)} Mn txns`
              : `₹${formatIndianNumber(tooltip.value)} Cr`}
          </p>
          <p className="text-muted-foreground">{tooltip.secondary}</p>
        </div>
      )}

      {/* Legend */}
      {isPerCapita ? (
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">Below avg</span>
          <div
            className="h-2 w-20 rounded-full"
            style={{
              background: `linear-gradient(to right, rgb(${DIV_BELOW.r},${DIV_BELOW.g},${DIV_BELOW.b}), rgb(${DIV_ABOVE.r},${DIV_ABOVE.g},${DIV_ABOVE.b}))`,
            }}
          />
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">Above avg</span>
        </div>
      ) : (
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">Low</span>
          <div
            className="h-2 w-20 rounded-full"
            style={{
              background: `linear-gradient(to right, rgb(${SEQ_MIN.r},${SEQ_MIN.g},${SEQ_MIN.b}), rgb(${SEQ_MAX.r},${SEQ_MAX.g},${SEQ_MAX.b}))`,
            }}
          />
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">High</span>
        </div>
      )}
    </div>
  );
}
