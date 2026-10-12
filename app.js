/* =========================================================
   Gênio $  —  controle financeiro pessoal
   Fluxo: login → carrega lançamentos do Supabase → render()
   Regra de ouro: muda os DADOS, depois chama render().
   ========================================================= */

/* ===== 1. Conexão com o Supabase (chaves ficam no config.js) ===== */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== 2. Categorias ===== */
const CATS = {
  saida: ["Alimentação","Mercado","Casa","Contas","Transporte","Saúde","Lazer","Educação","Compras","Loja","Outros"],
  entrada: ["Salário","Serviços","Vendas","Pix recebido","Extra","Outros"]
};

/* ===== 3. Estado ===== */
let lancamentos = [];
let minhasCats = [];                     // categorias criadas por você: [{id,tipo,nome}]                    // [{id,tipo,valor,descricao,categoria,data,criado_em}]
let mesAtual = hojeISO().slice(0, 7);    // "AAAA-MM"
let usuario = null;

/* ===== 4. Utilidades ===== */
const $ = id => document.getElementById(id);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = c => brl.format(c / 100);     // valores guardados em centavos (inteiro)
function paraCentavos(txt) {
  let t = String(txt).trim().replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
function hojeISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1);
function nomeMes(ym) { const [a, m] = ym.split("-").map(Number); return maiuscula(new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })); }
function nomeDia(iso) { const [a, m, d] = iso.split("-").map(Number); return maiuscula(new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })); }
function somaMes(ym, delta) { const [a, m] = ym.split("-").map(Number); const d = new Date(a, m - 1 + delta, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

/* ===== 5. Banco de dados (CRUD = Create, Read, Update, Delete) ===== */
const banco = {
  async listar() {
    const { data, error } = await sb.from("lancamentos").select("*").order("data", { ascending: false });
    if (error) throw error;
    return data;
  },
  async criar(x)       { const { error } = await sb.from("lancamentos").insert(x); if (error) throw error; },
  async criarVarios(l) { const { error } = await sb.from("lancamentos").insert(l); if (error) throw error; },
  async atualizar(id, x){ const { error } = await sb.from("lancamentos").update(x).eq("id", id); if (error) throw error; },
  async excluir(id)    { const { error } = await sb.from("lancamentos").delete().eq("id", id); if (error) throw error; },

  // Categorias que você cria (tabela "categorias")
  async listarCats() {
    const { data, error } = await sb.from("categorias").select("*").order("nome");
    if (error) throw error;
    return data;
  },
  async criarCat(x)    { const { error } = await sb.from("categorias").insert(x); if (error) throw error; },
  async excluirCat(id) { const { error } = await sb.from("categorias").delete().eq("id", id); if (error) throw error; }
};
async function recarregar() {
  try { lancamentos = await banco.listar(); } catch (e) { console.error(e); }
  try { minhasCats = await banco.listarCats(); } catch (e) { console.error(e); minhasCats = []; }
  render(); desenharMinhasCats();
}

/* ===== 6. Login ===== */
async function entrar(criar) {
  const email = $("lEmail").value.trim(), senha = $("lSenha").value;
  $("lErro").className = "erro";
  if (!email || senha.length < 6) { $("lErro").textContent = "Preencha o e-mail e uma senha de pelo menos 6 caracteres."; return; }
  $("lEntrar").disabled = $("lCriar").disabled = true;
  const r = criar
    ? await sb.auth.signUp({ email, password: senha })
    : await sb.auth.signInWithPassword({ email, password: senha });
  $("lEntrar").disabled = $("lCriar").disabled = false;
  if (r.error) { $("lErro").textContent = traduzErro(r.error.message); return; }
  if (criar && !r.data.session) {
    $("lErro").className = "erro ok";
    $("lErro").textContent = "Conta criada! Confirme pelo link que chegou no seu e-mail e depois toque em Entrar.";
  }
}
function traduzErro(m) {
  if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Toque em Entrar.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que chegou na caixa de entrada.";
  return m;
}
$("formLogin").addEventListener("submit", e => { e.preventDefault(); entrar(false); });
$("lCriar").onclick = () => entrar(true);

// Troca de tela conforme a pessoa está logada ou não
sb.auth.onAuthStateChange((_evento, sessao) => {
  usuario = sessao?.user || null;
  $("telaLogin").hidden = !!usuario;
  $("telaApp").hidden = !usuario;
  if (usuario) { $("mEmail").textContent = usuario.email; recarregar(); }
  else { lancamentos = []; }
});

/* ===== 7. Desenhar a tela ===== */
function render() {
  const hoje = hojeISO();
  let saldo = 0;
  for (const l of lancamentos) if (l.data <= hoje) saldo += l.tipo === "entrada" ? l.valor : -l.valor;
  $("saldo").textContent = fmt(saldo);
  $("saldo").classList.toggle("neg", saldo < 0);

  $("mesNome").textContent = nomeMes(mesAtual);
  const doMes = lancamentos.filter(l => l.data.startsWith(mesAtual))
    .sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em)));
  let ent = 0, sai = 0;
  for (const l of doMes) l.tipo === "entrada" ? ent += l.valor : sai += l.valor;
  $("rIn").textContent = fmt(ent);
  $("rOut").textContent = fmt(sai);
  $("rRes").textContent = fmt(ent - sai);
  $("rRes").className = "num " + (ent - sai < 0 ? "out" : "");

  const porCat = {};
  for (const l of doMes) if (l.tipo === "saida") porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor;
  const ord = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const maior = ord.length ? ord[0][1] : 1;
  $("cats").innerHTML = ord.length ? ord.map(([c, v]) => `
    <div class="cat">
      <span class="nome">${esc(c)}</span>
      <span class="v num">${fmt(v)}<span class="pct">${Math.round(v / sai * 100)}%</span></span>
      <span class="trilho"><i style="width:${(v / maior * 100).toFixed(1)}%"></i></span>
    </div>`).join("")
    : `<div class="vazio">Nenhuma saída neste mês.</div>`;

  if (!doMes.length) {
    $("lista").innerHTML = `<div class="vazio"><b>Nada lançado em ${esc(nomeMes(mesAtual))}</b><br>Toque em <b>+ Entrada</b> ou <b>− Saída</b> lá embaixo.</div>`;
    return;
  }
  const dias = {};
  for (const l of doMes) (dias[l.data] ||= []).push(l);
  $("lista").innerHTML = Object.entries(dias).map(([d, itens]) => {
    const tot = itens.reduce((s, l) => s + (l.tipo === "entrada" ? l.valor : -l.valor), 0);
    return `<div class="dia"><h3><span>${esc(nomeDia(d))}</span><span class="num">${fmt(tot)}</span></h3>
      ${itens.map(l => `<button class="item" data-id="${esc(l.id)}">
        <span class="desc">${esc(l.descricao || l.categoria)}</span>
        <span class="val num ${l.tipo === "entrada" ? "in" : "out"}">${l.tipo === "entrada" ? "+" : "−"} ${fmt(l.valor)}</span>
        <span class="cat2">${esc(l.categoria)}</span>
      </button>`).join("")}</div>`;
  }).join("");
}

