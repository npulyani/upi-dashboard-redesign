import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { StatewiseRow, Metric } from "@/lib/upi/types";
import { formatIndianNumber } from "@/lib/upi/queries";

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

// Single-hue sequential scale: light blue → deep indigo
const MIN_COLOR = { r: 219, g: 234, b: 254 }; // blue-100
const MAX_COLOR = { r: 30, g: 58, b: 138 };   // blue-900

function valueToColor(value: number, min: number, max: number): string {
  if (max === min) return `rgb(${MIN_COLOR.r},${MIN_COLOR.g},${MIN_COLOR.b})`;
  const t = (value - min) / (max - min);
  const r = Math.round(lerp(MIN_COLOR.r, MAX_COLOR.r, t));
  const g = Math.round(lerp(MIN_COLOR.g, MAX_COLOR.g, t));
  const b = Math.round(lerp(MIN_COLOR.b, MAX_COLOR.b, t));
  return `rgb(${r},${g},${b})`;
}

interface TooltipState {
  name: string;
  value: number;
  contribution: number;
  x: number;
  y: number;
}

interface StateMapProps {
  data: StatewiseRow[];
  metric: Metric;
}

export function StateMap({ data, metric }: StateMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Build lookup: NPCI name → row.
  // For regular months (Apr 2023–Feb 2026): state_union_territory = "MAHARASHTRA"
  // For district months (Mar 2026+): state_union_territory = "MAHARASHTRA Total" — strip suffix.
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

  const { min, max } = useMemo(() => {
    const values = Array.from(dataMap.values()).map((r) =>
      metric === "volume" ? r.volume_in_mn : r.value_in_cr,
    );
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [dataMap, metric]);

  function getRow(geoName: string): StatewiseRow | undefined {
    const npciName = GEO_TO_NPCI[geoName.toUpperCase()] ?? geoName.toUpperCase();
    return dataMap.get(npciName);
  }

  function getFill(geoName: string): string {
    const row = getRow(geoName);
    if (!row) return "#e5e7eb"; // grey for missing
    const value = metric === "volume" ? row.volume_in_mn : row.value_in_cr;
    return valueToColor(value, min, max);
  }

  return (
    <div className="relative w-full h-full">
      {/* width/height set to India's Mercator bounding box so viewBox fits India exactly,
          preserveAspectRatio "meet" then scales correctly in any container size */}
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
                    setTooltip({
                      name: row.state_union_territory,
                      value: metric === "volume" ? row.volume_in_mn : row.value_in_cr,
                      contribution: metric === "volume" ? row.volume_contribution : row.value_contribution,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onMouseMove={(e) => {
                    if (tooltip) setTooltip((t) => t && { ...t, x: e.clientX, y: e.clientY });
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
          style={{ left: tooltip.x + 14, top: tooltip.y - 40 }}
        >
          <p className="font-semibold text-foreground capitalize">
            {tooltip.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {metric === "volume"
              ? `${tooltip.value.toFixed(2)} Mn txns`
              : `₹${formatIndianNumber(tooltip.value)} Cr`}
          </p>
          <p className="text-muted-foreground">
            {tooltip.contribution.toFixed(2)}% share
          </p>
        </div>
      )}

      {/* Colour legend */}
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">Low</span>
        <div
          className="h-2 w-20 rounded-full"
          style={{
            background: `linear-gradient(to right, rgb(${MIN_COLOR.r},${MIN_COLOR.g},${MIN_COLOR.b}), rgb(${MAX_COLOR.r},${MAX_COLOR.g},${MAX_COLOR.b}))`,
          }}
        />
        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">High</span>
      </div>
    </div>
  );
}
