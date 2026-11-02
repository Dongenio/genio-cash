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
let contas = [], pagamentos = [];        // contas do mês e quais já foram pagas
let aba = "extrato";

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
  async excluirCat(id) { const { error } = await sb.from("categorias").delete().eq("id", id); if (error) throw error; },

  // Lançamento que devolve o registro criado (pra ligar o pagamento a ele)
  async criarRetornando(x) {
    const { data, error } = await sb.from("lancamentos").insert(x).select().single();
    if (error) throw error;
    return data;
  },

  // Contas do mês (tabelas "contas" e "pagamentos")
  async listarContas() {
    const { data, error } = await sb.from("contas").select("*").order("dia");
    if (error) throw error;
    return data;
  },
  async criarConta(x)        { const { error } = await sb.from("contas").insert(x); if (error) throw error; },
  async atualizarConta(id, x){ const { error } = await sb.from("contas").update(x).eq("id", id); if (error) throw error; },
  async listarPagamentos() {
    const { data, error } = await sb.from("pagamentos").select("*");
    if (error) throw error;
    return data;
  },
  async criarPagamento(x)    { const { error } = await sb.from("pagamentos").insert(x); if (error) throw error; },
  async excluirPagamento(id) { const { error } = await sb.from("pagamentos").delete().eq("id", id); if (error) throw error; }
};
// Busca tudo AO MESMO TEMPO (antes era uma consulta depois da outra)
// e guarda uma cópia no aparelho, pra próxima abertura ser instantânea.
const chaveCache = () => "gc-cache-" + (usuario?.id || "x");
function salvarCache() {
  try { localStorage.setItem(chaveCache(), JSON.stringify({ lancamentos, minhasCats, contas, pagamentos, em: Date.now() })); } catch (e) {}
}
function lerCache() {
  try {
    const c = JSON.parse(localStorage.getItem(chaveCache()) || "null");
    if (!c) return false;
    ({ lancamentos, minhasCats, contas, pagamentos } = c);
    return true;
  } catch (e) { return false; }
}
function avisoOffline(msg) { $("offline").hidden = !msg; $("offline").textContent = msg || ""; }

async function recarregar() {
  const [l, c, k, p] = await Promise.allSettled([banco.listar(), banco.listarCats(), banco.listarContas(), banco.listarPagamentos()]);
  if (l.status === "rejected") {
    console.error(l.reason);
    avisoOffline(lancamentos.length
      ? "Sem conexão com o servidor. Mostrando os dados salvos neste aparelho."
      : "Não consegui falar com o servidor. Confira sua internet e tente de novo.");
  } else {
    avisoOffline("");
    lancamentos = l.value;
    minhasCats = c.status === "fulfilled" ? c.value : [];
    contas = k.status === "fulfilled" ? k.value : [];
    pagamentos = p.status === "fulfilled" ? p.value : [];
    salvarCache();
  }
  render(); desenharMinhasCats();
}

/* ===== 6. Login, recuperação de senha e troca de telas ===== */
const SITE = location.origin + location.pathname;   // pra onde o link do e-mail volta

function traduzErro(m) {
  if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos. Esqueceu? Toque em “Esqueci minha senha”.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Toque em Entrar.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que chegou na caixa de entrada.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/at least 6|should be at least/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/same.*password|different from the old/i.test(m)) return "A nova senha precisa ser diferente da antiga.";
  if (/fetch|network|Load failed/i.test(m)) return "Sem resposta do servidor. Confira a internet. Se o app ficou mais de 7 dias sem uso, o servidor grátis pode ter pausado.";
  return m;
}
function mostrarTela(t) {          // "splash" | "login" | "senha" | "app"
  $("splash").hidden = t !== "splash";
  $("telaLogin").hidden = t !== "login";
  $("telaSenha").hidden = t !== "senha";
  $("telaApp").hidden = t !== "app";
}

async function entrar(criar) {
  const email = $("lEmail").value.trim(), senha = $("lSenha").value;
  $("lErro").className = "erro";
  if (!email || senha.length < 6) { $("lErro").textContent = "Preencha o e-mail e uma senha de pelo menos 6 caracteres."; return; }
  $("lEntrar").disabled = $("lCriar").disabled = true;
  try {
    const r = criar
      ? await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: SITE } })
      : await sb.auth.signInWithPassword({ email, password: senha });
    if (r.error) { $("lErro").textContent = traduzErro(r.error.message); return; }
    if (criar && !r.data.session) {
      $("lErro").className = "erro ok";
      $("lErro").textContent = "Conta criada! Confirme pelo link que chegou no seu e-mail e depois toque em Entrar.";
    }
  } catch (e) { $("lErro").textContent = traduzErro(String(e.message || e)); }
  finally { $("lEntrar").disabled = $("lCriar").disabled = false; }
}
$("formLogin").addEventListener("submit", e => { e.preventDefault(); entrar(false); });
$("lCriar").onclick = () => entrar(true);

