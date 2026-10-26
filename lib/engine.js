// Núcleo do Caza Forms: tipos de pergunta, modelos, lógica, pontuação e recall.

export const QUESTION_TYPES = [
  { type: "short_text", label: "Texto curto", icon: "Aa", group: "Texto" },
  { type: "long_text", label: "Texto longo", icon: "¶", group: "Texto" },
  { type: "email", label: "E-mail", icon: "@", group: "Contato" },
  { type: "phone", label: "Telefone / WhatsApp", icon: "☏", group: "Contato" },
  { type: "number", label: "Número", icon: "#", group: "Texto" },
  { type: "multiple_choice", label: "Múltipla escolha", icon: "☰", group: "Escolha" },
  { type: "dropdown", label: "Lista suspensa", icon: "▾", group: "Escolha" },
  { type: "yes_no", label: "Sim / Não", icon: "◐", group: "Escolha" },
  { type: "opinion_scale", label: "Escala de opinião", icon: "⋯", group: "Avaliação" },
  { type: "rating", label: "Estrelas", icon: "★", group: "Avaliação" },
  { type: "date", label: "Data", icon: "▦", group: "Outros" },
  { type: "file_upload", label: "Upload de arquivo", icon: "⇪", group: "Outros" },
  { type: "statement", label: "Declaração", icon: "❝", group: "Outros" },
];

export const typeInfo = (t) => QUESTION_TYPES.find((x) => x.type === t) || { label: t, icon: "?" };
export const CHOICE_TYPES = ["multiple_choice", "dropdown", "yes_no"];
export const NUMERIC_TYPES = ["number", "opinion_scale", "rating"];

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 9);

export function newOption(label = "Nova opção") {
  return { id: uid("o_"), label, score: 0, category: "" };
}

export function newQuestion(type = "short_text") {
  const q = { id: uid("q_"), type, title: "", description: "", required: false, ref: "", placeholder: "", image: "", logic: [] };
  if (type === "multiple_choice" || type === "dropdown") {
    q.options = [newOption("Opção A"), newOption("Opção B"), newOption("Opção C")];
    q.multiple = false;
    q.allowOther = false;
  }
  if (type === "yes_no") q.options = [{ id: "yes", label: "Sim", score: 0, category: "" }, { id: "no", label: "Não", score: 0, category: "" }];
  if (type === "opinion_scale") { q.scale = { min: 0, max: 10, left: "Nada provável", right: "Muito provável" }; q.scoreAnswer = false; }
  if (type === "rating") { q.stars = 5; q.scoreAnswer = false; }
  if (type === "number") q.scoreAnswer = false;
  if (type === "statement") q.button = "Continuar";
  return q;
}

export function newEnding(title = "Obrigado!") {
  return { id: uid("e_"), title, message: "Recebemos suas respostas. Em breve entraremos em contato.", min: "", max: "", category: "",
    buttonLabel: "", buttonUrl: "", whatsappPhone: "", whatsappMessage: "" };
}

export const DEFAULT_THEME = { accent: "#6B1E2E", bg: "#050505", text: "#F2EDE8", logo: "", cover: "", font: "serif" };

export function defaultDefinition() {
  return {
    welcome: { enabled: true, title: "", description: "", button: "Começar", image: "" },
    questions: [newQuestion("short_text")],
    endings: [newEnding()],
    scoring: { mode: "none" },
  };
}

export function slugify(s) {
  return (s || "form").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "form";
}

// ---------- valores ----------
export function formatValue(v) {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return v.name || v.path || JSON.stringify(v);
  return String(v);
}

export function isEmpty(v) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

// ---------- recall {{variavel}} ----------
export function buildContext(def, answers, extra = {}) {
  const ctx = { ...extra };
  for (const q of def.questions || []) {
    const val = formatValue(answers[q.id]);
    ctx[q.id] = val;
    if (q.ref) ctx[q.ref] = val;
  }
  return ctx;
}

export function recall(text, ctx) {
  if (!text) return "";
  return String(text).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (_, k) => (ctx[k] !== undefined && ctx[k] !== "" ? ctx[k] : ""));
}

// ---------- lógica ----------
const norm = (x) => String(x ?? "").trim().toLowerCase();

export const LOGIC_OPS = [
  { op: "eq", label: "é igual a" },
  { op: "neq", label: "é diferente de" },
  { op: "contains", label: "contém" },
  { op: "gt", label: "é maior que" },
  { op: "lt", label: "é menor que" },
  { op: "answered", label: "foi respondida" },
  { op: "empty", label: "ficou em branco" },
];

