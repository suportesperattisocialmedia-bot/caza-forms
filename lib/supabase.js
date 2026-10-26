import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kmgyfdfjqrneiqtfgeha.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_FT7xsI4F73vyC-NL6OrIEw_0h1Z-5iN";

let client;
export function sb() {
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "caza-forms-auth" },
    });
  }
  return client;
}