// "Esqueci minha senha": manda um link pro e-mail
$("lEsqueci").onclick = async () => {
  const email = $("lEmail").value.trim();
  $("lErro").className = "erro";
  if (!email) { $("lErro").textContent = "Digite seu e-mail acima e toque de novo em “Esqueci minha senha”."; $("lEmail").focus(); return; }
  $("lEsqueci").disabled = true;
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE });
    if (error) throw error;
    $("lErro").className = "erro ok";
    $("lErro").textContent = "Pronto! Se esse e-mail tiver conta, chega um link em instantes (olhe o spam também). Abra o link neste aparelho.";
  } catch (e) { $("lErro").textContent = traduzErro(String(e.message || e)); }
  finally { $("lEsqueci").disabled = false; }
};

// Mostrar/esconder senha (👁)
document.addEventListener("click", e => {
  const b = e.target.closest(".olho"); if (!b) return;
  const i = $(b.dataset.alvo); i.type = i.type === "password" ? "text" : "password";
});

// Tela de nova senha
let trocandoPeloMenu = false;
function abrirNovaSenha(peloMenu) {
  trocandoPeloMenu = peloMenu;
  $("sTexto").textContent = peloMenu ? "Escolha uma nova senha." : "Você entrou pelo link do e-mail. Agora crie sua nova senha.";
  $("sCancelar").hidden = !peloMenu;
  $("sNova").value = $("sRepete").value = ""; $("sErro").textContent = "";
  mostrarTela("senha");
  setTimeout(() => $("sNova").focus(), 60);
}
$("formSenha").addEventListener("submit", async e => {
  e.preventDefault();
  const a = $("sNova").value, b = $("sRepete").value;
  if (a.length < 6) { $("sErro").textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }
  if (a !== b) { $("sErro").textContent = "As duas senhas não são iguais."; return; }
  $("sSalvar").disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) throw error;
    history.replaceState(null, "", SITE);            // limpa o código do link da barra de endereço
    mostrarTela("app"); recarregar();
    toast("Senha alterada. Use a nova senha da próxima vez.");
  } catch (err) { $("sErro").textContent = traduzErro(String(err.message || err)); }
  finally { $("sSalvar").disabled = false; }
});
$("sCancelar").onclick = () => mostrarTela("app");

// Troca de tela conforme a pessoa está logada ou não
let iniciou = false;
sb.auth.onAuthStateChange((evento, sessao) => {
  const novoUsuario = sessao?.user || null;
  const trocouDeConta = novoUsuario?.id !== usuario?.id;
  usuario = novoUsuario;
  if (evento === "PASSWORD_RECOVERY") { abrirNovaSenha(false); return; }   // veio do link "esqueci minha senha"
  if (!usuario) {
    lancamentos = []; minhasCats = []; contas = []; pagamentos = [];
    mostrarTela("login"); return;
  }
  if ($("telaSenha").hidden === false) return;                              // está criando a nova senha
  $("mEmail").textContent = usuario.email;
  mostrarTela("app");
  if (trocouDeConta || !iniciou) {
    iniciou = true;
    if (lerCache()) render();                                               // mostra na hora o que já tinha
    recarregar();                                                           // e atualiza em segundo plano
  }
});
// Se em 8 s nada respondeu, sai do "carregando" e mostra o login com aviso
setTimeout(() => {
  if (!$("splash").hidden) { mostrarTela("login"); $("lErro").className = "erro"; $("lErro").textContent = traduzErro("fetch"); }
}, 8000);

/* ===== 7. Desenhar a tela ===== */
function render() {
  renderContas();                          // aba Contas do mês + aviso no extrato
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
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("veu").hidden) fechar();
  else if (!$("veuConta").hidden) fecharConta();
  else if (!$("veuPagar").hidden) fecharPagar();
  else if (!$("veuMenu").hidden) $("veuMenu").hidden = true;
});
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
$("mSair").onclick = async () => {
  $("veuMenu").hidden = true;
  try { localStorage.removeItem(chaveCache()); } catch (e) {}
  try { await sb.auth.signOut(); } catch (e) { mostrarTela("login"); }
};
$("mSenha").onclick = () => { $("veuMenu").hidden = true; abrirNovaSenha(true); };

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

