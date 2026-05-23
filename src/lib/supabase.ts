import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
}

// Node 20 lacks native WebSocket — supply the `ws` package as realtime transport
// so the Supabase client initialises correctly during SSR.
// In the browser WebSocket is always available and the dynamic import is tree-shaken.
const wsImpl: typeof WebSocket =
  typeof WebSocket !== "undefined"
    ? WebSocket
    : ((await import("ws")).default as unknown as typeof WebSocket);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { transport: wsImpl },
});
