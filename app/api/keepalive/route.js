// Chamado diariamente pelo cron da Vercel para o Supabase gratuito não pausar por inatividade.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kmgyfdfjqrneiqtfgeha.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_FT7xsI4F73vyC-NL6OrIEw_0h1Z-5iN";
  try {
    const r = await fetch(`${url}/rest/v1/rpc/get_public_form`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: "keepalive" }),
      cache: "no-store",
    });
    return Response.json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
