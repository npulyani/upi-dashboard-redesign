// Curated map of UPI app names to their primary web domain.
// Used by <AppLogo /> to fetch a favicon/logo from Google's s2 service or
// Clearbit. Unmapped apps fall back to a generated initials tile.

export const APP_DOMAINS: Record<string, string> = {
  // Top consumer apps
  "PhonePe": "phonepe.com",
  "Google Pay": "pay.google.com",
  "Paytm": "paytm.com",
  "Navi": "navi.com",
  "super.money": "super.money",
  "BHIM": "bhimupi.org.in",
  "FamPay": "fampay.in",
  "CRED": "cred.club",
  "WhatsApp": "whatsapp.com",
  "Amazon Pay": "amazon.in",
  "MobiKwik": "mobikwik.com",
  "Slice": "sliceit.com",
  "Samsung Pay": "samsung.com",
  "Groww": "groww.in",
  "Bajaj Finserv": "bajajfinserv.in",
  "POP UPI": "popclub.in",
  "Jupiter Money": "jupiter.money",
  "Ind Money": "indmoney.com",
  "INDmoney": "indmoney.com",
  "Money View": "moneyview.in",
  "KreditBee": "kreditbee.in",
  "Kiwi": "gokiwi.in",
  "Flipkart": "flipkart.com",
  "BharatPe": "bharatpe.com",
  "OmniCard": "omnicard.in",
  "Fi Money": "fi.money",
  "Aditya Birla Capital Digital": "adityabirlacapital.com",
  "Digikhata": "digikhata.in",
  "Timepay": "timepay.in",
  "Freo": "freo.money",
  "Jar": "myjar.app",
  "OneCard": "getonecard.app",
  "Salary Se": "salaryse.com",
  "Shriram One": "shriramone.in",
  "RapiPay": "rapipay.com",
  "Spice Money": "spicemoney.com",
  "Saathi by PayNearBy": "paynearby.in",
  "Tata Neu": "tataneu.com",
  "Obopay": "obopay.com",
  "Dhani": "dhani.com",
  "True Balance": "truebalance.io",
  "TwidPay": "twid.in",
  "Payworld": "payworld.in",
  "Cheq": "cheq.one",
  "Curie Money": "curie.money",
  "Fave": "myfave.com",
  "Ultracash": "ultracash.com",
  "LXME": "lxme.in",
  "ZET": "zet.in",
  "Scapia": "scapia.in",

  // Banks
  "Axis Bank": "axisbank.com",
  "Kotak Mahindra Bank": "kotak.com",
  "HDFC Bank": "hdfcbank.com",
  "ICICI Bank": "icicibank.com",
  "IDFC First Bank": "idfcfirstbank.com",
  "Yes Bank": "yesbank.in",
  "India Post Payments Bank": "ippbonline.com",
  "Airtel Payments Bank": "airtel.in",
  "SBI": "onlinesbi.sbi",
  "RBL Bank": "rblbank.com",
  "Jio Payments Bank": "jiopaymentsbank.com",
  "Federal Bank": "federalbank.co.in",
  "Deutsche Bank": "db.com",
  "Canara Bank": "canarabank.com",
  "J&K Bank": "jkbank.com",
  "Suryoday": "suryodaybank.com",
  "Indian Bank": "indianbank.in",
  "Bank of Baroda": "bankofbaroda.in",
  "Punjab National Bank": "pnbindia.in",
  "HSBC Bank": "hsbc.co.in",
  "IndusInd Bank": "indusind.com",
  "Union Bank": "unionbankofindia.co.in",
  "AU Small Finance Bank": "aubank.in",
  "South Indian Bank": "southindianbank.com",
  "Fino Payments Bank": "finobank.com",
  "UCO Bank": "ucobank.com",
  "DBS Bank": "dbs.com",
  "Standard Chartered Bank": "sc.com",
  "Central Bank of India": "centralbankofindia.co.in",
  "Bank of India": "bankofindia.co.in",
  "NSDL Payments Bank": "nsdlbank.com",
  "IDBI Bank": "idbibank.in",
  "Karnataka Bank": "karnatakabank.com",
  "Karur Vysya Bank": "kvb.co.in",
  "Tamilnad Mercantile Bank": "tmb.in",
  "City Union Bank": "cityunionbank.com",
  "ESAF Small Finance Bank": "esafbank.com",
  "Indian Overseas Bank": "iob.in",
  "Bank of Maharashtra": "bankofmaharashtra.in",
  "Equitas Small Finance Bank": "equitasbank.com",
  "Unity Small Finance Bank": "theunitybank.com",
  "Punjab & Sind Bank": "punjabandsindbank.co.in",
};

export function getAppDomain(app: string): string | undefined {
  return APP_DOMAINS[app];
}

// Deterministic palette for initials fallback. Picks from a curated set
// of design-system-friendly tones so colors feel intentional.
const PALETTE = [
  { bg: "#1e293b", fg: "#f8fafc" }, // slate
  { bg: "#312e81", fg: "#eef2ff" }, // indigo
  { bg: "#7c2d12", fg: "#fef3c7" }, // burnt
  { bg: "#064e3b", fg: "#ecfdf5" }, // emerald
  { bg: "#831843", fg: "#fce7f3" }, // pink
  { bg: "#3f3f46", fg: "#fafafa" }, // zinc
  { bg: "#155e75", fg: "#ecfeff" }, // cyan
  { bg: "#713f12", fg: "#fef9c3" }, // amber
  { bg: "#4c1d95", fg: "#f5f3ff" }, // violet
  { bg: "#9a3412", fg: "#fff7ed" }, // orange
];

export function hashIndex(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function getInitialsColors(app: string) {
  return PALETTE[hashIndex(app, PALETTE.length)];
}

export function getInitials(app: string): string {
  const clean = app.replace(/[#&]/g, "").trim();
  const parts = clean.split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
