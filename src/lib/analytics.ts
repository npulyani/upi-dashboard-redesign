import type { PostHog } from "posthog-js";

// posthog-js is ~50KB gzip; load it dynamically so it stays out of the entry
// bundle and is skipped entirely when no key is configured.
let client: PostHog | null = null;

// Events fired while the dynamic import is in flight (e.g. the very first
// $pageview) are buffered and flushed once init completes.
let pending: Array<[string, Record<string, unknown> | undefined]> | null = [];

export async function initAnalytics() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.VITE_POSTHOG_KEY) {
    pending = null;
    return;
  }
  const { default: posthog } = await import("posthog-js");
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    person_profiles: "never",
    capture_performance: true,
  });
  client = posthog;
  for (const [event, props] of pending ?? []) client.capture(event, props);
  pending = null;
}

function capture(event: string, props?: Record<string, unknown>) {
  if (client) client.capture(event, props);
  else pending?.push([event, props]);
}

export const analytics = {
  pageView(path: string) {
    capture("$pageview", { path });
  },
  monthChanged(year: number, month: string, method: "scrubber" | "arrow_left" | "arrow_right") {
    capture("month_changed", { year, month, method });
  },
  metricToggled(metric: "volume" | "value") {
    capture("metric_toggled", { metric });
  },
  csvExported(year: number, month: string, rowCount: number) {
    capture("csv_exported", { year, month, row_count: rowCount });
  },
  appViewed(appName: string) {
    capture("app_viewed", { app_name: appName });
  },
  shareClicked(method: "clipboard" | "download", success: boolean) {
    capture("share_clicked", { method, success });
  },
  contextPageViewed() {
    capture("context_page_viewed", {});
  },
  circularsPageViewed() {
    capture("circulars_page_viewed", {});
  },
  circularSearchPerformed(queryType: "oc_number" | "keyword", query: string) {
    capture("circular_search_performed", { query_type: queryType, query });
  },
  circularYearFilterChanged(year: number | null) {
    capture("circular_year_filter_changed", { year: year ?? "all" });
  },
  circularOpened(ocNumber: string) {
    capture("circular_opened", { oc_number: ocNumber });
  },
  circularPdfViewed(ocNumber: string) {
    capture("circular_pdf_viewed", { oc_number: ocNumber });
  },
  circularSummaryViewed(ocNumber: string) {
    capture("circular_summary_viewed", { oc_number: ocNumber });
  },
  circularReferenceClicked(ocNumber: string, referencedOc: string) {
    capture("circular_reference_clicked", { oc_number: ocNumber, referenced_oc: referencedOc });
  },
  circularSubscribeOpened() {
    capture("circular_subscribe_opened", {});
  },
  // No PII in the event — just whether the POST to /api/subscribe succeeded.
  circularSubscribeSubmitted(success: boolean) {
    capture("circular_subscribe_submitted", { success });
  },
  newCircularsBannerClicked(count: number) {
    capture("new_circulars_banner_clicked", { count });
  },
};
