"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { sb } from "@/lib/supabase";
import { publicUrl } from "@/lib/util";
import { formatValue, isEmpty, typeInfo } from "@/lib/engine";

export default function ResultsPage({ params }) {
  const { id } = use(params);
  return <Shell><Results id={id} /></Shell>;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
function fmtDur(ms) {
  if (!ms || ms < 0) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`;
}

function Results({ id }) {
  const [form, setForm] = useState(null);
  const [rows, setRows] = useState([]);
  const [views, setViews] = useState(0);
  const [tab, setTab] = useState("responses");
  const [status, setStatus] = useState("complete");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: f } = await sb().from("forms").select("*").eq("id", id).maybeSingle();
    setForm(f);
    const { data } = await sb().from("responses").select("*").eq("form_id", id).order("started_at", { ascending: false }).limit(10000);
    setRows(data || []);
    const { count } = await sb().from("form_views").select("id", { count: "exact", head: true }).eq("form_id", id);
    setViews(count || 0);
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  const qs = useMemo(() => (form?.definition?.questions || []).filter((q) => q.type !== "statement"), [form]);
  const hiddenKeys = useMemo(() => [...new Set(rows.flatMap((r) => Object.keys(r.hidden || {})))], [rows]);
  const scoring = (form?.definition?.scoring?.mode || "none") !== "none";

  const filtered = useMemo(() => rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    const d = new Date(r.completed_at || r.started_at);
    if (from && d < new Date(from + "T00:00:00")) return false;
    if (to && d > new Date(to + "T23:59:59")) return false;
    if (search) {
      const hay = (Object.values(r.answers || {}).map(formatValue).join(" ") + " " + Object.values(r.hidden || {}).join(" ") + " " + (r.result || "")).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [rows, status, from, to, search]);

  if (!form && !loading) return <div className="empty">Formulário não encontrado.</div>;
  if (!form) return <div className="empty">Carregando...</div>;

  function exportCsv() {
    const head = ["Data", "Status", ...(scoring ? ["Pontuação", "Resultado"] : []), ...qs.map((q) => q.title || q.ref || q.id), ...hiddenKeys, "Tempo (s)", "ID"];
    const lines = [head];
    for (const r of filtered) {
      lines.push([
        fmtDate(r.completed_at || r.started_at), r.status === "complete" ? "Completa" : "Parcial",
        ...(scoring ? [r.score ?? "", r.result ?? ""] : []),
        ...qs.map((q) => formatValue(r.answers?.[q.id])),
        ...hiddenKeys.map((k) => r.hidden?.[k] ?? ""),
        r.completed_at ? Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000) : "",
        r.id,
      ]);
    }
    const csv = "﻿" + lines.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${form.slug}-respostas.csv`;
    a.click();
  }

  async function del(r) {
    if (!confirm("Excluir esta resposta?")) return;
    await sb().from("responses").delete().eq("id", r.id);
    setOpen(null);
    setRows((x) => x.filter((y) => y.id !== r.id));
  }

  async function download(file) {
    const { data, error } = await sb().storage.from("uploads").createSignedUrl(file.path, 120);
    if (error) return alert("Arquivo indisponível.");
    window.open(data.signedUrl, "_blank");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/forms" className="muted small">← Formulários</Link>
          <h1 style={{ marginTop: 8 }}>{form.title}</h1>
          <p>{publicUrl(form.slug)}</p>
        </div>
        <div className="row">
          <button className="btn sm" onClick={load}>Atualizar</button>
          <Link className="btn sm" href={`/forms/${id}/edit`}>Editar formulário</Link>
        </div>
      </div>
      <div className="rtabs">
        <button className={tab === "responses" ? "on" : ""} onClick={() => setTab("responses")}>Respostas ({rows.filter((r) => r.status === "complete").length})</button>
        <button className={tab === "metrics" ? "on" : ""} onClick={() => setTab("metrics")}>Métricas</button>
      </div>

      {tab === "responses" ? (
        <>
          <div className="filters">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="complete">Completas</option>
              <option value="partial">Parciais (abandonos)</option>
              <option value="all">Todas</option>
            </select>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="De" />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Até" />
            <input className="input" placeholder="Buscar nas respostas..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
            <span className="muted small">{filtered.length} resultado(s)</span>
            <button className="btn sm" style={{ marginLeft: "auto" }} onClick={exportCsv} disabled={!filtered.length}>Exportar CSV</button>
          </div>
          {!filtered.length ? (
            <div className="card empty">{loading ? "Carregando..." : "Nenhuma resposta com esses filtros ainda."}</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Data</th><th>Status</th>
                    {scoring && <><th>Pontos</th><th>Resultado</th></>}
                    {qs.map((q) => <th key={q.id} title={q.title}>{q.title || typeInfo(q.type).label}</th>)}
                    {hiddenKeys.map((k) => <th key={k}>{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} onClick={() => setOpen(r)}>
                      <td>{fmtDate(r.completed_at || r.started_at)}</td>
                      <td><span className={"badge " + (r.status === "complete" ? "published" : "")}>{r.status === "complete" ? "Completa" : "Parcial"}</span></td>
                      {scoring && <><td>{r.score ?? ""}</td><td>{r.result ?? ""}</td></>}
                      {qs.map((q) => <td key={q.id}>{formatValue(r.answers?.[q.id])}</td>)}
                      {hiddenKeys.map((k) => <td key={k}>{r.hidden?.[k] ?? ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <Metrics form={form} rows={rows} views={views} qs={qs} scoring={scoring} />
      )}

      {open && (
        <>
          <div className="drawer-bg" onClick={() => setOpen(null)} />
          <div className="drawer">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <span className={"badge " + (open.status === "complete" ? "published" : "")}>{open.status === "complete" ? "Completa" : "Parcial"}</span>
              <button className="btn ghost icon" onClick={() => setOpen(null)} aria-label="Fechar">×</button>
            </div>
            <h2 style={{ fontSize: 22 }}>{formatValue(open.answers?.[qs.find((q) => q.ref === "nome")?.id]) || "Resposta"}</h2>
            <p className="muted small">Iniciada em {fmtDate(open.started_at)}{open.completed_at && ` · concluída em ${fmtDur(new Date(open.completed_at) - new Date(open.started_at))}`}</p>
            {scoring && open.status === "complete" && (
              <div className="card" style={{ padding: 14, margin: "12px 0", display: "flex", gap: 24 }}>
                <div><div className="label">Pontuação</div><div style={{ fontFamily: "var(--serif)", fontSize: 26 }}>{open.score}</div></div>
                <div><div className="label">Resultado</div><div style={{ fontFamily: "var(--serif)", fontSize: 20, marginTop: 4 }}>{open.result}</div></div>
              </div>
            )}
            {qs.map((q) => {
              const v = open.answers?.[q.id];
              return (
                <div className="ans" key={q.id}>
                  <div className="q">{q.title || typeInfo(q.type).label}</div>
                  <div className="a">
                    {isEmpty(v) ? <span className="muted">—</span> : q.type === "file_upload" && v?.path ? (
                      <button className="btn sm" onClick={() => download(v)}>📎 {v.name}</button>
                    ) : q.type === "phone" ? (
                      <a href={`https://wa.me/55${String(v).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "#e7a5b2" }}>{v} ↗</a>
                    ) : formatValue(v)}
                  </div>
                </div>
              );
            })}
            {Object.keys(open.hidden || {}).length > 0 && (
              <div className="ans"><div className="q">Origem (UTMs e campos ocultos)</div>
                <div className="a mono">{Object.entries(open.hidden).map(([k, v]) => `${k}: ${v}`).join("\n")}</div></div>
            )}
            <button className="btn danger" style={{ marginTop: 24 }} onClick={() => del(open)}>Excluir resposta</button>
          </div>
        </>
      )}
    </>
  );
}

function Bar({ label, value, max, right, soft }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <span className="lbl" title={label}>{label}</span>
      <div className="bar-track"><div className={"bar-fill" + (soft ? " soft" : "")} style={{ width: pct + "%" }} /></div>
      <span className="num">{right ?? value}</span>
    </div>
  );
}

function Metrics({ form, rows, views, qs, scoring }) {
  const starts = rows.length;
  const done = rows.filter((r) => r.status === "complete");
  const rate = starts ? Math.round((done.length / starts) * 100) : 0;
  const durs = done.map((r) => new Date(r.completed_at) - new Date(r.started_at)).filter((x) => x > 0).sort((a, b) => a - b);
  const median = durs.length ? durs[Math.floor(durs.length / 2)] : 0;
  const allQs = form.definition?.questions || [];

  // funil: quantas pessoas chegaram a responder cada pergunta
  const funnel = allQs.map((q, i) => {
    const reached = rows.filter((r) => (r.answers && Object.prototype.hasOwnProperty.call(r.answers, q.id)) || (r.progress || 0) > i).length;
    return { q, i, reached };
  });

  // última pergunta onde as parciais pararam
  const partial = rows.filter((r) => r.status === "partial");
  const stopAt = {};
  for (const r of partial) {
    const idx = r.last_question_id ? allQs.findIndex((q) => q.id === r.last_question_id) + 1 : 0;
    stopAt[idx] = (stopAt[idx] || 0) + 1;
  }

  const byDay = {};
  for (const r of done) {
    const d = new Date(r.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    byDay[d] = (byDay[d] || 0) + 1;
  }
  const days = Object.entries(byDay).slice(0, 14).reverse();
  const results = {};
  for (const r of done) if (r.result) results[r.result] = (results[r.result] || 0) + 1;
  const sources = {};
  for (const r of rows) { const s = r.hidden?.utm_source || r.hidden?.origem || "direto"; sources[s] ||= { all: 0, done: 0 }; sources[s].all++; if (r.status === "complete") sources[s].done++; }

  return (
    <>
      <div className="stats">
        <div className="card stat"><div className="k">Visitas</div><div className="v">{views}</div><div className="s">pessoas que abriram o link</div></div>
        <div className="card stat"><div className="k">Inícios</div><div className="v">{starts}</div><div className="s">{views ? Math.round((starts / views) * 100) : 0}% das visitas começaram</div></div>
        <div className="card stat"><div className="k">Conclusões</div><div className="v">{done.length}</div><div className="s">{rate}% de quem começou</div></div>
        <div className="card stat"><div className="k">Tempo mediano</div><div className="v">{fmtDur(median)}</div><div className="s">para concluir</div></div>
      </div>

      {!starts ? <div className="card empty">As métricas aparecem assim que chegarem as primeiras respostas.</div> : (
        <>
          <div className="card metric-card">
            <h3>Funil de abandono por pergunta</h3>
            <div className="sub">Quantas pessoas, das que começaram, chegaram a responder cada pergunta. A queda mostra onde o formulário perde gente.</div>
            <div className="bars">
              <Bar label="Começaram" value={starts} max={starts} right={`${starts} · 100%`} />
              {funnel.map(({ q, i, reached }, k) => {
                const prev = k === 0 ? starts : funnel[k - 1].reached;
                const drop = prev ? Math.round(((prev - reached) / prev) * 100) : 0;
                return (
                  <div key={q.id}>
                    <Bar label={`${i + 1}. ${q.title || typeInfo(q.type).label}`} value={reached} max={starts} right={`${reached} · ${Math.round((reached / starts) * 100)}%`} />
                    {drop > 0 && <div className="drop" style={{ marginLeft: "min(272px, 30%)" }}>▼ {drop}% saíram aqui</div>}
                  </div>
                );
              })}
              <Bar label="Concluíram" value={done.length} max={starts} right={`${done.length} · ${rate}%`} />
            </div>
          </div>

          {scoring && Object.keys(results).length > 0 && (
            <div className="card metric-card">
              <h3>Resultados do quiz</h3>
              <div className="sub">Distribuição das telas finais entre quem concluiu.</div>
              <div className="bars">
                {Object.entries(results).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Bar key={k} label={k} value={v} max={done.length} right={`${v} · ${Math.round((v / done.length) * 100)}%`} />)}
              </div>
            </div>
          )}

          <div className="card metric-card">
            <h3>Origem do tráfego</h3>
            <div className="sub">Por utm_source ou parâmetro "origem" no link. Compare conclusão entre canais.</div>
            <div className="bars">
              {Object.entries(sources).sort((a, b) => b[1].all - a[1].all).map(([k, v]) => <Bar key={k} label={k} value={v.done} max={done.length || 1} right={`${v.done}/${v.all} · ${Math.round((v.done / v.all) * 100)}%`} />)}
            </div>
          </div>

          {days.length > 1 && (
            <div className="card metric-card">
              <h3>Conclusões por dia</h3>
              <div className="sub">Últimos dias com respostas.</div>
              <div className="bars">{days.map(([d, v]) => <Bar key={d} label={d} value={v} max={Math.max(...days.map((x) => x[1]))} />)}</div>
            </div>
          )}

          {qs.filter((q) => q.options || ["opinion_scale", "rating", "number"].includes(q.type)).map((q) => {
            const vals = done.map((r) => r.answers?.[q.id]).filter((v) => !isEmpty(v));
            if (q.options) {
              const c = {};
              for (const v of vals) for (const x of Array.isArray(v) ? v : [v]) c[x] = (c[x] || 0) + 1;
              const labels = [...q.options.map((o) => o.label), ...Object.keys(c).filter((k) => !q.options.some((o) => o.label === k))];
              return (
                <div className="card metric-card" key={q.id}>
                  <h3>{q.title}</h3>
                  <div className="sub">{vals.length} resposta(s){q.multiple ? " · várias escolhas permitidas" : ""}</div>
                  <div className="bars">{labels.map((l) => <Bar key={l} label={l} value={c[l] || 0} max={vals.length} right={`${c[l] || 0} · ${vals.length ? Math.round(((c[l] || 0) / vals.length) * 100) : 0}%`} />)}</div>
                </div>
              );
            }
            const nums = vals.map(Number).filter((n) => !isNaN(n));
            const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
            let extra = null;
            if (q.type === "opinion_scale" && (q.scale?.max ?? 10) === 10 && (q.scale?.min ?? 0) === 0 && nums.length) {
              const pro = nums.filter((n) => n >= 9).length, det = nums.filter((n) => n <= 6).length;
              extra = <span> · NPS <b style={{ color: "var(--fg)" }}>{Math.round(((pro - det) / nums.length) * 100)}</b></span>;
            }
            const dist = {};
            for (const n of nums) dist[n] = (dist[n] || 0) + 1;
            const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
            return (
              <div className="card metric-card" key={q.id}>
                <h3>{q.title}</h3>
                <div className="sub">Média <b style={{ color: "var(--fg)" }}>{avg.toFixed(1)}</b>{q.type === "rating" ? ` de ${q.stars || 5}` : ""} · {nums.length} resposta(s){extra}</div>
                <div className="bars">{keys.map((k) => <Bar key={k} label={q.type === "rating" ? "★".repeat(k) : String(k)} value={dist[k]} max={nums.length} right={`${dist[k]} · ${Math.round((dist[k] / nums.length) * 100)}%`} />)}</div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