/* ===== 11. Contas do mês ===== */
// Uma "conta" é uma cobrança que se repete (luz, aluguel...) ou parcelada.
// Um "pagamento" marca que a conta daquele mês foi paga e aponta pro lançamento de saída criado.

// --- 11.1 Campo de valor reaproveitável (mesmo estilo de app de banco) ---
function campoValor(id) {
  let c = 0, sugerido = false;        // sugerido = valor previsto: o 1º número digitado substitui ele
  const el = $(id), box = el.closest(".valor-box");
  const set = (v, sug = false) => {
    c = v; sugerido = sug && v > 0; el.value = fmtCampo(v);
    el.style.width = (el.value.length + 0.2) + "ch";
    box.classList.toggle("zerado", v === 0);
    box.classList.toggle("sugerido", sugerido);
    requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
  };
  // Controla cada tecla: número entra pela direita, apagar tira o último
  el.addEventListener("beforeinput", e => {
    if (e.inputType === "insertCompositionText") return;          // teclados que não deixam interceptar: cai no "input" abaixo
    e.preventDefault();
    if (e.inputType.startsWith("insert")) {
      const d = (e.data || "").replace(/\D/g, ""); if (!d) return;
      set(Number((String(sugerido ? 0 : c) + d).slice(-10)));
    } else if (e.inputType.startsWith("delete")) set(sugerido ? 0 : Math.floor(c / 10));
  });
  el.addEventListener("input", () => set(Number(el.value.replace(/\D/g, "").slice(0, 10) || 0)));
  el.addEventListener("focus", () => set(c, sugerido));
  el.addEventListener("click", () => set(c, sugerido));
  return { get: () => c, set };
}
const valorConta = campoValor("c-valor"), valorPago = campoValor("p-valor");

// --- 11.2 Cálculos de datas e situação ---
function mesesEntre(a, b) { const [a1, m1] = a.split("-").map(Number), [a2, m2] = b.split("-").map(Number); return (a2 - a1) * 12 + (m2 - m1); }
function vencimentoNoMes(dia, ym) {
  const [a, m] = ym.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();               // dia 31 em fevereiro vira 28/29
  return ym + "-" + String(Math.min(dia, ultimo)).padStart(2, "0");
}
function diasAte(iso) { const [a, m, d] = iso.split("-").map(Number), [ha, hm, hd] = hojeISO().split("-").map(Number); return Math.round((new Date(a, m - 1, d) - new Date(ha, hm - 1, hd)) / 864e5); }

// Quais contas valem no mês, com situação de cada uma
function contasDoMes(ym) {
  const out = [];
  for (const c of contas) {
    if (ym < c.inicio || (c.fim && ym > c.fim)) continue;
    const n = mesesEntre(c.inicio, ym);
    if (c.parcelas && n >= c.parcelas) continue;
    const venc = vencimentoNoMes(c.dia, ym);
    const pg = pagamentos.find(p => p.conta_id === c.id && p.mes === ym) || null;
    let st;
    if (pg) st = { cod: "paga", txt: "Paga em " + pg.pago_em.slice(8, 10) + "/" + pg.pago_em.slice(5, 7) };
    else {
      const d = diasAte(venc);
      if (d < 0) st = { cod: "atrasada", txt: "Atrasada " + (-d) + (d === -1 ? " dia" : " dias") };
      else if (d === 0) st = { cod: "hoje", txt: "Vence hoje" };
      else if (d <= 3) st = { cod: "perto", txt: d === 1 ? "Vence amanhã" : "Vence em " + d + " dias" };
      else st = { cod: "aberta", txt: "Vence dia " + venc.slice(8, 10) };
    }
    out.push({ c, venc, pg, st, parcela: c.parcelas && c.parcelas > 1 ? (n + 1) + "/" + c.parcelas : null });
  }
  return out.sort((a, b) => a.venc.localeCompare(b.venc) || a.c.nome.localeCompare(b.c.nome));
}

