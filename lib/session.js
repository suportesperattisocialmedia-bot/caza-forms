import { sb } from "@/lib/supabase";

// getSession com limite de tempo: se o banco não responder, mostra erro em vez de carregar para sempre
export async function getSessionSafe(ms = 8000) {
  return Promise.race([
    sb().auth.getSession().then(({ data }) => ({ session: data.session })),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), ms)),
  ]);
}
