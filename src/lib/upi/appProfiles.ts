import localProfiles from "./upi-app-profiles.json";

export interface AppFeatures {
  upi_lite: boolean;
  autopay: boolean;
  rupay_credit: boolean;
  international: boolean;
  upi_circle: boolean;
}

export interface AppProfile {
  app: string;
  parent: string;
  type: string;
  launched: string;
  hq: string;
  psp_banks: string[];
  play_store_rating: number;
  play_store_installs: string;
  blurb: string;
  features: AppFeatures;
}

const PROFILES = localProfiles as AppProfile[];

export function getAppProfile(appName: string): AppProfile | null {
  return PROFILES.find((p) => p.app === appName) ?? null;
}

export const FEATURE_LABELS: Record<keyof AppFeatures, string> = {
  upi_lite: "UPI Lite",
  autopay: "Autopay",
  rupay_credit: "RuPay credit",
  international: "International UPI",
  upi_circle: "UPI Circle",
};