// --- 11.3 Desenhar a aba e o aviso ---
function renderContas() {
  const lista = contasDoMes(mesAtual);
  let aPagar = 0, pago = 0, nA = 0, nP = 0;
  for (const x of lista) {
    if (x.pg) { pago += x.pg.valor; nP++; } else { aPagar += x.c.valor; nA++; }
  }
  const variaveisAbertas = lista.filter(x => !x.pg && x.c.variavel).length;
  $("cAPagar").textContent = fmt(aPagar) + (variaveisAbertas ? "*" : "");
  $("cAPagarQt").textContent = nA ? nA + (nA === 1 ? " conta" : " contas") + (variaveisAbertas ? " · *valor previsto" : "") : "tudo pago 🎉";
  $("cPago").textContent = fmt(pago);
  $("cPagoQt").textContent = nP + (nP === 1 ? " conta" : " contas");
  $("cBarra").style.width = (lista.length ? nP / lista.length * 100 : 0) + "%";

  $("listaContas").innerHTML = lista.length ? lista.map(x => `
    <button type="button" class="conta-item st-${x.st.cod}" data-id="${esc(x.c.id)}">
      <span class="dia-box"><small>dia</small><b>${x.venc.slice(8, 10)}</b></span>
      <span class="conta-info">
        <span class="desc">${esc(x.c.nome)}${x.parcela ? ` <small class="parc">${x.parcela}</small>` : ""}</span>
        <span class="pill">${esc(x.st.txt)}</span>
      </span>
      <span class="conta-valor num">${x.pg ? fmt(x.pg.valor) : (x.c.valor ? (x.c.variavel ? "~ " : "") + fmt(x.c.valor) : "valor varia")}
        <span class="acao">${x.pg ? "✓ Paga" : "Pagar"}</span></span>
    </button>`).join("")
    : `<div class="vazio"><b>Nenhuma conta em ${esc(nomeMes(mesAtual))}</b><br>Cadastre luz, água, cartão, aluguel… em <b>+ Nova conta</b>.<br>Elas aparecem todo mês sozinhas.</div>`;

  // Aviso: contas do mês de HOJE atrasadas ou vencendo em até 3 dias
  const mesHoje = hojeISO().slice(0, 7);
  const urgentes = contasDoMes(mesHoje).filter(x => ["atrasada", "hoje", "perto"].includes(x.st.cod));
  const atrasadas = urgentes.filter(x => x.st.cod === "atrasada").length;
  $("badgeContas").hidden = !urgentes.length;
  $("badgeContas").textContent = urgentes.length;
  $("badgeContas").classList.toggle("vermelho", atrasadas > 0);
  const al = $("alertaContas");
  al.hidden = !urgentes.length || mesAtual !== mesHoje;
  if (urgentes.length) {
    const nomes = urgentes.slice(0, 3).map(x => x.c.nome).join(", ") + (urgentes.length > 3 ? "…" : "");
    al.className = "alerta" + (atrasadas ? " vermelho" : "");
    const prox = urgentes.length - atrasadas;
    const titulo = [atrasadas ? atrasadas + (atrasadas === 1 ? " atrasada" : " atrasadas") : "",
                    prox ? prox + (prox === 1 ? " vence em breve" : " vencem em breve") : ""].filter(Boolean).join(" · ");
    al.innerHTML = `<b>${atrasadas ? "⚠️" : "🔔"} Contas: ${titulo}</b><span>${esc(nomes)} · Ver contas ›</span>`;
  }
}

// --- 11.4 Abas ---
function setAba(a) {
  aba = a;
  $("viewExtrato").hidden = a !== "extrato";
  $("viewContas").hidden = a !== "contas";
  $("abaExtrato").setAttribute("aria-selected", a === "extrato");
  $("abaContas").setAttribute("aria-selected", a === "contas");
  window.scrollTo({ top: 0 });
}
$("abaExtrato").onclick = () => setAba("extrato");
$("abaContas").onclick = () => setAba("contas");
$("alertaContas").onclick = () => { mesAtual = hojeISO().slice(0, 7); render(); setAba("contas"); };

