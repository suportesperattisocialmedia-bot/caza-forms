"use client";
import { use, useEffect, useState } from "react";
import Runner from "@/components/Runner";
import { sb } from "@/lib/supabase";

export default function PublicForm({ params }) {
  const { slug } = use(params);
  const [form, setForm] = useState(undefined);
  const [hidden, setHidden] = useState({});

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const h = {};
    p.forEach((v, k) => { if (k !== "embed") h[k] = v; });
    if (document.referrer && !h.referrer) {
      try { const r = new URL(document.referrer); if (r.host !== window.location.host) h.referrer = r.host; } catch {}
    }
    setHidden(h);
    sb().rpc("get_public_form", { p_slug: slug }).then(({ data }) => {
      setForm(data || null);
      if (data?.title) document.title = data.title;
    });
  }, [slug]);

  if (form === undefined) return <div style={{ minHeight: "100vh", background: "#050505" }} />;
  if (form === null)
    return (
      <div className="auth">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 26 }}>Formulário indisponível</h1>
          <p className="muted">Este link não existe ou ainda não foi publicado.</p>
        </div>
      </div>
    );
  return <Runner form={form} mode="live" full hidden={hidden} />;
}
