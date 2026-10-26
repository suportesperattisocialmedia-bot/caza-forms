"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { sb } from "@/lib/supabase";

export default function EquipePage() {
  return <Shell><Equipe /></Shell>;
}

function Equipe() {
  const [list, setList] = useState([]);
  const [email, setEmail] = useState("");
  const [me, setMe] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const { data } = await sb().from("admins").select("*").order("created_at");
    setList(data || []);
  }
  useEffect(() => {
    load();
    sb().auth.getUser().then(({ data }) => setMe(data.user?.email || ""));
  }, []);

  async function add(e) {
    e.preventDefault();
    setErr("");
    const { error } = await sb().from("admins").insert({ email: email.trim().toLowerCase() });
    if (error) return setErr(/duplicate/i.test(error.message) ? "Este e-mail já está liberado." : error.message);
    setEmail(""); load();
  }
  async function remove(x) {
    if (x.email === me) return alert("Você não pode remover o seu próprio acesso.");
    if (!confirm(`Remover o acesso de ${x.email}?`)) return;
    await sb().from("admins").delete().eq("email", x.email);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Equipe</h1>
          <p>Quem pode criar formulários e ver respostas. Libere o e-mail aqui e a pessoa cria a própria senha na tela de login.</p>
        </div>
      </div>
      <form className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 640 }} onSubmit={add}>
        <label className="label">Liberar novo e-mail</label>
        <div className="row">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@cazamillennium.com.br" />
          <button className="btn primary">Liberar</button>
        </div>
        {err && <div className="alert" style={{ marginTop: 12, marginBottom: 0 }}>{err}</div>}
      </form>
      <div className="card" style={{ maxWidth: 640 }}>
        {list.map((x) => (
          <div key={x.email} className="row" style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <span className="grow">{x.email}{x.email === me && <span className="muted small"> (você)</span>}</span>
            <span className="muted small">desde {new Date(x.created_at).toLocaleDateString("pt-BR")}</span>
            <button className="btn sm ghost danger" onClick={() => remove(x)}>Remover</button>
          </div>
        ))}
      </div>
    </>
  );
}
