"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { sb } from "@/lib/supabase";
import { DEFAULT_THEME, buildContext, recall, nextStep, pickEnding, validate, maskPhone, isEmpty, CHOICE_TYPES } from "@/lib/engine";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function initialStep(def, startAt) {
  const qs = def.questions || [];
  if (startAt && startAt.startsWith("end:")) return { kind: "end", endingId: startAt.slice(4), preview: true };
  if (startAt && startAt !== "welcome") {
    const i = qs.findIndex((q) => q.id === startAt);
    if (i >= 0) return { kind: "q", index: i };
  }
  if (def.welcome?.enabled || startAt === "welcome") return { kind: "welcome" };
  return qs.length ? { kind: "q", index: 0 } : { kind: "end", endingId: null };
}

export default function Runner({ form, mode = "live", startAt, compact = false, full = false, hidden = {} }) {
  const def = form.definition || {};
  const theme = { ...DEFAULT_THEME, ...(form.theme || {}) };
  const qs = def.questions || [];
  const live = mode === "live";

  const [step, setStep] = useState(() => initialStep(def, startAt));
  const [answers, setAnswers] = useState({});
  const [history, setHistory] = useState([]);
  const [dir, setDir] = useState("fwd");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [final, setFinal] = useState(null);
  const resp = useRef(null);
  const startPromise = useRef(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const timer = useRef(null);

  // pré-visualização: reposiciona quando o item selecionado muda
  useEffect(() => {
    if (!live) { setStep(initialStep(def, startAt)); setErr(""); setFinal(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt]);

  // registra visita
  useEffect(() => {
    if (!live || !form.id || !form.is_open) return;
    let seen = false;
    try { seen = sessionStorage.getItem("cf_view_" + form.id) === "1"; sessionStorage.setItem("cf_view_" + form.id, "1"); } catch {}
    if (!seen) sb().rpc("record_view", { p_form: form.id }).then(() => {});
  }, [live, form.id, form.is_open]);

  // foco automático no campo
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => {
      if (inputRef.current) inputRef.current.focus({ preventScroll: true });
      else rootRef.current?.focus({ preventScroll: true });
    }, 420);
    return () => clearTimeout(t);
  }, [step, live]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // no formulário publicado, atalhos funcionam em qualquer ponto da página
  const keyRef = useRef(null);
  useEffect(() => {
    if (!live) return;
    const h = (e) => keyRef.current && keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [live]);

  const q = step.kind === "q" ? qs[step.index] : null;
  const ctx = useMemo(
    () => buildContext(def, answers, { ...hidden, pontuacao: final?.score ?? "", resultado: final?.result ?? "" }),
    [def, answers, hidden, final]
  );
  const R = (t) => recall(t, ctx);

  async function ensureStarted() {
    if (!live) return null;
    if (resp.current) return resp.current;
    if (!startPromise.current) {
      startPromise.current = sb().rpc("start_response", { p_form: form.id, p_hidden: hidden }).then(({ data, error }) => {
        if (error) throw error;
        resp.current = data;
        return data;
      });
    }
    return startPromise.current;
  }

  async function save(ans, lastId, progress, complete = false, extra = {}) {
    if (!live) return;
    const r = await ensureStarted();
    if (!r) return;
    const { error } = await sb().rpc("save_response", {
      p_id: r.id, p_token: r.token, p_answers: ans, p_last: lastId, p_progress: progress,
      p_complete: complete, p_score: extra.score ?? null, p_ending: extra.ending ?? null, p_result: extra.result ?? null,
    });
    if (error) throw error;
  }

  function setAnswer(id, v) {
    setErr("");
    setAnswers((a) => ({ ...a, [id]: v }));
  }

  async function finish(forcedId, ans) {
    const { ending, score, result } = pickEnding(def, ans, forcedId);
    setBusy(true);
    try {
      await save(ans, "__end", qs.length, true, { score, ending: ending.id, result });
    } catch (e) {
      setBusy(false);
      setErr("Não foi possível enviar. Verifique sua conexão e tente de novo.");
      return;
    }
    setBusy(false);
    setFinal({ score, result });
    setDir("fwd");
    setStep({ kind: "end", endingId: ending.id });
    const redirect = form.settings?.redirect_url;
    if (live && redirect && !ending.buttonLabel) {
      const url = recall(redirect, buildContext(def, ans, { ...hidden, pontuacao: score ?? "", resultado: result ?? "" }));
      setTimeout(() => { window.top.location.href = url; }, 2200);
    }
  }

  async function goNext(ans = answers) {
    if (busy) return;
    clearTimeout(timer.current);
    if (step.kind === "welcome") {
      ensureStarted()?.catch(() => {});
      if (!qs.length) return finish(null, ans);
      setDir("fwd");
      setHistory((h) => [...h, step]);
      setStep({ kind: "q", index: 0 });
      return;
    }
    if (step.kind !== "q") return;
    const v = ans[q.id];
    const e = validate(q, v);
    if (e) { setErr(e); return; }
    const nx = nextStep(def, step.index, ans);
    if (live) save(ans, q.id, step.index + 1).catch(() => {});
    if (nx.index !== undefined) {
      setDir("fwd");
      setHistory((h) => [...h, step]);
      setStep({ kind: "q", index: nx.index });
      setErr("");
    } else {
      await finish(nx.ending, ans);
    }
  }

  function goBack() {
    if (!history.length || step.kind === "end") return;
    clearTimeout(timer.current);
    setDir("back");
    setErr("");
    setStep(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }

  function pickChoice(opt) {
    if (!q) return;
    const cur = answers[q.id];
    if (q.multiple) {
      const arr = Array.isArray(cur) ? cur : [];
      const next = arr.includes(opt.label) ? arr.filter((x) => x !== opt.label) : [...arr, opt.label];
      setAnswer(q.id, next);
      return;
    }
    const ans = { ...answers, [q.id]: opt.label };
    setAnswers(ans);
    setErr("");
    timer.current = setTimeout(() => goNext(ans), 380);
  }

  function onKeyDown(e) {
    const tag = e.target.tagName;
    if (e.key === "Enter") {
      if (tag === "TEXTAREA" && e.shiftKey) return;
      if (tag === "BUTTON" || tag === "A") return;
      if (step.kind === "end") return;
      e.preventDefault();
      goNext();
      return;
    }
    if (!q || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((q.type === "multiple_choice" || q.type === "yes_no") && e.key.length === 1) {
      const k = e.key.toUpperCase();
      if (q.type === "yes_no" && (k === "S" || k === "Y")) return pickChoice(q.options[0]);
      if (q.type === "yes_no" && k === "N") return pickChoice(q.options[1]);
      const i = LETTERS.indexOf(k);
      if (i >= 0 && q.options[i]) pickChoice(q.options[i]);
    }
    if ((q.type === "opinion_scale") && /^[0-9]$/.test(e.key)) {
      const n = Number(e.key);
      const { min = 0, max = 10 } = q.scale || {};
      if (n >= min && n <= max) { const ans = { ...answers, [q.id]: n }; setAnswers(ans); timer.current = setTimeout(() => goNext(ans), 380); }
    }
  }

  keyRef.current = onKeyDown;

  async function onFile(file) {
    if (!file || !q) return;
    if (file.size > 10 * 1024 * 1024) { setErr("Arquivo acima de 10 MB."); return; }
    if (!live) { setAnswer(q.id, { name: file.name, size: file.size }); return; }
    setBusy(true);
    try {
      const r = await ensureStarted();
      const safe = file.name.normalize("NFD").replace(/[^\w.\-]+/g, "_");
      const path = `${form.id}/${r.id}/${Date.now()}-${safe}`;
      const { error } = await sb().storage.from("uploads").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      setAnswer(q.id, { name: file.name, path, size: file.size, type: file.type });
    } catch (e) {
      setErr("Falha no envio do arquivo. Tente novamente.");
    }
    setBusy(false);
  }

  const isLight = (() => { const h = String(theme.bg || "").replace("#", ""); if (h.length < 6) return false; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 150; })();
  const accentText = isLight ? theme.accent : `color-mix(in srgb, ${theme.accent} 45%, #ffffff)`;
  const style = {
    "--r-bg": theme.bg, "--r-fg": theme.text, "--r-accent": theme.accent, "--r-accent-text": accentText,
    "--r-font": theme.font === "sans" ? "var(--sans)" : "var(--serif)",
  };
  if (theme.bgImage) style.background = `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.75)), url(${theme.bgImage}) center/cover, ${theme.bg}`;

  const total = qs.length || 1;
  const pct = step.kind === "end" ? 100 : step.kind === "welcome" ? 0 : Math.round((step.index / total) * 100);

  const closed = live && form.is_open === false;
  const enterHint = <span className="r-enter">pressione <b>Enter ↵</b></span>;

  function renderInput() {
    const v = answers[q.id];
    switch (q.type) {
      case "short_text":
      case "email":
      case "number":
        return (
          <input ref={inputRef} className="r-input" type={q.type === "email" ? "email" : "text"} inputMode={q.type === "number" ? "decimal" : q.type === "email" ? "email" : "text"}
            placeholder={q.placeholder || (q.type === "email" ? "nome@exemplo.com" : "Digite sua resposta aqui...")}
            value={v ?? ""} onChange={(e) => setAnswer(q.id, q.type === "number" ? e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", ".") : e.target.value)} />
        );
      case "phone":
        return (
          <input ref={inputRef} className="r-input" type="tel" inputMode="tel" placeholder={q.placeholder || "(11) 91234-5678"}
            value={v ?? ""} onChange={(e) => setAnswer(q.id, maskPhone(e.target.value))} />
        );
      case "long_text":
        return (
          <>
            <textarea ref={inputRef} className="r-input" rows={3} placeholder={q.placeholder || "Digite sua resposta aqui..."}
              value={v ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
            <div className="r-enter" style={{ marginTop: 8 }}><b>Shift + Enter ↵</b> para nova linha</div>
          </>
        );
      case "date":
        return <input ref={inputRef} className="r-input" type="date" value={v ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} style={{ maxWidth: 300 }} />;
      case "dropdown":
        return (
          <select ref={inputRef} className="r-input" value={v ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)}>
            <option value="">Selecione uma opção...</option>
            {q.options.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
          </select>
        );
      case "multiple_choice":
      case "yes_no": {
        const arr = Array.isArray(v) ? v : v ? [v] : [];
        const labels = q.options.map((o) => o.label);
        const otherVal = arr.find((x) => !labels.includes(x));
        return (
          <div className="r-choices">
            {q.multiple && <div className="r-enter" style={{ marginTop: -14, marginBottom: 6 }}>Escolha quantas quiser</div>}
            {q.options.map((o, i) => (
              <button type="button" key={o.id} className={"r-choice" + (arr.includes(o.label) ? " sel" : "")} onClick={() => pickChoice(o)}>
                <span className="r-key">{q.type === "yes_no" ? o.label[0] : LETTERS[i]}</span>
                <span>{o.label}</span><span className="ck">✓</span>
              </button>
            ))}
            {q.allowOther && (
              <input className="r-input r-other" placeholder="Outro (escreva aqui)" value={otherVal ?? ""}
                onChange={(e) => {
                  const keep = arr.filter((x) => labels.includes(x));
                  const t = e.target.value;
                  setAnswer(q.id, q.multiple ? (t ? [...keep, t] : keep) : t);
                }} style={{ fontSize: 17 }} />
            )}
          </div>
        );
      }
      case "opinion_scale": {
        const { min = 0, max = 10, left, right } = q.scale || {};
        const nums = []; for (let n = Number(min); n <= Number(max); n++) nums.push(n);
        return (
          <div>
            <div className="r-scale">
              {nums.map((n) => (
                <button type="button" key={n} className={v === n ? "sel" : ""}
                  onClick={() => { const ans = { ...answers, [q.id]: n }; setAnswers(ans); setErr(""); timer.current = setTimeout(() => goNext(ans), 380); }}>{n}</button>
              ))}
            </div>
            <div className="r-scale-lbl"><span>{left}</span><span>{right}</span></div>
          </div>
        );
      }
      case "rating": {
        const n = Number(q.stars) || 5;
        return (
          <div className="r-stars">
            {Array.from({ length: n }, (_, i) => i + 1).map((s) => (
              <button type="button" key={s} className={v >= s ? "on" : ""} aria-label={`${s} estrelas`}
                onClick={() => { const ans = { ...answers, [q.id]: s }; setAnswers(ans); setErr(""); timer.current = setTimeout(() => goNext(ans), 420); }}>★</button>
            ))}
          </div>
        );
      }
      case "file_upload":
        return (
          <label className="r-drop">
            <input type="file" accept="image/*,application/pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0])} />
            {v?.name ? (<><div style={{ fontSize: 18 }}>📎 {v.name}</div><div className="r-enter" style={{ marginTop: 8 }}>Clique para trocar o arquivo</div></>)
              : (<><div style={{ fontSize: 30, marginBottom: 8 }}>⇪</div><div style={{ fontSize: 17 }}>{busy ? "Enviando..." : "Clique para escolher um arquivo"}</div><div className="r-enter" style={{ marginTop: 6 }}>PDF ou imagem, até 10 MB</div></>)}
          </label>
        );
      default:
        return null;
    }
  }

  let body;
  if (closed) {
    body = (
      <div className="r-slide r-center">
        <h1 className="r-title">{form.settings?.closed_message || "Este formulário não está recebendo respostas no momento."}</h1>
      </div>
    );
  } else if (step.kind === "welcome") {
    const w = def.welcome || {};
    body = (
      <div className={"r-slide r-center" + (dir === "back" ? " back" : "")} key="welcome">
        {theme.cover && <img className="r-cover" src={theme.cover} alt="" />}
        {w.image && <img className="r-img" style={{ margin: "0 auto 22px" }} src={w.image} alt="" />}
        <h1 className="r-title" style={{ fontSize: compact ? 24 : "clamp(28px,4vw,42px)" }}>{R(w.title) || form.title}</h1>
        {w.description && <p className="r-desc">{R(w.description)}</p>}
        <div className="r-actions">
          <button className="r-btn" onClick={() => goNext()}>{w.button || "Começar"}</button>
          {enterHint}
        </div>
        {qs.length > 0 && <div className="r-enter" style={{ marginTop: 18 }}>⏱ Leva cerca de {Math.max(1, Math.round(qs.length * 0.25))} min</div>}
      </div>
    );
  } else if (step.kind === "q" && q) {
    const isStatement = q.type === "statement";
    const autoTypes = ["opinion_scale", "rating"];
    const singleChoice = CHOICE_TYPES.includes(q.type) && q.type !== "dropdown" && !q.multiple;
    body = (
      <div className={"r-slide" + (dir === "back" ? " back" : "")} key={q.id}>
        <div className="r-num">{isStatement ? "❝" : `${step.index + 1} →`}</div>
        <h1 className="r-title">{R(q.title) || <span style={{ opacity: .35 }}>Sua pergunta aqui</span>}{q.required && !isStatement && <span className="req"> *</span>}</h1>
        {q.description && <p className="r-desc">{R(q.description)}</p>}
        {q.image && <img className="r-img" src={q.image} alt="" />}
        {!q.description && !q.image && <div style={{ height: 14 }} />}
        {!isStatement && renderInput()}
        {err && <div className="r-err">⚠ {err}</div>}
        {(!(singleChoice || autoTypes.includes(q.type)) || q.allowOther || !isEmpty(answers[q.id]) || !q.required) && (
          <div className="r-actions">
            <button className="r-btn" disabled={busy} onClick={() => goNext()}>
              {busy ? "Enviando..." : step.index === qs.length - 1 && !(q.logic || []).length ? "Enviar" : isStatement ? (q.button || "Continuar") : "OK ✓"}
            </button>
            {q.type !== "long_text" && enterHint}
          </div>
        )}
      </div>
    );
  } else {
    const ending = (def.endings || []).find((e) => e.id === step.endingId) || (def.endings || [])[0] || { title: "Obrigado!", message: "" };
    const showScore = (def.scoring?.mode || "none") !== "none";
    const previewCtx = step.preview ? { ...ctx, pontuacao: "18", resultado: ending.category || ending.title } : ctx;
    const RR = (t) => recall(t, previewCtx);
    let href = null;
    if (ending.whatsappMessage || ending.whatsappPhone) {
      const phone = String(ending.whatsappPhone || "").replace(/\D/g, "");
      href = `https://wa.me/${phone}?text=${encodeURIComponent(RR(ending.whatsappMessage || ""))}`;
    } else if (ending.buttonUrl) href = RR(ending.buttonUrl);
    body = (
      <div className="r-slide r-center" key={"end" + ending.id}>
        {showScore && (step.preview || final) && <div className="r-result-tag">{RR(ending.category || ending.title)}</div>}
        <h1 className="r-title" style={{ fontSize: compact ? 24 : "clamp(26px,3.6vw,38px)" }}>{RR(ending.title)}</h1>
        {ending.message && <p className="r-desc">{RR(ending.message)}</p>}
        {ending.buttonLabel && href && (
          <div className="r-actions"><a className="r-btn" href={href} target="_blank" rel="noopener noreferrer">{RR(ending.buttonLabel)} →</a></div>
        )}
        {live && form.settings?.redirect_url && !ending.buttonLabel && <div className="r-enter" style={{ marginTop: 16 }}>Redirecionando...</div>}
      </div>
    );
  }

  return (
    <div ref={rootRef} tabIndex={-1} onKeyDown={live ? undefined : onKeyDown}className={"runner" + (compact ? " compact" : "") + (full ? " full" : "")} style={style}>
      <div className="r-progress"><div style={{ width: pct + "%" }} /></div>
      {theme.logo && <img className="r-logo" src={theme.logo} alt="" />}
      <div className="r-stage">{body}</div>
      {!closed && step.kind === "q" && (
        <div className="r-nav">
          <button aria-label="Voltar" disabled={!history.length} onClick={goBack}>↑</button>
          <button aria-label="Avançar" onClick={() => goNext()}>↓</button>
        </div>
      )}
      <div className="r-brand">Caza Forms</div>
    </div>
  );
}