// --- 11.5 Cadastrar / editar conta ---
let contaEdit = null, rep = "sempre", cCat = "Contas", cVariavel = false;
function desenharCCats() {
  $("c-cats").innerHTML = catsDo("saida").map(c => `<button type="button" class="chip" aria-pressed="${c === cCat}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
}
function setRep(r) {
  rep = r;
  document.querySelectorAll("#c-rep .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.rep === r));
  $("c-parc-box").hidden = r !== "parcelas";
}
function setVariavel(v) {
  cVariavel = v;
  $("c-variavel").setAttribute("aria-pressed", v);
  $("cValorRotulo").textContent = v ? "Valor aproximado (pode deixar zero)" : "Valor";
}
function abrirConta(c) {
  contaEdit = c || null;
  $("cTitulo").textContent = c ? "Editar conta" : "Nova conta";
  $("c-nome").value = c?.nome || "";
  valorConta.set(c?.valor || 0);
  setVariavel(!!c?.variavel);
  $("c-dia").value = c?.dia || "";
  cCat = c?.categoria || "Contas"; desenharCCats();
  if (!c) setRep("sempre");
  else setRep(!c.parcelas ? "sempre" : c.parcelas === 1 ? "unica" : "parcelas");
  $("c-parc").value = c?.parcelas > 1 ? c.parcelas : "";
  $("c-parcAtual").value = c?.parcelas > 1 ? Math.min(mesesEntre(c.inicio, mesAtual) + 1, c.parcelas) : "";
  $("cEncerrar").hidden = !c;
  $("cErro").textContent = "";
  $("veuConta").hidden = false;
  setTimeout(() => $("c-nome").focus(), 60);
}
function fecharConta() { $("veuConta").hidden = true; contaEdit = null; }
$("novaConta").onclick = () => abrirConta();
$("cCancel").onclick = fecharConta;
$("veuConta").addEventListener("click", e => { if (e.target === $("veuConta")) fecharConta(); });
$("c-variavel").onclick = () => setVariavel(!cVariavel);
$("c-rep").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) setRep(b.dataset.rep); });
$("c-cats").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) { cCat = b.dataset.cat; desenharCCats(); } });

$("formConta").addEventListener("submit", async e => {
  e.preventDefault();
  const nome = $("c-nome").value.trim(), dia = Number($("c-dia").value);
  if (!nome) { $("cErro").textContent = "Dê um nome pra conta."; return; }
  if (!cVariavel && !valorConta.get()) { $("cErro").textContent = "Digite o valor, ou marque “O valor muda todo mês”."; return; }
  if (!(dia >= 1 && dia <= 31)) { $("cErro").textContent = "Dia de vencimento entre 1 e 31."; return; }
  let parcelas = null, inicio = contaEdit?.inicio || mesAtual;
  if (rep === "unica") { parcelas = 1; inicio = contaEdit && contaEdit.parcelas === 1 ? contaEdit.inicio : mesAtual; }
  if (rep === "parcelas") {
    parcelas = Number($("c-parc").value); const atual = Number($("c-parcAtual").value || 1);
    if (!(parcelas >= 2)) { $("cErro").textContent = "Quantas parcelas no total? (2 ou mais)"; return; }
    if (!(atual >= 1 && atual <= parcelas)) { $("cErro").textContent = "A parcela deste mês tem que ser entre 1 e " + parcelas + "."; return; }
    inicio = somaMes(mesAtual, -(atual - 1));                 // ex.: está na 3ª → começou 2 meses atrás
  }
  const dado = { nome, valor: valorConta.get(), variavel: cVariavel, dia, categoria: cCat, inicio, parcelas };
  $("cSalvar").disabled = true;
  try {
    contaEdit ? await banco.atualizarConta(contaEdit.id, dado) : await banco.criarConta({ ...dado, fim: null });
    const era = !!contaEdit;
    fecharConta(); vibrar(); await recarregar();
    toast(nome + (era ? " atualizada" : " cadastrada") + (parcelas === 1 ? " · só em " + nomeMes(inicio).toLowerCase() : parcelas ? " · " + parcelas + " parcelas" : " · aparece todo mês"));
  } catch (err) { $("cErro").textContent = "Não salvou: " + err.message; }
  $("cSalvar").disabled = false;
});

// "Parar de cobrar": a conta some a partir deste mês, o histórico fica
$("cEncerrar").onclick = async () => {
  const c = contaEdit, fimAntes = c.fim ?? null;
  try {
    await banco.atualizarConta(c.id, { fim: somaMes(mesAtual, -1) });
    fecharConta(); await recarregar();
    toast(c.nome + " não aparece mais a partir de " + nomeMes(mesAtual).toLowerCase(),
      { rotulo: "Desfazer", fn: async () => { await banco.atualizarConta(c.id, { fim: fimAntes }); await recarregar(); } });
  } catch (err) { $("cErro").textContent = "Não encerrou: " + err.message; }
};

// --- 11.6 Pagar / desmarcar ---
let pagando = null;   // { c, venc, pg, parcela }
function marcarPData() {
  const v = $("p-data").value;
  $("pHoje").setAttribute("aria-pressed", v === diaISO(0));
  $("pOntem").setAttribute("aria-pressed", v === diaISO(-1));
  $("p-data").classList.toggle("ativo", v !== diaISO(0) && v !== diaISO(-1));
}
$("pHoje").onclick = () => { $("p-data").value = diaISO(0); marcarPData(); };
$("pOntem").onclick = () => { $("p-data").value = diaISO(-1); marcarPData(); };
$("p-data").addEventListener("change", marcarPData);

function abrirPagar(x) {
  pagando = x;
  const vencBR = x.venc.slice(8, 10) + "/" + x.venc.slice(5, 7);
  $("pTitulo").textContent = (x.pg ? "" : "Pagar ") + x.c.nome + (x.parcela ? " (" + x.parcela + ")" : "");
  $("pSub").textContent = x.pg ? "Paga em " + x.pg.pago_em.split("-").reverse().join("/") + " · " + fmt(x.pg.valor) + " · vencia " + vencBR
                               : x.st.txt + " · vencimento " + vencBR;
  $("pAberto").hidden = !!x.pg;
  $("pConfirmar").hidden = !!x.pg;
  $("pDesmarcar").hidden = !x.pg;
  valorPago.set(x.c.valor || 0, x.c.variavel);    // conta variável: o valor previsto aparece apagadinho e some ao digitar
  $("p-data").value = diaISO(0); marcarPData();
  $("pNota").textContent = "Vai entrar no extrato como saída em “" + x.c.categoria + "”.";
  $("pErro").textContent = "";
  $("veuPagar").hidden = false;
  if (!x.pg) setTimeout(() => $("p-valor").focus(), 60);
}
function fecharPagar() { $("veuPagar").hidden = true; pagando = null; }
$("pCancel").onclick = fecharPagar;
$("veuPagar").addEventListener("click", e => { if (e.target === $("veuPagar")) fecharPagar(); });
$("pEditar").onclick = () => { const c = pagando.c; fecharPagar(); abrirConta(c); };
$("listaContas").addEventListener("click", e => {
  const b = e.target.closest(".conta-item"); if (!b) return;
  const x = contasDoMes(mesAtual).find(i => String(i.c.id) === b.dataset.id); if (x) abrirPagar(x);
});

async function desmarcar(pg) {
  if (pg.lancamento_id) { try { await banco.excluir(pg.lancamento_id); } catch (e) { console.error(e); } }
  try { await banco.excluirPagamento(pg.id); } catch (e) { /* já foi apagado junto com o lançamento */ }
}
$("formPagar").addEventListener("submit", async e => {
  e.preventDefault();
  const x = pagando, valor = valorPago.get(), data = $("p-data").value;
  if (!valor) { $("pErro").textContent = "Digite quanto você pagou."; return; }
  if (!data) { $("pErro").textContent = "Escolha a data do pagamento."; return; }
  $("pConfirmar").disabled = true;
  try {
    const lanc = await banco.criarRetornando({ tipo: "saida", valor, descricao: x.c.nome + (x.parcela ? " (" + x.parcela + ")" : ""), categoria: x.c.categoria, data });
    await banco.criarPagamento({ conta_id: x.c.id, mes: x.venc.slice(0, 7), valor, pago_em: data, lancamento_id: lanc.id });
    fecharPagar(); vibrar(); await recarregar();
    const pg = pagamentos.find(p => p.conta_id === x.c.id && p.mes === x.venc.slice(0, 7));
    toast(x.c.nome + " paga · " + fmt(valor) + " no extrato", pg && { rotulo: "Desfazer", fn: async () => { await desmarcar(pg); await recarregar(); } });
  } catch (err) { $("pErro").textContent = "Não salvou: " + err.message; }
  $("pConfirmar").disabled = false;
});
$("pDesmarcar").onclick = async () => {
  const x = pagando;
  try { await desmarcar(x.pg); fecharPagar(); await recarregar(); toast(x.c.nome + " voltou pra “a pagar”"); }
  catch (err) { $("pErro").textContent = "Não desmarcou: " + err.message; }
};

/* ===== 10. Modo app instalado (funciona abrindo mesmo com internet ruim) ===== */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
