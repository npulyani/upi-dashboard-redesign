import { memo, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  getAppDomain,
  getInitials,
  getInitialsColors,
} from "@/lib/upi/logos";

const srcIdxCache = new Map<string, number>();

type Props = {
  app: string;
  /** Logo domain from DB (upi_apps.logo_domain). Falls back to the logos.ts map, then initials. */
  domain?: string | null;
  size?: number;
  className?: string;
  rounded?: "full" | "md" | "lg";
};

/**
 * Renders an app logo by trying:
 *   1. Clearbit logo (square, hi-res) for the resolved domain
 *   2. Google s2 favicon for the resolved domain
 *   3. Initials placeholder tile (deterministic color)
 *
 * Domain resolution order: `domain` prop (from DB) → logos.ts map → no logo.
 */
export const AppLogo = memo(function AppLogo({ app, domain: domainProp, size = 28, className, rounded = "md" }: Props) {
  const domain = domainProp ?? getAppDomain(app);
  const sources = useMemo(() => {
    if (!domain) return [] as string[];
    return [
      `https://logo.clearbit.com/${domain}`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    ];
  }, [domain]);

  const cacheKey = domain ?? app;
  const [srcIdx, setSrcIdx] = useState(() => srcIdxCache.get(cacheKey) ?? 0);
  const failed = srcIdx >= sources.length;

  const radius =
    rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-xl" : "rounded-md";

  if (failed) {
    const { bg, fg } = getInitialsColors(app);
    const initials = getInitials(app);
    return (
      <div
        aria-label={app}
        role="img"
        className={cn(
          radius,
          "shrink-0 inline-flex items-center justify-center font-mono font-semibold uppercase select-none ring-1 ring-black/5",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: bg,
          color: fg,
          fontSize: Math.round(size * 0.38),
          letterSpacing: "0.02em",
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={sources[srcIdx]}
      alt={`${app} logo`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setSrcIdx((i) => {
        const next = i + 1;
        srcIdxCache.set(cacheKey, next);
        return next;
      })}
      className={cn(
        radius,
        "shrink-0 object-contain bg-white ring-1 ring-black/5",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
});