/* ===== 8. Formulário de lançamento ===== */
let editando = null, tipoForm = "saida", catSel = null, centavos = 0;

// --- 8.1 Valor estilo app de banco: só números, preenche da direita (centavos) ---
const fmtCampo = c => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function setValor(c) {
  centavos = c;
  const campo = $("f-valor");
  campo.value = fmtCampo(c);
  campo.style.width = (campo.value.length + 0.2) + "ch";   // campo cresce junto com o número
  campo.closest(".valor-box").classList.toggle("zerado", c === 0);
  requestAnimationFrame(() => campo.setSelectionRange(campo.value.length, campo.value.length)); // cursor sempre no fim
}
$("f-valor").addEventListener("input", e => {
  const digitos = e.target.value.replace(/\D/g, "").slice(0, 10);   // até R$ 99.999.999,99
  setValor(Number(digitos || 0));
});
$("f-valor").addEventListener("focus", e => setValor(centavos));
$("f-valor").addEventListener("click", e => setValor(centavos));

// --- 8.2 Categorias em botões (chips) + criar nova ---
// Lista final: padrões + as suas, com "Outros" sempre por último
function catsDo(tipo) {
  const minhas = minhasCats.filter(c => c.tipo === tipo).map(c => c.nome);
  const base = CATS[tipo].filter(c => c !== "Outros");
  const lista = [...base, ...minhas.filter(m => !base.includes(m)), "Outros"];
  if (catSel && !lista.includes(catSel)) lista.splice(lista.length - 1, 0, catSel); // categoria antiga já apagada
  return lista;
}
let criandoCat = false;
function desenharCats() {
  const chips = catsDo(tipoForm).map(c =>
    `<button type="button" class="chip" aria-pressed="${c === catSel}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  const nova = criandoCat
    ? `<input class="chip-input" id="catNome" maxlength="24" placeholder="Nome da categoria" autocomplete="off" enterkeyhint="done">`
    : `<button type="button" class="chip chip-nova" id="catNova">+ Nova</button>`;
  $("f-cats").innerHTML = chips + nova;
  if (criandoCat) $("catNome").focus();
}
async function salvarNovaCat() {
  const campo = $("catNome"); if (!campo || !criandoCat) return;
  const nome = campo.value.trim().replace(/\s+/g, " ");
  criandoCat = false;
  if (!nome) { desenharCats(); return; }
  const existente = catsDo(tipoForm).find(c => c.toLowerCase() === nome.toLowerCase());
  if (existente) { catSel = existente; desenharCats(); return; }
  try {
    await banco.criarCat({ tipo: tipoForm, nome });
    minhasCats = await banco.listarCats();
    catSel = nome; desenharMinhasCats();
  } catch (err) { $("fErro").textContent = "Não criou a categoria: " + err.message; }
  desenharCats();
}
$("f-cats").addEventListener("click", e => {
  if (e.target.id === "catNova") { criandoCat = true; desenharCats(); return; }
  const b = e.target.closest(".chip[data-cat]"); if (!b) return;
  catSel = b.dataset.cat; desenharCats();
});
$("f-cats").addEventListener("keydown", e => {
  if (e.target.id !== "catNome") return;
  if (e.key === "Enter") { e.preventDefault(); salvarNovaCat(); }   // Enter cria a categoria, não salva o lançamento
  if (e.key === "Escape") { e.stopPropagation(); criandoCat = false; desenharCats(); }
});
$("f-cats").addEventListener("focusout", e => { if (e.target.id === "catNome") salvarNovaCat(); });

// Lista "Minhas categorias" no menu Dados, com botão de remover
function desenharMinhasCats() {
  const el = $("mCats"); if (!el) return;
  if (!minhasCats.length) { el.innerHTML = `<p class="sub">Nenhuma ainda. Crie no botão <b>+ Nova</b> ao lançar.</p>`; return; }
  el.innerHTML = minhasCats.map(c => `<span class="chip chip-rem">${esc(c.nome)}
      <small>${c.tipo === "entrada" ? "entrada" : "saída"}</small>
      <button type="button" data-id="${esc(c.id)}" aria-label="Remover ${esc(c.nome)}">✕</button></span>`).join("");
}
$("mCats").addEventListener("click", async e => {
  const b = e.target.closest("button[data-id]"); if (!b) return;
  try {
    await banco.excluirCat(b.dataset.id);
    minhasCats = await banco.listarCats(); desenharMinhasCats();
    $("mMsg").className = "erro ok"; $("mMsg").textContent = "Categoria removida. Os lançamentos antigos continuam com ela.";
  } catch (err) { $("mMsg").className = "erro"; $("mMsg").textContent = "Não removeu: " + err.message; }
});

// --- 8.3 Data rápida: Hoje / Ontem / escolher ---
function diaISO(delta) { const d = new Date(); d.setDate(d.getDate() + delta); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function marcarData() {
  const v = $("f-data").value;
  $("dHoje").setAttribute("aria-pressed", v === diaISO(0));
  $("dOntem").setAttribute("aria-pressed", v === diaISO(-1));
  $("f-data").classList.toggle("ativo", v !== diaISO(0) && v !== diaISO(-1));
}
$("dHoje").onclick = () => { $("f-data").value = diaISO(0); marcarData(); };
$("dOntem").onclick = () => { $("f-data").value = diaISO(-1); marcarData(); };
$("f-data").addEventListener("change", marcarData);

// --- 8.4 Sugestões: descrições que você já usou, e a categoria vem junto ---
function atualizarSugestoes() {
  const vistos = new Map();
  for (const l of [...lancamentos].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))))
    if (l.descricao && l.tipo === tipoForm && !vistos.has(l.descricao.toLowerCase())) vistos.set(l.descricao.toLowerCase(), l);
  $("sugestoes").innerHTML = [...vistos.values()].slice(0, 30).map(l => `<option value="${esc(l.descricao)}">`).join("");
  return vistos;
}
$("f-desc").addEventListener("change", () => {
  const achado = atualizarSugestoes().get($("f-desc").value.trim().toLowerCase());
  if (achado && catsDo(tipoForm).includes(achado.categoria)) { catSel = achado.categoria; desenharCats(); }
});

// --- 8.5 Abrir / fechar ---
// Já deixa marcada a categoria que você mais usa nesse tipo (ou a primeira da lista)
function catMaisUsada(t) {
  const cont = {};
  for (const l of lancamentos) if (l.tipo === t) cont[l.categoria] = (cont[l.categoria] || 0) + 1;
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : CATS[t][0];
}
function setTipo(t, cat) {
  tipoForm = t;
  $("tSaida").setAttribute("aria-pressed", t === "saida");
  $("tEntrada").setAttribute("aria-pressed", t === "entrada");
  $("form").dataset.tipo = t;
  catSel = cat || catMaisUsada(t); criandoCat = false;
  desenharCats(); atualizarSugestoes();
}
function abrir(tipo, item) {
  editando = item || null;
  $("fTitulo").textContent = item ? "Editar lançamento" : (tipo === "entrada" ? "Nova entrada" : "Nova saída");
  setTipo(item ? item.tipo : tipo, item?.categoria);
  setValor(item ? item.valor : 0);
  $("f-desc").value = item?.descricao || "";
  $("f-data").value = item?.data || (mesAtual === hojeISO().slice(0, 7) ? hojeISO() : mesAtual + "-01");
  marcarData();
  $("fDel").hidden = !item;
  $("fErro").textContent = "";
  $("veu").hidden = false;
  setTimeout(() => $("f-valor").focus(), 60);
}
function fechar() { $("veu").hidden = true; editando = null; }

// --- 8.6 Aviso flutuante (toast) com "Desfazer" ---
let toastTimer = null;
function toast(msg, acao) {
  const t = $("toast");
  $("toastMsg").textContent = msg;
  $("toastAcao").hidden = !acao;
  $("toastAcao").onclick = async () => { t.hidden = true; await acao.fn(); };
  if (acao) $("toastAcao").textContent = acao.rotulo;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 5000);
}
const vibrar = () => { try { navigator.vibrate?.(12); } catch {} };

// --- 8.7 Salvar e excluir ---
$("form").addEventListener("submit", async e => {
  e.preventDefault();
  if (!centavos) { $("fErro").textContent = "Digite o valor."; $("f-valor").focus(); return; }
  if (!catSel) { $("fErro").textContent = "Escolha uma categoria."; return; }
  if (!$("f-data").value) { $("fErro").textContent = "Escolha a data."; return; }
  const dado = { tipo: tipoForm, valor: centavos, descricao: $("f-desc").value.trim(), categoria: catSel, data: $("f-data").value };
  $("fSalvar").disabled = true;
  try {
    editando ? await banco.atualizar(editando.id, dado) : await banco.criar(dado);
    mesAtual = dado.data.slice(0, 7);
    const eraEdicao = !!editando;
    fechar(); vibrar(); await recarregar();
    toast((dado.tipo === "entrada" ? "Entrada" : "Saída") + " de " + fmt(dado.valor) + (eraEdicao ? " atualizada" : " salva"));
  } catch (err) { $("fErro").textContent = "Não salvou: " + err.message; }
  $("fSalvar").disabled = false;
});
$("fDel").addEventListener("click", async () => {
  const item = editando;
  try {
    await banco.excluir(item.id); fechar(); vibrar(); await recarregar();
    const { tipo, valor, descricao, categoria, data } = item;
    toast("Lançamento excluído", { rotulo: "Desfazer", fn: async () => { await banco.criar({ tipo, valor, descricao, categoria, data }); await recarregar(); } });
  } catch (err) { $("fErro").textContent = "Não excluiu: " + err.message; }
});
$("fCancel").onclick = fechar;
$("veu").addEventListener("click", e => { if (e.target === $("veu")) fechar(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("veu").hidden) fechar(); });
$("tSaida").onclick = () => setTipo("saida");
$("tEntrada").onclick = () => setTipo("entrada");
$("novaSaida").onclick = () => abrir("saida");
$("novaEntrada").onclick = () => abrir("entrada");
$("lista").addEventListener("click", e => {
  const b = e.target.closest(".item"); if (!b) return;
  const item = lancamentos.find(l => String(l.id) === b.dataset.id); if (item) abrir(item.tipo, item);
});
$("ant").onclick = () => { mesAtual = somaMes(mesAtual, -1); render(); };
$("prox").onclick = () => { mesAtual = somaMes(mesAtual, 1); render(); };

/* ===== 9. Menu de dados: backup, importar, sair ===== */
$("abrirMenu").onclick = () => { $("mMsg").textContent = ""; $("veuMenu").hidden = false; };
$("mFechar").onclick = () => { $("veuMenu").hidden = true; };
$("veuMenu").addEventListener("click", e => { if (e.target === $("veuMenu")) $("veuMenu").hidden = true; });
$("mSair").onclick = async () => { $("veuMenu").hidden = true; await sb.auth.signOut(); };

$("mExportar").onclick = () => {
  const limpos = lancamentos.map(({ tipo, valor, descricao, categoria, data }) => ({ tipo, valor, descricao, categoria, data }));
  const blob = new Blob([JSON.stringify(limpos, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "genio-cash-backup-" + hojeISO() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
};

$("mImportar").onclick = async () => {
  const msg = $("mMsg"); msg.className = "erro";
  let lista;
  try { lista = JSON.parse($("mTexto").value); } catch { msg.textContent = "Texto inválido. Cole exatamente o backup copiado."; return; }
  if (!Array.isArray(lista)) { msg.textContent = "O backup precisa ser uma lista [ ... ]."; return; }
  const validos = lista
    .filter(x => (x.tipo === "entrada" || x.tipo === "saida") && Number.isInteger(x.valor) && x.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.data))
    .map(({ tipo, valor, descricao, categoria, data }) => ({ tipo, valor, descricao: descricao || "", categoria: categoria || "Outros", data }));
  if (!validos.length) { msg.textContent = "Nenhum lançamento válido encontrado."; return; }
  try {
    await banco.criarVarios(validos);
    msg.className = "erro ok";
    msg.textContent = validos.length + " lançamentos importados.";
    $("mTexto").value = "";
    await recarregar();
  } catch (err) { msg.textContent = "Falhou: " + err.message; }
};

/* ===== 9.1 Aparência: claro (padrão), escuro ou igual ao celular ===== */
function aplicarTema(t) {
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem("tema", t); } catch (e) {}
  const escuro = t === "escuro" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = escuro ? "#0D1220" : "#F2F4F8";
  document.querySelectorAll("#mTema .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.tema === t));
}
$("mTema").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) aplicarTema(b.dataset.tema); });
aplicarTema(document.documentElement.dataset.tema || "claro");

/* ===== 10. Modo app instalado (funciona abrindo mesmo com internet ruim) ===== */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
