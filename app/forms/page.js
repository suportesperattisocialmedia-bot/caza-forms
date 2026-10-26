"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { sb } from "@/lib/supabase";
import { publicUrl } from "@/lib/util";
import { DEFAULT_THEME, defaultDefinition, slugify, templateLeads, templateOratoria, uid } from "@/lib/engine";

const STATUS = { draft: "Rascunho", published: "Publicado", closed: "Fechado" };


export default function FormsPage() {
  return <Shell><Dashboard /></Shell>;
}

function Dashboard() {
  const router = useRouter();
  const [forms, setForms] = useState(null);
  const [counts, setCounts] = useState({});
  const [views, setViews] = useState({});
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(null);
  const [toast, setToast] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    const { data } = await sb().from("forms").select("id,title,slug,status,updated_at,created_at,definition,theme,settings").order("updated_at", { ascending: false });
    setForms(data || []);
    const { data: rs } = await sb().from("responses").select("form_id,status").limit(20000);
    const c = {};
    for (const r of rs || []) {
      c[r.form_id] ||= { all: 0, done: 0 };
      c[r.form_id].all++;
      if (r.status === "complete") c[r.form_id].done++;
    }
    setCounts(c);
    const { data: vs } = await sb().from("form_views").select("form_id").limit(50000);
    const v = {};
    for (const x of vs || []) v[x.form_id] = (v[x.form_id] || 0) + 1;
    setViews(v);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const c = () => setMenu(null); window.addEventListener("click", c); return () => window.removeEventListener("click", c); }, []);

  function flash(t) { setToast(t); setTimeout(() => setToast(""), 2200); }

  async function create(tpl) {
    const base = tpl === "oratoria" ? templateOratoria() : tpl === "leads" ? templateLeads() : { title: "Novo formulário", definition: defaultDefinition() };
    const { data, error } = await sb().from("forms").insert({
      title: base.title, slug: `${slugify(base.title)}-${uid()}`, definition: base.definition, theme: DEFAULT_THEME, settings: {},
    }).select("id").single();
    if (error) return alert(error.message);
    router.push(`/forms/${data.id}/edit`);
  }

  async function duplicate(f) {
    const { error } = await sb().from("forms").insert({
      title: f.title + " (cópia)", slug: `${slugify(f.title)}-${uid()}`, status: "draft", definition: f.definition, theme: f.theme, settings: f.settings,
    });
    if (error) return alert(error.message);
    flash("Formulário duplicado"); load();
  }
  async function rename(f) {
    const t = prompt("Novo nome do formulário", f.title);
    if (!t) return;
    await sb().from("forms").update({ title: t, updated_at: new Date().toISOString() }).eq("id", f.id);
    load();
  }
  async function remove(f) {
    if (!confirm(`Excluir "${f.title}" e todas as respostas? Isso não pode ser desfeito.`)) return;
    await sb().from("forms").delete().eq("id", f.id);
    flash("Formulário excluído"); load();
  }
  function copy(f) {
    navigator.clipboard?.writeText(publicUrl(f.slug));
    flash("Link copiado");
  }

  const list = (forms || []).filter((f) => f.title.toLowerCase().includes(q.toLowerCase()));
  const tot = Object.values(counts).reduce((a, c) => ({ all: a.all + c.all, done: a.done + c.done }), { all: 0, done: 0 });
  const totViews = Object.values(views).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Formulários</h1>
          <p>Crie, publique e acompanhe cada formulário da Caza Millennium.</p>
        </div>
        <div className="row">
          <input className="input" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <button className="btn primary" onClick={() => setModal(true)}>+ Novo formulário</button>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="k">Formulários</div><div className="v">{forms ? forms.length : "–"}</div><div className="s">{(forms || []).filter((f) => f.status === "published").length} publicados</div></div>
        <div className="card stat"><div className="k">Visitas</div><div className="v">{totViews}</div><div className="s">em todos os formulários</div></div>
        <div className="card stat"><div className="k">Respostas</div><div className="v">{tot.done}</div><div className="s">{tot.all - tot.done} parciais</div></div>
        <div className="card stat"><div className="k">Conclusão</div><div className="v">{tot.all ? Math.round((tot.done / tot.all) * 100) : 0}%</div><div className="s">de quem começou terminou</div></div>
      </div>

      {forms && !forms.length && (
        <div className="card empty">
          <h2 style={{ color: "var(--fg)", marginBottom: 8 }}>Seu primeiro formulário começa aqui</h2>
          <p>Use um modelo pronto ou comece em branco.</p>
          <button className="btn primary" onClick={() => setModal(true)} style={{ marginTop: 12 }}>+ Novo formulário</button>
        </div>
      )}

      <div className="forms-grid">
        {list.map((f) => {
          const c = counts[f.id] || { all: 0, done: 0 };
          const rate = c.all ? Math.round((c.done / c.all) * 100) : 0;
          return (
            <div key={f.id} className="card form-card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className={"badge " + f.status}><span className="dot" />{STATUS[f.status]}</span>
                <button className="btn ghost icon" onClick={(e) => { e.stopPropagation(); setMenu(menu === f.id ? null : f.id); }} aria-label="Mais ações">⋯</button>
              </div>
              {menu === f.id && (
                <div className="menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setMenu(null); rename(f); }}>Renomear</button>
                  <button onClick={() => { setMenu(null); duplicate(f); }}>Duplicar</button>
                  <button onClick={() => { setMenu(null); copy(f); }}>Copiar link</button>
                  <button onClick={() => { setMenu(null); window.open(`/f/${f.slug}`, "_blank"); }}>Abrir formulário</button>
                  <button style={{ color: "#e58a99" }} onClick={() => { setMenu(null); remove(f); }}>Excluir</button>
                </div>
              )}
              <Link href={`/forms/${f.id}/edit`}><h3>{f.title}</h3></Link>
              <div className="meta">
                <span><b>{views[f.id] || 0}</b> visitas</span>
                <span><b>{c.done}</b> respostas</span>
                <span><b>{rate}%</b> conclusão</span>
              </div>
              <div className="muted small">Editado em {new Date(f.updated_at).toLocaleDateString("pt-BR")}</div>
              <div className="actions">
                <Link className="btn sm" href={`/forms/${f.id}/edit`}>Editar</Link>
                <Link className="btn sm" href={`/forms/${f.id}/results`}>Respostas</Link>
                <button className="btn sm ghost" onClick={() => copy(f)}>Copiar link</button>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="modal-bg" onClick={() => setModal(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h2>Novo formulário</h2>
            <p className="muted" style={{ margin: 0 }}>Escolha um ponto de partida. Tudo pode ser editado depois.</p>
            <div className="tpl-grid">
              <button className="tpl" onClick={() => create("blank")}><i>＋</i><b>Em branco</b><span>Comece do zero com uma pergunta.</span></button>
              <button className="tpl" onClick={() => create("oratoria")}><i>◆</i><b>Diagnóstico de Oratória</b><span>Quiz com pontuação, 3 resultados e WhatsApp no final.</span></button>
              <button className="tpl" onClick={() => create("leads")}><i>◎</i><b>Captação de leads</b><span>Nome, e-mail, WhatsApp, empresa e faturamento.</span></button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200 }} className="badge published">{toast}</div>}
    </>
  );
}
