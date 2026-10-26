"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";

function traduz(msg = "") {
  if (/Invalid login/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/nao autorizado|Database error saving new user/i.test(msg)) return "Este e-mail não está liberado. Peça para um administrador adicionar você em Equipe.";
  if (/already registered/i.test(msg)) return "Este e-mail já tem conta. Use a aba Entrar.";
  if (/at least 6/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
  return msg || "Algo deu errado.";
}

export default function Login() {
  const router = useRouter();
  const [tab, setTab] = useState("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setOk(""); setBusy(true);
    const auth = sb().auth;
    if (tab === "in") {
      const { error } = await auth.signInWithPassword({ email, password: pass });
      setBusy(false);
      if (error) return setErr(traduz(error.message));
      router.replace("/forms");
    } else {
      const { data, error } = await auth.signUp({ email, password: pass });
      setBusy(false);
      if (error) return setErr(traduz(error.message));
      if (data.session) return router.replace("/forms");
      const r = await auth.signInWithPassword({ email, password: pass });
      if (!r.error) return router.replace("/forms");
      setOk("Conta criada. Agora é só entrar.");
      setTab("in");
    }
  }

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand"><span className="brand-mark" /><span>Caza Forms</span></div>
        <h1>{tab === "in" ? "Bem-vindo de volta" : "Criar acesso"}</h1>
        <p className="muted small" style={{ margin: 0 }}>Plataforma de formulários da Caza Millennium.</p>
        <div className="tabs">
          <button type="button" className={tab === "in" ? "on" : ""} onClick={() => setTab("in")}>Entrar</button>
          <button type="button" className={tab === "up" ? "on" : ""} onClick={() => setTab("up")}>Criar conta</button>
        </div>
        {err && <div className="alert">{err}</div>}
        {ok && <div className="alert ok">{ok}</div>}
        <div className="field">
          <label className="label">E-mail</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label className="label">Senha</label>
          <input className="input" type="password" required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={tab === "in" ? "current-password" : "new-password"} />
        </div>
        <button className="btn primary" style={{ width: "100%", height: 44 }} disabled={busy}>{busy ? "Aguarde..." : tab === "in" ? "Entrar" : "Criar conta"}</button>
        {tab === "up" && <p className="hint">Só e-mails liberados pela equipe conseguem criar conta.</p>}
      </form>
    </div>
  );
}