export function ruleMatches(rule, answer) {
  const arr = Array.isArray(answer) ? answer : [answer];
  const v = rule.value;
  switch (rule.op) {
    case "eq": return arr.some((x) => norm(x) === norm(v));
    case "neq": return !arr.some((x) => norm(x) === norm(v));
    case "contains": return arr.some((x) => norm(x).includes(norm(v)));
    case "gt": return !isEmpty(answer) && Number(answer) > Number(v);
    case "lt": return !isEmpty(answer) && Number(answer) < Number(v);
    case "answered": return !isEmpty(answer);
    case "empty": return isEmpty(answer);
    default: return false;
  }
}

// devolve { index } para próxima pergunta, ou { ending: id|null } para finalizar
export function nextStep(def, index, answers) {
  const qs = def.questions || [];
  const q = qs[index];
  for (const rule of q?.logic || []) {
    if (!rule.goto) continue;
    if (ruleMatches(rule, answers[q.id])) {
      if (rule.goto.startsWith("end:")) return { ending: rule.goto.slice(4) };
      const i = qs.findIndex((x) => x.id === rule.goto);
      if (i >= 0) return { index: i };
    }
  }
  if (index + 1 < qs.length) return { index: index + 1 };
  return { ending: null };
}

// ---------- pontuação ----------
export function computeScore(def, answers) {
  let score = 0;
  const cats = {};
  for (const q of def.questions || []) {
    const a = answers[q.id];
    if (isEmpty(a)) continue;
    if (q.options) {
      const picked = Array.isArray(a) ? a : [a];
      for (const label of picked) {
        const o = q.options.find((x) => norm(x.label) === norm(label));
        if (!o) continue;
        const pts = Number(o.score) || 0;
        score += pts;
        if (o.category) cats[o.category] = (cats[o.category] || 0) + (pts || 1);
      }
    } else if (q.scoreAnswer && !isNaN(Number(a))) {
      score += Number(a);
    }
  }
  return { score, cats };
}

export function pickEnding(def, answers, forcedId) {
  const endings = def.endings || [];
  const { score, cats } = computeScore(def, answers);
  const mode = def.scoring?.mode || "none";
  let ending = null;
  let result = null;
  if (forcedId) ending = endings.find((e) => e.id === forcedId) || null;
  if (!ending && mode === "sum") {
    ending = endings.find((e) => (e.min === "" || e.min == null || score >= Number(e.min)) && (e.max === "" || e.max == null || score <= Number(e.max))) || null;
  }
  if (!ending && mode === "category") {
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (top) { result = top[0]; ending = endings.find((e) => norm(e.category) === norm(top[0])) || null; }
  }
  if (!ending) ending = endings[0] || newEnding();
  if (!result) result = mode === "none" ? ending.title : ending.category || ending.title;
  return { ending, score: mode === "none" ? null : score, result, cats };
}

