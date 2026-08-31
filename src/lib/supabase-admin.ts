import { createClient } from "@supabase/supabase-js";
import type { RealtimeClientOptions } from "@supabase/realtime-js";

// Server-only client that bypasses RLS using the service role key. Never import this from client code.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getRealtimeOptions(): RealtimeClientOptions | undefined {
  if (typeof window !== "undefined") {
    return undefined;
  }

  if (typeof globalThis.WebSocket !== "undefined") {
    return undefined;
  }

  const wsModule = require("ws") as { WebSocket?: RealtimeClientOptions["transport"] } | RealtimeClientOptions["transport"];
  const transport = (wsModule as { WebSocket?: RealtimeClientOptions["transport"] }).WebSocket || (wsModule as RealtimeClientOptions["transport"]);
  return { transport };
}

const realtime = getRealtimeOptions();

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  ...(realtime ? { realtime } : undefined)
});
