import { createClient } from "@supabase/supabase-js";

const direct = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kmgyfdfjqrneiqtfgeha.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_FT7xsI4F73vyC-NL6OrIEw_0h1Z-5iN";

// No navegador, tudo passa pelo próprio domínio do Caza Forms (/sb → Supabase, via rewrite da Vercel).
// Assim o sistema funciona mesmo em redes ou provedores que bloqueiam o endereço supabase.co.
const url = typeof window !== "undefined" ? `${window.location.origin}/sb` : direct;

// Tenta de novo automaticamente quando a conexão cai (oscilação de rede, Wi-Fi fraco)
async function fetchWithRetry(input, init) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastErr = e;
      if (init?.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

let client;
export function sb() {
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "caza-forms-auth" },
      global: { fetch: fetchWithRetry },
    });
  }
  return client;
}