// ---------- telefone BR ----------
export function maskPhone(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function validate(q, v) {
  if (q.type === "statement") return null;
  if (isEmpty(v)) return q.required ? "Esta pergunta é obrigatória." : null;
  if (q.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Digite um e-mail válido.";
  if (q.type === "phone" && String(v).replace(/\D/g, "").length < 10) return "Digite um telefone com DDD.";
  if (q.type === "number" && isNaN(Number(v))) return "Digite apenas números.";
  return null;
}

// ---------- modelos prontos ----------
export function templateOratoria() {
  const nome = { ...newQuestion("short_text"), title: "Antes de tudo, qual é o seu nome?", ref: "nome", required: true, placeholder: "Seu nome" };
  const whats = { ...newQuestion("phone"), title: "{{nome}}, qual é o seu WhatsApp?", description: "É por lá que enviamos o seu diagnóstico completo.", ref: "whatsapp", required: true };
  const cargo = { ...newQuestion("multiple_choice"), title: "Qual destas opções descreve melhor a sua posição hoje?", ref: "cargo", required: true,
    options: [
      { id: uid("o_"), label: "Empresário(a) ou sócio(a)", score: 0, category: "" },
      { id: uid("o_"), label: "Diretor(a) ou gestor(a)", score: 0, category: "" },
      { id: uid("o_"), label: "Profissional liberal", score: 0, category: "" },
      { id: uid("o_"), label: "Quero me tornar palestrante", score: 0, category: "" },
    ] };
  const freq = { ...newQuestion("multiple_choice"), title: "Com que frequência você fala em público?", description: "Reuniões, palestras, vídeos, apresentações para clientes.", ref: "frequencia", required: true,
    options: [
      { id: uid("o_"), label: "Quase nunca, evito sempre que posso", score: 1, category: "" },
      { id: uid("o_"), label: "Algumas vezes por ano", score: 3, category: "" },
      { id: uid("o_"), label: "Todo mês", score: 6, category: "" },
      { id: uid("o_"), label: "Toda semana", score: 9, category: "" },
    ] };
  const nervo = { ...newQuestion("opinion_scale"), title: "De 0 a 10, qual é o seu nível de segurança quando precisa falar para um grupo?", ref: "seguranca", required: true,
    scale: { min: 0, max: 10, left: "Travo completamente", right: "Totalmente à vontade" }, scoreAnswer: true };
  const desafio = { ...newQuestion("multiple_choice"), title: "Qual é o seu maior desafio hoje?", ref: "desafio", required: true,
    options: [
      { id: uid("o_"), label: "Nervosismo e insegurança", score: 1, category: "" },
      { id: uid("o_"), label: "Organizar as ideias e ser objetivo", score: 3, category: "" },
      { id: uid("o_"), label: "Prender a atenção e convencer", score: 5, category: "" },
      { id: uid("o_"), label: "Transformar a fala em vendas e autoridade", score: 7, category: "" },
    ] };
  const zap = "Olá, Airton! Sou {{nome}}, fiz o Diagnóstico de Oratória e meu resultado foi {{resultado}} ({{pontuacao}} pontos). Quero entender o próximo passo.";
  return {
    title: "Diagnóstico de Oratória",
    definition: {
      welcome: { enabled: true, title: "Descubra em 2 minutos o seu nível de oratória", description: "Responda 6 perguntas rápidas e receba um diagnóstico de onde você está e qual é o próximo passo para ser ouvido de verdade.", button: "Fazer meu diagnóstico", image: "" },
      questions: [nome, whats, cargo, freq, nervo, desafio],
      endings: [
        { ...newEnding("Comunicador em formação"), category: "Comunicador em formação", min: 0, max: 12,
          message: "{{nome}}, sua pontuação foi {{pontuacao}}. Hoje a insegurança ainda decide por você quando é hora de falar. A boa notícia: isso é técnica, não talento. O primeiro passo é construir uma base sólida de presença e estrutura de fala.",
          buttonLabel: "Quero meu plano no WhatsApp", whatsappPhone: "", whatsappMessage: zap },
        { ...newEnding("Comunicador em evolução"), category: "Comunicador em evolução", min: 13, max: 22,
          message: "{{nome}}, sua pontuação foi {{pontuacao}}. Você já fala, mas ainda não domina a sala. Falta método para organizar a mensagem, prender a atenção e conduzir o público até a decisão.",
          buttonLabel: "Quero meu plano no WhatsApp", whatsappPhone: "", whatsappMessage: zap },
        { ...newEnding("Comunicador de autoridade"), category: "Comunicador de autoridade", min: 23, max: "",
          message: "{{nome}}, sua pontuação foi {{pontuacao}}. Você tem base e frequência. O próximo nível é transformar a sua fala em autoridade e em negócios: palco, posicionamento e persuasão.",
          buttonLabel: "Quero meu plano no WhatsApp", whatsappPhone: "", whatsappMessage: zap },
      ],
      scoring: { mode: "sum" },
    },
  };
}

export function templateLeads() {
  const nome = { ...newQuestion("short_text"), title: "Qual é o seu nome?", ref: "nome", required: true };
  const email = { ...newQuestion("email"), title: "Prazer, {{nome}}! Qual é o seu melhor e-mail?", ref: "email", required: true, placeholder: "nome@empresa.com" };
  const whats = { ...newQuestion("phone"), title: "E o seu WhatsApp?", ref: "whatsapp", required: true };
  const empresa = { ...newQuestion("short_text"), title: "Qual é o nome da sua empresa?", ref: "empresa" };
  const fat = { ...newQuestion("dropdown"), title: "Qual é o faturamento mensal aproximado?", ref: "faturamento", required: true,
    options: ["Até R$ 20 mil", "R$ 20 mil a R$ 50 mil", "R$ 50 mil a R$ 100 mil", "Acima de R$ 100 mil"].map((l) => newOption(l)) };
  return {
    title: "Captação de leads",
    definition: {
      welcome: { enabled: true, title: "Vamos conversar?", description: "Leva menos de 1 minuto.", button: "Começar", image: "" },
      questions: [nome, email, whats, empresa, fat],
      endings: [{ ...newEnding("Obrigado, {{nome}}!"), message: "Recebemos seus dados. Nossa equipe fala com você em breve pelo WhatsApp." }],
      scoring: { mode: "none" },
    },
  };
}
