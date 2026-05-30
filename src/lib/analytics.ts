import posthog from "posthog-js";

export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    person_profiles: "never",
    capture_performance: true,
  });
}

export const analytics = {
  pageView(path: string) {
    posthog.capture("$pageview", { path });
  },
  monthChanged(year: number, month: string, method: "scrubber" | "arrow_left" | "arrow_right") {
    posthog.capture("month_changed", { year, month, method });
  },
  metricToggled(metric: "volume" | "value") {
    posthog.capture("metric_toggled", { metric });
  },
  csvExported(year: number, month: string, rowCount: number) {
    posthog.capture("csv_exported", { year, month, row_count: rowCount });
  },
  appViewed(appName: string) {
    posthog.capture("app_viewed", { app_name: appName });
  },
  shareClicked(method: "clipboard" | "download", success: boolean) {
    posthog.capture("share_clicked", { method, success });
  },
  keyboardShortcutUsed(key: string, action: string) {
    posthog.capture("keyboard_shortcut_used", { key, action });
  },
};
