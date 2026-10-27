"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import Runner from "@/components/Runner";
import { sb } from "@/lib/supabase";
import { publicUrl } from "@/lib/util";
import {
  QUESTION_TYPES, typeInfo, newQuestion, newOption, newEnding, uid, slugify, DEFAULT_THEME, LOGIC_OPS, CHOICE_TYPES,
} from "@/lib/engine";

export default function EditPage({ params }) {
  const { id } = use(params);
  return <Shell bare><Builder id={id} /></Shell>;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label}
    </label>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function Builder({ id }) {
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("build");
  const [sel, setSel] = useState("welcome");
  const [saveState, setSaveState] = useState("");
  const [device, setDevice] = useState("desktop");
  const [adding, setAdding] = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const dirty = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    sb().from("forms").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (!data) return setNotFound(true);
      data.theme = { ...DEFAULT_THEME, ...(data.theme || {}) };
      data.settings = data.settings || {};
      setForm(data);
      setSel(data.definition?.welcome?.enabled ? "welcome" : data.definition?.questions?.[0]?.id || "welcome");
    });
  }, [id]);

  // autosave
  useEffect(() => {
    if (!form || !dirty.current) return;
    setSaveState("Salvando...");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await sb().from("forms").update({
        title: form.title, slug: form.slug, status: form.status, definition: form.definition, theme: form.theme, settings: form.settings,
        updated_at: new Date().toISOString(),
      }).eq("id", form.id);
      dirty.current = false;
      setSaveState(error ? (/duplicate|unique/i.test(error.message) ? "Link já em uso" : "Erro ao salvar") : "Salvo ✓");
    }, 700);
  }, [form]);

  useEffect(() => {
    const h = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  if (notFound) return <div className="empty">Formulário não encontrado. <Link href="/forms" style={{ color: "#e7a5b2" }}>Voltar</Link></div>;
  if (!form) return <div className="empty">Carregando editor...</div>;

  const def = form.definition;
  const qs = def.questions || [];
  const endings = def.endings || [];

  function patch(p) { dirty.current = true; setForm((f) => ({ ...f, ...p })); }
  function setDef(fn) { dirty.current = true; setForm((f) => ({ ...f, definition: fn(f.definition) })); }
  function updQ(qid, p) { setDef((d) => ({ ...d, questions: d.questions.map((q) => (q.id === qid ? { ...q, ...p } : q)) })); }
  function updE(eid, p) { setDef((d) => ({ ...d, endings: d.endings.map((e) => (e.id === eid ? { ...e, ...p } : e)) })); }
  function setTheme(p) { dirty.current = true; setForm((f) => ({ ...f, theme: { ...f.theme, ...p } })); }
  function setSettings(p) { dirty.current = true; setForm((f) => ({ ...f, settings: { ...f.settings, ...p } })); }

  function addQ(type) {
    const nq = newQuestion(type);
    setDef((d) => {
      const arr = [...d.questions];
      const i = arr.findIndex((q) => q.id === sel);
      arr.splice(i >= 0 ? i + 1 : arr.length, 0, nq);
      return { ...d, questions: arr };
    });
    setSel(nq.id); setAdding(false);
  }
  function delQ(qid) {
    if (!confirm("Excluir esta pergunta?")) return;
    const i = qs.findIndex((q) => q.id === qid);
    setDef((d) => ({
      ...d,
      questions: d.questions.filter((q) => q.id !== qid).map((q) => ({ ...q, logic: (q.logic || []).filter((r) => r.goto !== qid) })),
    }));
    setSel(qs[i + 1]?.id || qs[i - 1]?.id || "welcome");
  }
  function dupQ(qid) {
    const q = qs.find((x) => x.id === qid);
    const copy = JSON.parse(JSON.stringify(q));
    copy.id = uid("q_"); copy.ref = q.ref ? q.ref + "_2" : ""; copy.logic = [];
    if (copy.options && q.type !== "yes_no") copy.options = copy.options.map((o) => ({ ...o, id: uid("o_") }));
    setDef((d) => { const arr = [...d.questions]; arr.splice(arr.findIndex((x) => x.id === qid) + 1, 0, copy); return { ...d, questions: arr }; });
    setSel(copy.id);
  }
  function moveQ(from, to) {
    if (from === to || from == null || to == null) return;
    setDef((d) => { const arr = [...d.questions]; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return { ...d, questions: arr }; });
  }
  function changeType(qid, type) {
    const q = qs.find((x) => x.id === qid);
    const base = newQuestion(type);
    const keepOpts = q.options && base.options && type !== "yes_no" && q.type !== "yes_no";
    updQ(qid, { ...base, id: q.id, title: q.title, description: q.description, required: q.required, ref: q.ref, image: q.image, logic: [], options: keepOpts ? q.options : base.options });
  }
  function addEnding() {
    const e = newEnding("Nova tela final");
    setDef((d) => ({ ...d, endings: [...d.endings, e] }));
    setSel("end:" + e.id);
  }
  function delEnding(eid) {
    if (endings.length <= 1) return alert("O formulário precisa de pelo menos uma tela final.");
    if (!confirm("Excluir esta tela final?")) return;
    setDef((d) => ({
      ...d, endings: d.endings.filter((e) => e.id !== eid),
      questions: d.questions.map((q) => ({ ...q, logic: (q.logic || []).filter((r) => r.goto !== "end:" + eid) })),
    }));
    setSel("welcome");
  }

  function publish(status) {
    patch({ status });
  }

  const url = publicUrl(form.slug);
  const selQ = qs.find((q) => q.id === sel);
  const selE = sel.startsWith("end:") ? endings.find((e) => "end:" + e.id === sel) : null;
  const scoringMode = def.scoring?.mode || "none";

  // ---------- coluna esquerda ----------
  const list = (
    <aside className="bcol qlist">
      <div className={"qitem" + (sel === "welcome" ? " on" : "")} onClick={() => setSel("welcome")}>
        <span className="qnum">⌂</span><span className="t">Boas-vindas{!def.welcome?.enabled && <span className="muted"> (desligada)</span>}</span>
      </div>
      <h4>Perguntas</h4>
      {qs.map((q, i) => (
        <div key={q.id} draggable
          onDragStart={() => setDragFrom(i)} onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
          onDragLeave={() => setDragOver(null)} onDrop={() => { moveQ(dragFrom, i); setDragFrom(null); setDragOver(null); }}
          onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
          className={"qitem" + (sel === q.id ? " on" : "") + (dragOver === i && dragFrom !== i ? " drag-over" : "")} onClick={() => setSel(q.id)}>
          <span className="qnum">{typeInfo(q.type).icon} {i + 1}</span>
          <span className={"t" + (q.title ? "" : " ph")}>{q.title || typeInfo(q.type).label}</span>
          {(q.logic || []).length > 0 && <span className="lg" title="Tem lógica">⤳</span>}
        </div>
      ))}
      <button className="btn sm" style={{ width: "100%", marginTop: 8 }} onClick={() => setAdding((a) => !a)}>+ Adicionar pergunta</button>
      {adding && (
        <div className="add-menu">
          {QUESTION_TYPES.map((t) => (
            <button key={t.type} onClick={() => addQ(t.type)}><span className="ic">{t.icon}</span>{t.label}</button>
          ))}
        </div>
      )}
      <h4>Telas finais</h4>
      {endings.map((e) => (
        <div key={e.id} className={"qitem" + (sel === "end:" + e.id ? " on" : "")} onClick={() => setSel("end:" + e.id)}>
          <span className="qnum">✓</span><span className="t">{e.title || "Tela final"}</span>
        </div>
      ))}
      <button className="btn sm ghost" style={{ width: "100%", marginTop: 6 }} onClick={addEnding}>+ Tela final</button>
    </aside>
  );

  // ---------- editor ----------
  let editor = null;
  if (sel === "welcome") {
    const w = def.welcome || {};
    const setW = (p) => setDef((d) => ({ ...d, welcome: { ...d.welcome, ...p } }));
    editor = (
      <>
        <h2>Tela de boas-vindas</h2>
        <p className="sub">Primeira impressão do formulário. Prometa o resultado e diga quanto tempo leva.</p>
        <Field><Switch checked={w.enabled} onChange={(v) => setW({ enabled: v })} label="Mostrar tela de boas-vindas" /></Field>
        <Field label="Título"><textarea className="textarea" rows={2} value={w.title || ""} onChange={(e) => setW({ title: e.target.value })} placeholder={form.title} /></Field>
        <Field label="Descrição"><textarea className="textarea" value={w.description || ""} onChange={(e) => setW({ description: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Texto do botão"><input className="input" value={w.button || ""} onChange={(e) => setW({ button: e.target.value })} /></Field>
          <Field label="Imagem (URL)"><input className="input" value={w.image || ""} onChange={(e) => setW({ image: e.target.value })} placeholder="https://..." /></Field>
        </div>
      </>
    );
  } else if (selQ) {
    const q = selQ;
    const idx = qs.indexOf(q);
    const hasOpts = !!q.options;
    editor = (
      <>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
          <span className="qnum" style={{ height: 28 }}>{typeInfo(q.type).icon} Pergunta {idx + 1}</span>
          <div className="row">
            <button className="btn sm ghost" onClick={() => dupQ(q.id)}>Duplicar</button>
            <button className="btn sm ghost danger" onClick={() => delQ(q.id)}>Excluir</button>
          </div>
        </div>
        <Field label="Tipo">
          <select className="select" value={q.type} onChange={(e) => changeType(q.id, e.target.value)}>
            {QUESTION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </Field>
        <Field label={q.type === "statement" ? "Texto" : "Pergunta"} hint="Use {{variavel}} para citar respostas anteriores. Ex.: {{nome}}, tudo certo?">
          <textarea className="textarea" rows={2} value={q.title} onChange={(e) => updQ(q.id, { title: e.target.value })} placeholder="Escreva a pergunta..." autoFocus />
        </Field>
        <Field label="Descrição (opcional)"><textarea className="textarea" rows={2} value={q.description || ""} onChange={(e) => updQ(q.id, { description: e.target.value })} /></Field>
        <div className="grid2">
          {q.type !== "statement" && (
            <Field label="Nome da variável" hint="Usado no recall {{...}}, no CSV e no webhook.">
              <input className="input mono" value={q.ref || ""} onChange={(e) => updQ(q.id, { ref: slugify(e.target.value).replace(/-/g, "_") })} placeholder="ex.: nome" />
            </Field>
          )}
          <Field label="Imagem (URL)"><input className="input" value={q.image || ""} onChange={(e) => updQ(q.id, { image: e.target.value })} placeholder="https://..." /></Field>
        </div>
        {["short_text", "long_text", "email", "phone", "number"].includes(q.type) && (
          <Field label="Texto de exemplo (placeholder)"><input className="input" value={q.placeholder || ""} onChange={(e) => updQ(q.id, { placeholder: e.target.value })} /></Field>
        )}
        {q.type === "statement" && (
          <Field label="Texto do botão"><input className="input" value={q.button || ""} onChange={(e) => updQ(q.id, { button: e.target.value })} /></Field>
        )}
        {q.type !== "statement" && <Field><Switch checked={q.required} onChange={(v) => updQ(q.id, { required: v })} label="Resposta obrigatória" /></Field>}

        {hasOpts && (
          <div className="section">
            <h3>Opções {scoringMode !== "none" && "e pontuação"}</h3>
            <div className="opt-head"><span /><span>Opção</span><span>Pontos</span><span className="cat">Categoria</span><span /></div>
            {q.options.map((o, i) => (
              <div className="opt-row" key={o.id}>
                <span className="letter">{q.type === "yes_no" ? o.label[0] : LETTERS[i]}</span>
                <input className="input" value={o.label} disabled={q.type === "yes_no"}
                  onChange={(e) => updQ(q.id, { options: q.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })} />
                <input className="input" type="number" value={o.score ?? 0}
                  onChange={(e) => updQ(q.id, { options: q.options.map((x) => (x.id === o.id ? { ...x, score: e.target.value === "" ? 0 : Number(e.target.value) } : x)) })} />
                <input className="input cat" value={o.category || ""} placeholder="—"
                  onChange={(e) => updQ(q.id, { options: q.options.map((x) => (x.id === o.id ? { ...x, category: e.target.value } : x)) })} />
                {q.type !== "yes_no" ? (
                  <button className="btn ghost icon" aria-label="Remover" onClick={() => updQ(q.id, { options: q.options.filter((x) => x.id !== o.id) })}>×</button>
                ) : <span />}
              </div>
            ))}
            {q.type !== "yes_no" && (
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn sm" onClick={() => updQ(q.id, { options: [...q.options, newOption(`Opção ${LETTERS[q.options.length] || ""}`)] })}>+ Opção</button>
                <button className="btn sm ghost" onClick={() => {
                  const t = prompt("Cole uma opção por linha");
                  if (t) updQ(q.id, { options: [...q.options, ...t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => newOption(l))] });
                }}>Colar várias</button>
              </div>
            )}
            {q.type === "multiple_choice" && (
              <div className="row" style={{ gap: 24, marginTop: 16, flexWrap: "wrap" }}>
                <Switch checked={q.multiple} onChange={(v) => updQ(q.id, { multiple: v })} label="Permitir várias respostas" />
                <Switch checked={q.allowOther} onChange={(v) => updQ(q.id, { allowOther: v })} label='Opção "Outro"' />
              </div>
            )}
            {scoringMode === "none" && <div className="hint" style={{ marginTop: 12 }}>Para usar os pontos, ative a pontuação na aba Lógica.</div>}
          </div>
        )}

        {q.type === "opinion_scale" && (
          <div className="section">
            <h3>Escala</h3>
            <div className="grid2">
              <Field label="Início"><select className="select" value={q.scale?.min ?? 0} onChange={(e) => updQ(q.id, { scale: { ...q.scale, min: Number(e.target.value) } })}><option value={0}>0</option><option value={1}>1</option></select></Field>
              <Field label="Fim"><select className="select" value={q.scale?.max ?? 10} onChange={(e) => updQ(q.id, { scale: { ...q.scale, max: Number(e.target.value) } })}>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
              <Field label="Rótulo à esquerda"><input className="input" value={q.scale?.left || ""} onChange={(e) => updQ(q.id, { scale: { ...q.scale, left: e.target.value } })} /></Field>
              <Field label="Rótulo à direita"><input className="input" value={q.scale?.right || ""} onChange={(e) => updQ(q.id, { scale: { ...q.scale, right: e.target.value } })} /></Field>
            </div>
          </div>
        )}
        {q.type === "rating" && (
          <div className="section"><h3>Estrelas</h3>
            <Field label="Quantidade"><select className="select" value={q.stars || 5} onChange={(e) => updQ(q.id, { stars: Number(e.target.value) })}>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          </div>
        )}
        {["opinion_scale", "rating", "number"].includes(q.type) && (
          <Field><Switch checked={q.scoreAnswer} onChange={(v) => updQ(q.id, { scoreAnswer: v })} label="Somar o valor respondido na pontuação do quiz" /></Field>
        )}
        <div className="section">
          <h3>Lógica</h3>
          <p className="muted small" style={{ marginTop: 0 }}>{(q.logic || []).length ? `${q.logic.length} regra(s) de salto configurada(s).` : "Sem regras: segue para a próxima pergunta."}</p>
          <button className="btn sm" onClick={() => setTab("logic")}>Configurar lógica →</button>
        </div>
      </>
    );
  } else if (selE) {
    const e = selE;
    editor = (
      <>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
          <span className="qnum" style={{ height: 28 }}>✓ Tela final</span>
          <button className="btn sm ghost danger" onClick={() => delEnding(e.id)}>Excluir</button>
        </div>
        <Field label="Título" hint="Variáveis: {{nome}}, {{pontuacao}}, {{resultado}} e qualquer variável de pergunta.">
          <input className="input" value={e.title} onChange={(ev) => updE(e.id, { title: ev.target.value })} />
        </Field>
        <Field label="Mensagem"><textarea className="textarea" rows={4} value={e.message || ""} onChange={(ev) => updE(e.id, { message: ev.target.value })} /></Field>
        {scoringMode === "sum" && (
          <div className="grid2">
            <Field label="Pontuação mínima"><input className="input" type="number" value={e.min ?? ""} onChange={(ev) => updE(e.id, { min: ev.target.value })} placeholder="sem mínimo" /></Field>
            <Field label="Pontuação máxima"><input className="input" type="number" value={e.max ?? ""} onChange={(ev) => updE(e.id, { max: ev.target.value })} placeholder="sem máximo" /></Field>
          </div>
        )}
        {scoringMode !== "none" && (
          <Field label={scoringMode === "category" ? "Categoria que leva a esta tela" : "Nome do resultado"} hint={scoringMode === "category" ? "Deve ser igual à categoria usada nas opções." : "Aparece como selo no topo e na variável {{resultado}}."}>
            <input className="input" value={e.category || ""} onChange={(ev) => updE(e.id, { category: ev.target.value })} />
          </Field>
        )}
        <div className="section">
          <h3>Botão de ação</h3>
          <Field label="Texto do botão" hint="Deixe vazio para não mostrar botão (e usar o redirecionamento automático, se configurado)."><input className="input" value={e.buttonLabel || ""} onChange={(ev) => updE(e.id, { buttonLabel: ev.target.value })} /></Field>
          <div className="grid2">
            <Field label="WhatsApp (com DDD)" hint="Ex.: 5511912345678"><input className="input" value={e.whatsappPhone || ""} onChange={(ev) => updE(e.id, { whatsappPhone: ev.target.value })} /></Field>
            <Field label="Ou link (URL)" hint="Usado se não houver WhatsApp."><input className="input" value={e.buttonUrl || ""} onChange={(ev) => updE(e.id, { buttonUrl: ev.target.value })} placeholder="https://..." /></Field>
          </div>
          <Field label="Mensagem pronta do WhatsApp"><textarea className="textarea" rows={3} value={e.whatsappMessage || ""} onChange={(ev) => updE(e.id, { whatsappMessage: ev.target.value })} placeholder="Olá! Sou {{nome}} e meu resultado foi {{resultado}}." /></Field>
        </div>
      </>
    );
  }

  // ---------- aba lógica ----------
  const gotoOptions = (fromIdx) => (
    <>
      <optgroup label="Perguntas">
        {qs.map((x, i) => i > fromIdx && <option key={x.id} value={x.id}>{i + 1}. {x.title || typeInfo(x.type).label}</option>)}
      </optgroup>
      <optgroup label="Telas finais">
        {endings.map((e) => <option key={e.id} value={"end:" + e.id}>✓ {e.title}</option>)}
      </optgroup>
    </>
  );
  const logicTab = (
    <div className="bcol editor">
      <div className="editor-inner" style={{ maxWidth: 820 }}>
        <h2>Lógica e pontuação</h2>
        <p className="sub">Defina saltos entre perguntas e como o resultado final é escolhido.</p>
        <div className="card logic-q">
          <div className="head"><b style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Modo quiz</b></div>
          <div className="grid3">
            {[["none", "Sem pontuação", "Formulário comum."], ["sum", "Soma de pontos", "Cada opção vale pontos; a faixa de pontos escolhe a tela final."], ["category", "Por categoria", "A categoria com mais pontos vence e leva à tela final correspondente."]].map(([m, t, d]) => (
              <button key={m} className="tpl" style={{ borderColor: scoringMode === m ? "var(--wine-2)" : undefined, background: scoringMode === m ? "rgba(107,30,46,.18)" : undefined }}
                onClick={() => setDef((x) => ({ ...x, scoring: { mode: m } }))}>
                <b style={{ marginTop: 0 }}>{t}</b><span>{d}</span>
              </button>
            ))}
          </div>
          {scoringMode === "sum" && (
            <div style={{ marginTop: 16 }}>
              <div className="label">Faixas das telas finais</div>
              {endings.map((e) => (
                <div key={e.id} className="row" style={{ marginBottom: 8 }}>
                  <span className="grow small">{e.title}</span>
                  <input className="input" style={{ width: 90 }} type="number" placeholder="mín" value={e.min ?? ""} onChange={(ev) => updE(e.id, { min: ev.target.value })} />
                  <span className="muted">a</span>
                  <input className="input" style={{ width: 90 }} type="number" placeholder="máx" value={e.max ?? ""} onChange={(ev) => updE(e.id, { max: ev.target.value })} />
                </div>
              ))}
              <div className="hint">Pontuação máxima possível: {qs.reduce((s, q) => s + (q.options ? (q.multiple ? q.options.reduce((a, o) => a + Math.max(0, Number(o.score) || 0), 0) : Math.max(0, ...q.options.map((o) => Number(o.score) || 0))) : q.scoreAnswer ? (q.type === "rating" ? q.stars || 5 : q.type === "opinion_scale" ? q.scale?.max ?? 10 : 0) : 0), 0)} pontos.</div>
            </div>
          )}
        </div>
        {qs.map((q, qi) => (
          <div key={q.id} className="card logic-q">
            <div className="head">
              <span className="qnum">{typeInfo(q.type).icon} {qi + 1}</span>
              <b className="grow" style={{ fontWeight: 500 }}>{q.title || typeInfo(q.type).label}</b>
              {q.type !== "statement" && <button className="btn sm" onClick={() => updQ(q.id, { logic: [...(q.logic || []), { id: uid("r_"), op: q.options ? "eq" : "answered", value: q.options?.[0]?.label || "", goto: "" }] })}>+ Regra</button>}
            </div>
            {(q.logic || []).map((r) => (
              <div className="rule" key={r.id}>
                <div className="row">
                  <span className="kw">Se</span>
                  <span className="small muted">a resposta</span>
                  <select className="select" style={{ width: "auto" }} value={r.op} onChange={(e) => updQ(q.id, { logic: q.logic.map((x) => (x.id === r.id ? { ...x, op: e.target.value } : x)) })}>
                    {LOGIC_OPS.filter((o) => (CHOICE_TYPES.includes(q.type) ? !["gt", "lt"].includes(o.op) : true)).map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  {!["answered", "empty"].includes(r.op) && (q.options && r.op !== "contains" ? (
                    <select className="select grow" value={r.value} onChange={(e) => updQ(q.id, { logic: q.logic.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)) })}>
                      {q.options.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input className="input grow" value={r.value} placeholder="valor" onChange={(e) => updQ(q.id, { logic: q.logic.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)) })} />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="kw">Então</span>
                  <span className="small muted">vá para</span>
                  <select className="select grow" value={r.goto} onChange={(e) => updQ(q.id, { logic: q.logic.map((x) => (x.id === r.id ? { ...x, goto: e.target.value } : x)) })}>
                    <option value="">Escolha o destino...</option>
                    {gotoOptions(qi)}
                  </select>
                  <button className="btn ghost icon" aria-label="Remover regra" onClick={() => updQ(q.id, { logic: q.logic.filter((x) => x.id !== r.id) })}>×</button>
                </div>
              </div>
            ))}
            {!(q.logic || []).length && <div className="muted small">{q.type === "statement" ? "Declarações seguem para a próxima pergunta." : "Sem regras. Segue para a próxima pergunta."}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  // ---------- aba design ----------
  const PRESETS = [
    { name: "Caza Vinho", accent: "#6B1E2E", bg: "#050505", text: "#F2EDE8" },
    { name: "Rubi", accent: "#9B1B30", bg: "#0D0D0D", text: "#F2EDE8" },
    { name: "Off-white", accent: "#6B1E2E", bg: "#F2EDE8", text: "#151515" },
    { name: "Grafite", accent: "#8A8A8A", bg: "#151515", text: "#F2EDE8" },
  ];
  const t = form.theme;
  const designTab = (
    <div className="bcol editor">
      <div className="editor-inner">
        <h2>Design</h2>
        <p className="sub">Identidade visual deste formulário. O padrão segue a marca Caza Millennium.</p>
        <Field label="Temas prontos">
          <div className="row" style={{ flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button key={p.name} className="btn sm" onClick={() => setTheme({ accent: p.accent, bg: p.bg, text: p.text })}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: p.bg, border: `3px solid ${p.accent}` }} />{p.name}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid3">
          {[["accent", "Cor de destaque"], ["bg", "Fundo"], ["text", "Texto"]].map(([k, l]) => (
            <Field key={k} label={l}>
              <div className="color-in">
                <input type="color" value={t[k]} onChange={(e) => setTheme({ [k]: e.target.value })} />
                <input className="input mono" value={t[k]} onChange={(e) => setTheme({ [k]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>
        <Field label="Tipografia dos títulos">
          <select className="select" value={t.font} onChange={(e) => setTheme({ font: e.target.value })}>
            <option value="serif">Serifada elegante (Playfair Display)</option>
            <option value="sans">Moderna (Inter)</option>
          </select>
        </Field>
        <Field label="Logo (URL de imagem PNG/SVG)"><input className="input" value={t.logo || ""} onChange={(e) => setTheme({ logo: e.target.value })} placeholder="https://..." /></Field>
        <Field label="Imagem de capa na boas-vindas (URL)"><input className="input" value={t.cover || ""} onChange={(e) => setTheme({ cover: e.target.value })} placeholder="https://..." /></Field>
        <Field label="Imagem de fundo (URL)" hint="Recebe um véu escuro automático para manter a leitura."><input className="input" value={t.bgImage || ""} onChange={(e) => setTheme({ bgImage: e.target.value })} placeholder="https://..." /></Field>
      </div>
    </div>
  );

  // ---------- aba configurações ----------
  const s = form.settings;
  const embed = `<iframe src="${url}" style="width:100%;height:600px;border:0;border-radius:12px" allow="clipboard-write"></iframe>`;
  async function testWebhook() {
    if (!s.webhook_url) return;
    try {
      await fetch(s.webhook_url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ event: "test", form: { id: form.id, title: form.title, slug: form.slug }, answers: qs.filter((q) => q.type !== "statement").map((q) => ({ id: q.id, ref: q.ref || null, title: q.title, value: "exemplo" })) }) });
      alert("Teste enviado. Confira no seu Make/Zapier/n8n.");
    } catch { alert("Não foi possível enviar o teste."); }
  }
  const settingsTab = (
    <div className="bcol editor">
      <div className="editor-inner">
        <h2>Configurações</h2>
        <p className="sub">Publicação, link, limites e integrações.</p>
        <div className="section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
          <h3>Publicação</h3>
          <Field label="Status">
            <select className="select" value={form.status} onChange={(e) => publish(e.target.value)}>
              <option value="draft">Rascunho (link desativado)</option>
              <option value="published">Publicado (recebendo respostas)</option>
              <option value="closed">Fechado (mostra a mensagem de encerramento)</option>
            </select>
          </Field>
          <Field label="Endereço do link" hint={url}>
            <div className="row">
              <span className="muted small mono">/f/</span>
              <input className="input mono" value={form.slug} onChange={(e) => patch({ slug: slugify(e.target.value) })} />
              <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(url); }}>Copiar</button>
            </div>
          </Field>
          <Field label="Incorporar em site ou landing page">
            <div className="code">{embed}</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(embed)}>Copiar código</button>
          </Field>
          <Field label="Campos ocultos e UTMs" hint="Tudo o que vier na URL é salvo junto da resposta e pode ser citado com {{nome_do_parametro}}.">
            <div className="code">{url}?utm_source=instagram&utm_campaign=bio&origem=stories</div>
          </Field>
        </div>
        <div className="section">
          <h3>Limites</h3>
          <div className="grid2">
            <Field label="Encerrar em"><input className="input" type="datetime-local" value={s.close_at ? s.close_at.slice(0, 16) : ""} onChange={(e) => setSettings({ close_at: e.target.value ? new Date(e.target.value).toISOString() : "" })} /></Field>
            <Field label="Limite de respostas"><input className="input" type="number" min={1} value={s.max_responses || ""} onChange={(e) => setSettings({ max_responses: e.target.value })} placeholder="sem limite" /></Field>
          </div>
          <Field label="Mensagem de formulário fechado"><input className="input" value={s.closed_message || ""} onChange={(e) => setSettings({ closed_message: e.target.value })} placeholder="Este formulário não está recebendo respostas no momento." /></Field>
          <Field label="Redirecionar ao concluir (URL)" hint="Usado quando a tela final não tem botão. Aceita variáveis, ex.: https://site.com/obrigado?nome={{nome}}">
            <input className="input" value={s.redirect_url || ""} onChange={(e) => setSettings({ redirect_url: e.target.value })} placeholder="https://..." />
          </Field>
        </div>
        <div className="section">
          <h3>Integrações</h3>
          <Field label="Notificar por e-mail" hint="A cada resposta concluída. Separe vários e-mails por vírgula. Requer a chave do Resend configurada no Supabase.">
            <input className="input" value={s.notify_email || ""} onChange={(e) => setSettings({ notify_email: e.target.value })} placeholder="equipe@cazamillennium.com.br" />
          </Field>
          <Field label="Webhook (Make, Zapier, n8n, Google Sheets)" hint="Recebe um POST em JSON com todas as respostas, pontuação, resultado e UTMs, assim que a pessoa conclui.">
            <div className="row">
              <input className="input" value={s.webhook_url || ""} onChange={(e) => setSettings({ webhook_url: e.target.value })} placeholder="https://hook.make.com/..." />
              <button className="btn sm" disabled={!s.webhook_url} onClick={testWebhook}>Testar</button>
            </div>
          </Field>
          <div className="hint">WhatsApp: configure o botão em cada tela final, na aba Criar.</div>
        </div>
      </div>
    </div>
  );

  const preview = (
    <aside className="preview-col">
      <div className="preview-tools">
        <span className="label" style={{ margin: 0 }}>Pré-visualização</span>
        <div className="btabs" style={{ margin: 0 }}>
          <button className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}>Desktop</button>
          <button className={device === "mobile" ? "on" : ""} onClick={() => setDevice("mobile")}>Celular</button>
        </div>
      </div>
      <div className={"device " + device}>
        <Runner form={form} mode="preview" startAt={tab === "build" ? sel : "welcome"} compact />
      </div>
      <div className="hint" style={{ textAlign: "center" }}>A pré-visualização não salva respostas.</div>
    </aside>
  );

  return (
    <div className="builder">
      <div className="bbar">
        <Link href="/forms" className="btn ghost sm">←</Link>
        <input className="title-in" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
        <span className={"badge " + form.status}><span className="dot" />{{ draft: "Rascunho", published: "Publicado", closed: "Fechado" }[form.status]}</span>
        <div className="btabs">
          {[["build", "Criar"], ["logic", "Lógica"], ["design", "Design"], ["settings", "Configurações"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <span className="save-state">{saveState}</span>
        <Link className="btn sm" href={`/forms/${form.id}/results`}>Respostas</Link>
        {form.status === "published" ? (
          <>
            <a className="btn sm" href={url} target="_blank" rel="noreferrer">Abrir ↗</a>
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(url); setSaveState("Link copiado"); }}>Copiar link</button>
          </>
        ) : (
          <button className="btn sm primary" onClick={() => publish("published")}>Publicar</button>
        )}
      </div>
      {tab === "build" ? (
        <div className="bbody">
          {list}
          <div className="bcol editor"><div className="editor-inner" key={sel}>{editor}</div></div>
          {preview}
        </div>
      ) : (
        <div className="bbody wide">
          {tab === "logic" ? logicTab : tab === "design" ? designTab : settingsTab}
          {preview}
        </div>
      )}
    </div>
  );
}
