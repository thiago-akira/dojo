/* ====================================================================
   Dojo — Painéis de Clientes (admin controla, cliente vê/interage)
   Vanilla JS, sem build. Backend: Supabase (Auth + Postgres + RLS).
   ==================================================================== */

/* ===== 1) Cliente Supabase ===== */
const CFG = window.DOJO_CONFIG || {};
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
const COLS = 12;

/* ===== 2) Helpers ===== */
const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const escAttr = s => String(s == null ? "" : s).replace(/"/g, "&quot;");

/* ===== 3) Estado de sessão e navegação ===== */
let me = null;                 // linha de `pessoas` do usuário logado
let isAdmin = false;
let view = "login";            // login | console | cliente | painel
let curCliente = null;         // {id, nome, empresa, marca, ...}
let curProjeto = null;         // {id, nome, ...}
let myMembro = null;           // linha de `membros` do usuário no projeto atual (null se admin)
let canEdit = false;           // true para admin ou gestor do projeto
let editMode = false;
let projTab = "painel";        // painel | gestao | mensagens
let consoleTab = "clientes";   // clientes | meus-projetos
let curSpaceId = null;         // id do espaço (aba de painel) ativo

/* Checa flag de permissão do membro atual. Admin e gestores têm tudo. */
function perm(flag) {
  if (isAdmin || canEdit) return true;
  return !!(myMembro && myMembro[flag]);
}
let brand = { titulo: "Dojo", cor: "#e8a33d", logoUrl: "" };

/* Estado do painel (layout de widgets) */
let state = defaultState();
let _saveTimer = null;

function defaultState() { return { spaces: [{ id: uid(), name: "Painel", visibility: "compartilhado", tiles: [] }] }; }
function space() {
  const ss = state.spaces || [];
  return ss.find(s => s.id === curSpaceId) || ss[0] || (ss.push({ id: uid(), name: "Painel", visibility: "compartilhado", tiles: [] }), ss[0]);
}
/* Espaços visíveis para o usuário atual (admin vê tudo; cliente só vê compartilhados) */
function visibleSpaces() {
  return (state.spaces || []).filter(s => isAdmin || s.visibility !== "interno");
}

/* ===== 4) Registro de widgets ===== */
const WIDGETS = {
  kpi: {
    emoji: "📊", name: "Indicador (KPI)", desc: "Número em destaque com variação.",
    w: 3, h: 2, defaults: { title: "", label: "Receita", value: "R$ 0", delta: "", dir: "up" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = '<div class="kpi"><div class="kpi-label">' + esc(p.label) + '</div>' +
        '<div class="kpi-value">' + esc(p.value) + '</div>' +
        (p.delta ? '<div class="kpi-delta ' + (p.dir === "down" ? "down" : "up") + '">' + (p.dir === "down" ? "▼ " : "▲ ") + esc(p.delta) + '</div>' : '') +
        '</div>';
    },
    form(p) {
      return field("Rótulo", "label", p.label) + field("Valor", "value", p.value) +
        field("Variação (ex.: 12%)", "delta", p.delta) +
        '<label>Direção</label><select data-k="dir"><option value="up"' + (p.dir !== "down" ? " selected" : "") + '>▲ Subindo</option><option value="down"' + (p.dir === "down" ? " selected" : "") + '>▼ Caindo</option></select>';
    }
  },
  nota: {
    emoji: "📝", name: "Nota / Aviso", desc: "Texto livre para o cliente ler.",
    w: 4, h: 3, defaults: { title: "Aviso", text: "Escreva aqui…" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' +
        '<div class="nota-body">' + esc(p.text) + '</div>';
    },
    form(p) { return field("Título", "title", p.title) + '<label>Texto</label><textarea data-k="text">' + esc(p.text) + '</textarea>'; }
  },
  links: {
    emoji: "🔗", name: "Links / Atalhos", desc: "Lista de links úteis.",
    w: 3, h: 3, defaults: { title: "Links", raw: "Site | https://exemplo.com" },
    render(t, c) {
      const p = t.props;
      const items = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]);
      c.innerHTML = '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' +
        '<div class="w-body"><div class="links-list">' +
        items.map(a => '<a href="' + escAttr(a[1] || "#") + '" target="_blank" rel="noopener">🔗 ' + esc(a[0]) + '</a>').join("") +
        '</div></div>';
    },
    form(p) { return field("Título", "title", p.title) + '<label>Itens (um por linha: Rótulo | URL)</label><textarea data-k="raw">' + esc(p.raw) + '</textarea>'; }
  },
  progresso: {
    emoji: "📈", name: "Progresso / Metas", desc: "Barras de progresso (0–100).",
    w: 4, h: 3, defaults: { title: "Metas", raw: "Onboarding | 60\nEntrega | 25" },
    render(t, c) {
      const p = t.props;
      const rows = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]);
      c.innerHTML = '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' +
        '<div class="w-body"><div class="prog">' +
        rows.map(a => { const pct = Math.max(0, Math.min(100, parseFloat(a[1]) || 0)); return '<div class="prog-row"><div class="prog-top"><span>' + esc(a[0]) + '</span><span>' + pct + '%</span></div><div class="prog-bar"><i style="width:' + pct + '%"></i></div></div>'; }).join("") +
        '</div></div>';
    },
    form(p) { return field("Título", "title", p.title) + '<label>Itens (um por linha: Rótulo | %)</label><textarea data-k="raw">' + esc(p.raw) + '</textarea>'; }
  }
};
function field(label, k, v) { return '<label>' + esc(label) + '</label><input data-k="' + k + '" value="' + escAttr(v) + '">'; }

/* ===== 5) Roteamento de telas ===== */
function route() {
  applyBrand(); paintTools();
  const canvas = $("#canvas"), hint = $("#emptyHint");
  canvas.style.display = "none"; hint.style.display = "none";
  canvas.innerHTML = ""; hint.innerHTML = "";
  const spTabs = $("#spaceTabs"); if (spTabs) { spTabs.style.display = "none"; spTabs.innerHTML = ""; }
  $("#crumb").innerHTML = "";

  $("#subnav").style.display = "none";
  if (!me) return showLogin(hint);
  if (view === "console") return renderConsole(canvas, hint);
  if (view === "cliente") return renderClienteDetail(canvas, hint);
  if (view === "painel") return renderProjeto(canvas, hint);
  showLogin(hint);
}

function showLogin(hint) {
  hint.style.display = "block";
  hint.innerHTML = '<div class="welcome"><div class="welcome-mark">◯</div>' +
    '<h2>Dojo</h2><p>Entre para acessar seus painéis.</p>' +
    '<button class="btn primary" onclick="authModal()">Entrar</button></div>';
}

/* ===== 6) Console do admin: lista de clientes e meus projetos ===== */
async function renderConsole(canvas, hint) {
  view = "console"; curCliente = null; curProjeto = null;
  $("#crumb").innerHTML = '<span class="cr-cur">' + (consoleTab === "meus-projetos" ? "Meus Projetos" : "Clientes") + '</span>';
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const [cliRes, projRes, apRes, msgRes] = await Promise.all([
    sb.from("clientes").select("*, projetos(count)").order("nome"),
    sb.from("projetos").select("*", { count: "exact", head: true }).eq("status", "ativo"),
    sb.from("aprovacoes").select("*", { count: "exact", head: true }).eq("status", "pendente"),
    sb.from("mensagens").select("projeto_id, projetos!inner(cliente_id)").gt("created_at", since24h).neq("autor_id", me.id)
  ]);
  if (cliRes.error) { hint.style.display = "block"; hint.textContent = "Erro ao carregar."; return; }

  const allClientes = cliRes.data || [];
  const clientes = allClientes.filter(c => !c.is_interno);
  const internoCliente = allClientes.find(c => c.is_interno) || null;
  const nProjAtivos = projRes.count || 0;
  const nAprovPend = apRes.count || 0;
  const msgBadge = {};
  (msgRes.data || []).forEach(m => {
    const cid = m.projetos && m.projetos.cliente_id;
    if (cid) msgBadge[cid] = (msgBadge[cid] || 0) + 1;
  });

  canvas.style.display = "none";
  hint.style.display = "block";

  const navHtml =
    '<div class="console-nav">' +
    '<button class="console-tab' + (consoleTab === "clientes" ? " on" : "") + '" onclick="switchConsoleTab(\'clientes\')">👥 Clientes</button>' +
    '<button class="console-tab' + (consoleTab === "meus-projetos" ? " on" : "") + '" onclick="switchConsoleTab(\'meus-projetos\')">🏢 Meus Projetos</button>' +
    '</div>';

  if (consoleTab === "meus-projetos") {
    await renderMeusProjetos(hint, internoCliente, navHtml);
    return;
  }

  hint.innerHTML = '<div class="page">' + navHtml +
    '<div class="page-head"><h2>👥 Clientes</h2><button class="btn primary" onclick="novoCliente()">＋ Novo cliente</button></div>' +
    '<div class="dash-stats">' +
    '<div class="dstat"><span class="dstat-n">' + clientes.length + '</span><span class="dstat-l">cliente' + (clientes.length === 1 ? "" : "s") + '</span></div>' +
    '<div class="dstat"><span class="dstat-n">' + nProjAtivos + '</span><span class="dstat-l">projetos ativos</span></div>' +
    '<div class="dstat' + (nAprovPend ? " dstat-alert" : "") + '"><span class="dstat-n">' + nAprovPend + '</span><span class="dstat-l">aprovações pendentes</span></div>' +
    '</div>' +
    (clientes.length ? '<div class="cli-grid">' + clientes.map(c => {
      const n = (c.projetos && c.projetos[0] && c.projetos[0].count) || 0;
      const msgs = msgBadge[c.id] || 0;
      return '<div class="cli-card" onclick="abrirCliente(\'' + c.id + '\')">' +
        '<div class="cli-card-top"><div class="cli-name">' + esc(c.empresa || c.nome) + '</div>' +
        (msgs ? '<span class="cli-msg-badge">' + msgs + '</span>' : '') + '</div>' +
        '<div class="cli-sub">' + esc(c.nome) + '</div>' +
        '<div class="cli-meta"><span class="cli-status ' + (c.status === "ativo" ? "ativo" : "pausado") + '">' + esc(c.status) + '</span>' +
        '<span>' + n + ' projeto' + (n === 1 ? "" : "s") + '</span></div></div>';
    }).join("") + '</div>'
      : '<p class="muted-note">Nenhum cliente ainda. Crie o primeiro com <b>＋ Novo cliente</b>.</p>') +
    '</div>';
}

async function renderMeusProjetos(hint, internoCliente, navHtml) {
  let projetosHtml = '<p class="muted-note">Nenhum projeto ainda. Crie o primeiro com <b>＋ Novo projeto</b>.</p>';
  if (internoCliente) {
    const { data: projetos } = await sb.from("projetos").select("*").eq("cliente_id", internoCliente.id).order("created_at");
    if (projetos && projetos.length) {
      projetosHtml = '<div class="cli-grid">' + projetos.map(p =>
        '<div class="cli-card" onclick="abrirProjeto(\'' + p.id + '\')">' +
        '<div class="cli-name">' + esc(p.nome) + '</div>' +
        '<div class="cli-sub">' + esc(p.descricao || "") + '</div>' +
        '<div class="cli-meta">' +
        '<span class="cli-status ' + (p.status === "ativo" ? "ativo" : "pausado") + '">' + esc(p.status) + '</span>' +
        '<span>' + p.progresso + '%</span></div></div>'
      ).join("") + '</div>';
    }
  }
  const iid = internoCliente ? internoCliente.id : null;
  const empresa = internoCliente ? esc(internoCliente.empresa || "Meus Projetos") : "Meus Projetos";
  hint.innerHTML = '<div class="page">' + navHtml +
    '<div class="page-head">' +
    '<div><h2>🏢 Meus Projetos</h2><div class="muted-note" style="font-size:12px;margin-top:2px">' + empresa + '</div></div>' +
    '<div style="display:flex;gap:8px">' +
    (internoCliente ? '<button class="btn" onclick="editarClienteInterno()">✏ Renomear</button>' : '') +
    '<button class="btn primary" onclick="novoMeuProjeto(' + (iid ? '\'' + iid + '\'' : 'null') + ')">＋ Novo projeto</button>' +
    '</div></div>' + projetosHtml + '</div>';
}

function novoCliente() {
  openModal('<h3>Novo cliente</h3>' +
    field("Empresa", "empresa", "") + field("Contato / nome", "nome", "") +
    '<label>Cor da marca</label><input type="color" data-k="cor" value="#e8a33d" style="height:40px;padding:4px">' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Criar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => m.querySelector('[data-k="' + k + '"]').value.trim();
        const empresa = get("empresa"), nome = get("nome") || empresa, cor = get("cor");
        if (!empresa) { alert("Informe a empresa."); return; }
        const { error } = await sb.from("clientes").insert({
          nome, empresa, criado_por: me.id,
          marca: { titulo: empresa, cor, logoUrl: "" }
        });
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}

/* ===== 7) Detalhe do cliente: lista de projetos ===== */
async function abrirCliente(id) {
  const { data, error } = await sb.from("clientes").select("*").eq("id", id).single();
  if (error) { alert("Erro ao abrir cliente."); return; }
  curCliente = data; view = "cliente"; route();
}

async function renderClienteDetail(canvas, hint) {
  const c = curCliente;
  $("#crumb").innerHTML = '<a class="cr-link" onclick="irConsole()">Clientes</a><span class="cr-sep">›</span><span class="cr-cur">' + esc(c.empresa || c.nome) + '</span>';
  const { data: projetos } = await sb.from("projetos").select("*").eq("cliente_id", c.id).order("created_at");
  hint.style.display = "block";
  hint.innerHTML = '<div class="page">' +
    '<div class="page-head"><h2>' + esc(c.empresa || c.nome) + '</h2><div style="display:flex;gap:8px">' +
    '<button class="btn danger" onclick="excluirCliente()">🗑 Excluir</button>' +
    '<button class="btn" onclick="editarCliente()">✏ Editar</button>' +
    '<button class="btn primary" onclick="novoProjeto()">＋ Novo projeto</button></div></div>' +
    ((projetos && projetos.length) ? '<div class="cli-grid">' + projetos.map(p =>
      '<div class="cli-card" onclick="abrirProjeto(\'' + p.id + '\')">' +
      '<div class="cli-name">' + esc(p.nome) + '</div>' +
      '<div class="cli-sub">' + esc(p.descricao || "") + '</div>' +
      '<div class="cli-meta"><span class="cli-status ' + (p.status === "ativo" ? "ativo" : "pausado") + '">' + esc(p.status) + '</span>' +
      '<span>' + p.progresso + '%</span></div></div>'
    ).join("") + '</div>'
      : '<p class="muted-note">Sem projetos. Crie o primeiro com <b>＋ Novo projeto</b>.</p>') +
    '</div>';
}

function novoMeuProjeto(internoClienteId) {
  if (!internoClienteId) { alert("Erro: cliente interno não encontrado."); return; }
  openModal('<h3>Novo projeto</h3>' + field("Nome", "nome", "") +
    '<label>Descrição</label><textarea data-k="descricao"></textarea>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Criar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        const descricao = m.querySelector('[data-k="descricao"]').value.trim();
        if (!nome) { alert("Informe o nome."); return; }
        const { error } = await sb.from("projetos").insert({ cliente_id: internoClienteId, nome, descricao });
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}

function editarClienteInterno() {
  sb.from("clientes").select("*").eq("is_interno", true).single().then(({ data }) => {
    if (!data) { alert("Cliente interno não encontrado."); return; }
    curCliente = data;
    openModal('<h3>Renomear empresa</h3>' +
      field("Nome da empresa", "empresa", data.empresa || "") +
      '<label>Cor</label><input type="color" data-k="cor" value="' + escAttr((data.marca && data.marca.cor) || "#5b8def") + '" style="height:40px;padding:4px">' +
      actions("Salvar"),
      m => {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-ok]").onclick = async () => {
          const empresa = m.querySelector('[data-k="empresa"]').value.trim();
          if (!empresa) { alert("Informe o nome."); return; }
          const cor = m.querySelector('[data-k="cor"]').value;
          const marca = Object.assign({}, data.marca || {}, { cor, titulo: empresa });
          const { error } = await sb.from("clientes").update({ empresa, nome: empresa, marca }).eq("id", data.id);
          if (error) { alert("Erro: " + error.message); return; }
          closeModal(); route();
        };
      });
  });
}

function novoProjeto() {
  openModal('<h3>Novo projeto</h3>' + field("Nome", "nome", "") +
    '<label>Descrição</label><textarea data-k="descricao"></textarea>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Criar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        const descricao = m.querySelector('[data-k="descricao"]').value.trim();
        if (!nome) { alert("Informe o nome."); return; }
        const { error } = await sb.from("projetos").insert({ cliente_id: curCliente.id, nome, descricao });
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}

/* ===== 8) Abrir um projeto → carregar painel ===== */
async function abrirProjeto(id) {
  const { data, error } = await sb.from("projetos").select("*, clientes(*)").eq("id", id).single();
  if (error) { alert("Erro ao abrir projeto."); return; }
  curProjeto = data;
  curCliente = data.clientes || curCliente;
  brand = Object.assign({ titulo: "Dojo", cor: "#e8a33d", logoUrl: "" }, (curCliente && curCliente.marca) || {});
  if (isAdmin) {
    canEdit = true; myMembro = null;
  } else {
    const { data: mb } = await sb.from("membros").select("*").eq("projeto_id", id).eq("pessoa_id", me.id).maybeSingle();
    myMembro = mb || null;
    canEdit = !!(mb && mb.papel === "gestor");
  }
  await loadPainel(id);
  const vis = visibleSpaces();
  curSpaceId = vis.length ? vis[0].id : (state.spaces[0] && state.spaces[0].id) || null;
  view = "painel"; projTab = "painel"; editMode = false; route();
}

async function loadPainel(projetoId) {
  const { data } = await sb.from("paineis").select("layout").eq("projeto_id", projetoId).maybeSingle();
  state = (data && data.layout && data.layout.spaces) ? data.layout : defaultState();
}

function save() {
  if (!canEdit || !curProjeto) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    await sb.from("paineis").upsert({ projeto_id: curProjeto.id, layout: state, updated_at: new Date().toISOString() });
  }, 600);
}

/* ===== 9) Projeto: sub-nav (Painel · Gestão · Mensagens) ===== */
function renderProjeto(canvas, hint) {
  const c = curCliente;
  const fromInterno = c && c.is_interno;
  if (isAdmin) {
    if (fromInterno) {
      $("#crumb").innerHTML =
        '<a class="cr-link" onclick="irMeusProjetos()">Meus Projetos</a><span class="cr-sep">›</span>' +
        '<span class="cr-cur">' + esc(curProjeto.nome) + '</span>';
    } else {
      $("#crumb").innerHTML =
        '<a class="cr-link" onclick="irConsole()">Clientes</a><span class="cr-sep">›</span>' +
        '<a class="cr-link" onclick="abrirCliente(\'' + c.id + '\')">' + esc(c.empresa || c.nome) + '</a><span class="cr-sep">›</span>' +
        '<span class="cr-cur">' + esc(curProjeto.nome) + '</span>';
    }
  } else {
    $("#crumb").innerHTML = '<span class="cr-cur">' + esc(curProjeto.nome) + '</span>';
  }

  const tabs = [["painel", "📋 Painel"]];
  if (canEdit) tabs.push(["gestao", "🗂 Gestão interna"]);
  else tabs.push(["materiais", "📎 Materiais"]);
  tabs.push(["aprovacoes", "✅ Aprovações"], ["questionarios", "📝 Questionários"],
    ["reunioes", "📅 Reuniões"], ["mensagens", "💬 Mensagens"]);
  if (canEdit || perm("pode_adicionar_pessoas")) tabs.push(["participantes", "👥 Participantes"]);
  const sn = $("#subnav"); sn.style.display = "flex";
  sn.innerHTML = tabs.map(([k, l]) =>
    '<button class="sntab' + (projTab === k ? " on" : "") + '" onclick="setProjTab(\'' + k + '\')">' + l + '</button>').join("");

  if (projTab === "gestao" && canEdit) return renderGestao(canvas, hint);
  if (projTab === "materiais") return renderMateriais(canvas, hint);
  if (projTab === "aprovacoes") return renderAprovacoes(canvas, hint);
  if (projTab === "questionarios") return renderQuestionarios(canvas, hint);
  if (projTab === "reunioes") return renderReunioes(canvas, hint);
  if (projTab === "mensagens") return renderMensagens(canvas, hint);
  if (projTab === "participantes" && canEdit) return renderParticipantes(canvas, hint);
  return renderPainel(canvas, hint);
}
function setProjTab(t) { projTab = t; route(); }

/* ===== 9b) Render do painel (grid de widgets) ===== */
function renderPainel(canvas, hint) {
  const vis = visibleSpaces();
  const cur = space();
  const spTabs = $("#spaceTabs");

  /* Mostra abas se há mais de uma visível OU se admin pode gerenciar */
  if (vis.length > 1 || canEdit) {
    spTabs.style.display = "block";
    const tabsHtml = '<div class="space-tabs">' +
      vis.map(s =>
        '<button class="space-tab' + (s.id === cur.id ? " on" : "") + '" onclick="setSpace(\'' + s.id + '\')">' +
        (s.visibility === "interno" ? "🔒 " : "") + esc(s.name) + '</button>'
      ).join("") +
      (canEdit ? '<button class="space-tab sp-add" title="Nova aba" onclick="addSpace()">＋</button>' : '') +
      '</div>';
    const ctrlHtml = canEdit && cur
      ? '<div class="space-ctrl"><span class="space-ctrl-label">' + esc(cur.name) + '</span>' +
        '<button class="lnk" onclick="editarSpace(\'' + cur.id + '\')">✏ renomear</button>' +
        (state.spaces.length > 1 ? '<button class="lnk del" onclick="deletarSpace(\'' + cur.id + '\')">excluir aba</button>' : '') +
        '</div>'
      : '';
    spTabs.innerHTML = tabsHtml + ctrlHtml;
  }

  canvas.style.display = "grid";
  const tiles = cur ? cur.tiles : [];
  if (!tiles.length) {
    hint.style.display = "block";
    hint.textContent = canEdit ? "Aba vazia — clique em ＋ Adicionar." : "Nada por aqui ainda.";
  } else hint.style.display = "none";

  tiles.forEach(t => {
    const W = WIDGETS[t.type]; if (!W) return;
    const tile = document.createElement("div"); tile.className = "tile"; tile.dataset.id = t.id;
    tile.style.setProperty("--gc", (t.x + 1) + " / span " + t.w);
    tile.style.setProperty("--gr", (t.y + 1) + " / span " + t.h);
    const card = document.createElement("div"); card.className = "card";
    const content = document.createElement("div"); content.className = "content";
    try { W.render(t, content); } catch (e) { content.textContent = "Erro no widget."; }
    card.appendChild(content);
    if (editMode) {
      const bar = document.createElement("div"); bar.className = "tbar";
      bar.innerHTML = '<button title="Configurar">⚙</button><button title="Excluir">✕</button>';
      bar.children[0].onclick = e => { e.stopPropagation(); widgetSettings(t); };
      bar.children[1].onclick = e => { e.stopPropagation(); removeTile(t.id); };
      card.appendChild(bar);
      const h = document.createElement("div"); h.className = "thandle"; card.appendChild(h);
      enableDrag(tile, card, t); enableResize(tile, h, t);
    }
    tile.appendChild(card); canvas.appendChild(tile);
  });
}

/* ===== 10) Edição de widgets (admin/gestor) ===== */
function addWidget(type) {
  const W = WIDGETS[type]; if (!W) return;
  const t = { id: uid(), type, x: 0, y: bottomRow(), w: W.w, h: W.h, props: JSON.parse(JSON.stringify(W.defaults || {})) };
  space().tiles.push(t); save(); route();
}
function bottomRow() { return space().tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0); }
function removeTile(id) { if (!confirm("Excluir este widget?")) return; space().tiles = space().tiles.filter(t => t.id !== id); save(); route(); }

function cellSize() { const c = $("#canvas"); const gap = 14; const w = (c.clientWidth - gap * (COLS - 1)) / COLS; return { w, h: 96, gap }; }
function enableDrag(tile, card, t) {
  card.addEventListener("pointerdown", e => {
    if (e.target.closest(".tbar,.thandle") || !editMode) return;
    e.preventDefault(); const cs = cellSize(); const sx = e.clientX, sy = e.clientY, ox = t.x, oy = t.y;
    tile.classList.add("dragging"); card.setPointerCapture(e.pointerId);
    const mv = ev => { t.x = clamp(ox + Math.round((ev.clientX - sx) / (cs.w + cs.gap)), 0, COLS - t.w); t.y = Math.max(0, oy + Math.round((ev.clientY - sy) / (cs.h + cs.gap))); tile.style.setProperty("--gc", (t.x + 1) + " / span " + t.w); tile.style.setProperty("--gr", (t.y + 1) + " / span " + t.h); };
    const up = () => { card.removeEventListener("pointermove", mv); card.removeEventListener("pointerup", up); tile.classList.remove("dragging"); save(); };
    card.addEventListener("pointermove", mv); card.addEventListener("pointerup", up);
  });
}
function enableResize(tile, handle, t) {
  handle.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation(); const cs = cellSize(); const sx = e.clientX, sy = e.clientY, ow = t.w, oh = t.h;
    tile.classList.add("resizing"); handle.setPointerCapture(e.pointerId);
    const mv = ev => { t.w = clamp(ow + Math.round((ev.clientX - sx) / (cs.w + cs.gap)), 1, COLS - t.x); t.h = Math.max(1, oh + Math.round((ev.clientY - sy) / (cs.h + cs.gap))); tile.style.setProperty("--gc", (t.x + 1) + " / span " + t.w); tile.style.setProperty("--gr", (t.y + 1) + " / span " + t.h); };
    const up = () => { handle.removeEventListener("pointermove", mv); handle.removeEventListener("pointerup", up); tile.classList.remove("resizing"); save(); };
    handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", up);
  });
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function widgetSettings(t) {
  const W = WIDGETS[t.type];
  openModal('<h3>' + W.emoji + ' ' + esc(W.name) + '</h3>' + W.form(t.props) +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = () => {
        m.querySelectorAll("[data-k]").forEach(el => { t.props[el.dataset.k] = el.value; });
        save(); route(); closeModal();
      };
    });
}
function openPicker() {
  openModal('<h3>Adicionar widget</h3><div class="pick-grid">' +
    Object.keys(WIDGETS).map(k => { const W = WIDGETS[k]; return '<div class="pick-card" data-t="' + k + '"><div class="pick-emoji">' + W.emoji + '</div><div class="pick-name">' + esc(W.name) + '</div><div class="pick-desc">' + esc(W.desc) + '</div></div>'; }).join("") +
    '</div>', m => { m.querySelectorAll(".pick-card").forEach(el => el.onclick = () => { addWidget(el.dataset.t); closeModal(); }); });
}

/* ===== 10b) Gestão de espaços (abas de painel) ===== */
function setSpace(id) { curSpaceId = id; route(); }

function _spaceVisSelect(cur) {
  return '<label>Visibilidade</label><select data-k="vis">' +
    '<option value="interno"' + (cur === "interno" ? " selected" : "") + '>🔒 Privada — só você vê</option>' +
    '<option value="compartilhado"' + (cur !== "interno" ? " selected" : "") + '>👁 Compartilhada — cliente vê</option></select>';
}

function addSpace() {
  openModal('<h3>Nova aba de painel</h3>' + field("Nome", "nome", "") + _spaceVisSelect("interno") + actions("Criar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        if (!nome) { alert("Informe o nome."); return; }
        const ns = { id: uid(), name: nome, visibility: m.querySelector('[data-k="vis"]').value, tiles: [] };
        state.spaces.push(ns);
        curSpaceId = ns.id;
        save(); closeModal(); route();
      };
    });
}

function editarSpace(id) {
  const s = (state.spaces || []).find(x => x.id === id); if (!s) return;
  openModal('<h3>Editar aba</h3>' + field("Nome", "nome", s.name) + _spaceVisSelect(s.visibility || "compartilhado") + actions("Salvar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        if (!nome) { alert("Informe o nome."); return; }
        s.name = nome; s.visibility = m.querySelector('[data-k="vis"]').value;
        save(); closeModal(); route();
      };
    });
}

function deletarSpace(id) {
  if (!confirm("Excluir esta aba e todos os widgets nela?")) return;
  state.spaces = state.spaces.filter(s => s.id !== id);
  const vis = visibleSpaces();
  curSpaceId = vis.length ? vis[0].id : (state.spaces[0] && state.spaces[0].id) || null;
  save(); route();
}

/* ===== 11) Modal helpers ===== */
function openModal(html, after) { const m = $("#modal"), s = $("#scrim"); m.innerHTML = html; m.style.display = "block"; s.style.display = "block"; s.onclick = closeModal; if (after) after(m); }
function closeModal() { $("#modal").style.display = "none"; $("#scrim").style.display = "none"; $("#modal").innerHTML = ""; }

/* ===== 12) Marca / topo / navegação ===== */
function applyBrand() {
  const inPainel = view === "painel";
  $("#brandTitle").textContent = (inPainel && brand.titulo) ? brand.titulo : "Dojo";
  if (inPainel && brand.logoUrl) $("#brandMark").innerHTML = '<img src="' + escAttr(brand.logoUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:7px">';
  else $("#brandMark").textContent = "◯";
  document.documentElement.style.setProperty("--accent", (inPainel && brand.cor) ? brand.cor : "#e8a33d");
  $("#roleBadge").textContent = me ? (isAdmin ? "ADMIN" : "CLIENTE") : "";
}
function paintTools() {
  const inPainel = view === "painel" && projTab === "painel";
  $("#adminBtn").style.display = isAdmin ? "" : "none";
  $("#adminBtn").classList.toggle("on", view === "console" && consoleTab === "clientes");
  $("#meusBtn").style.display = isAdmin ? "" : "none";
  $("#meusBtn").classList.toggle("on", view === "console" && consoleTab === "meus-projetos");
  $("#editBtn").style.display = (inPainel && canEdit) ? "" : "none";
  $("#addBtn").style.display = (inPainel && canEdit && editMode) ? "" : "none";
  $("#editBtn").classList.toggle("on", editMode);
  $("#editBtn").textContent = editMode ? "✓ Concluir" : "✏ Editar";
  $("#authBtn").textContent = me ? (me.nome || me.email || "Conta") : "Entrar";
  document.body.classList.toggle("edit", editMode && inPainel);
}
function irConsole() { view = "console"; route(); }
function irMeusProjetos() { consoleTab = "meus-projetos"; view = "console"; route(); }
function switchConsoleTab(tab) { consoleTab = tab; route(); }

/* ===== 13) Autenticação ===== */
function authModal() {
  if (me) {
    openModal('<h3>Conta</h3><p class="muted-note">' + esc(me.email || "") + ' · ' + (isAdmin ? "Administrador" : "Cliente") + '</p>' +
      '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Fechar</button><button class="btn danger" data-out>Sair</button></div>',
      m => { m.querySelector("[data-x]").onclick = closeModal; m.querySelector("[data-out]").onclick = async () => { await sb.auth.signOut(); closeModal(); }; });
    return;
  }
  openModal(
    '<h3>Entrar no Dojo</h3>' +
    '<div class="tabs"><button class="tab on" data-tab="in">Entrar</button><button class="tab" data-tab="up">Criar conta</button></div>' +
    '<div data-pane="up" style="display:none">' + field("Nome", "nome", "") + '</div>' +
    field("E-mail", "email", "") +
    '<label>Senha</label><input data-k="senha" type="password" placeholder="•••••••• (ou use link mágico)">' +
    '<div class="auth-err" id="authErr"></div>' +
    '<div class="modal-actions">' +
    '<button class="btn ghost" data-magic>✉ Link mágico</button><span class="grow"></span>' +
    '<button class="btn" data-x>Cancelar</button><button class="btn primary" data-go>Entrar</button></div>',
    m => {
      let tab = "in";
      const err = t => { m.querySelector("#authErr").textContent = t || ""; };
      const val = k => (m.querySelector('[data-k="' + k + '"]') || {}).value || "";
      m.querySelectorAll(".tab").forEach(b => b.onclick = () => {
        tab = b.dataset.tab;
        m.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === b));
        m.querySelector('[data-pane="up"]').style.display = tab === "up" ? "block" : "none";
        m.querySelector("[data-go]").textContent = tab === "up" ? "Criar conta" : "Entrar";
      });
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-magic]").onclick = async () => {
        const email = val("email").trim(); if (!email) return err("Informe o e-mail.");
        err("Enviando…");
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
        err(error ? error.message : "✓ Link enviado! Verifique seu e-mail.");
      };
      m.querySelector("[data-go]").onclick = async () => {
        const email = val("email").trim(), senha = val("senha");
        if (!email || !senha) return err("Preencha e-mail e senha.");
        err("Aguarde…");
        if (tab === "up") {
          const nome = val("nome").trim();
          const { error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome } } });
          if (error) return err(error.message);
          const { error: e2 } = await sb.auth.signInWithPassword({ email, password: senha });
          if (e2) err("✓ Conta criada! Agora é só entrar.");
          else closeModal();
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password: senha });
          if (error) return err("E-mail ou senha inválidos.");
          closeModal();
        }
      };
    });
}

/* Carrega o perfil e decide a rota inicial conforme o papel */
async function onSession(session) {
  if (!session) { me = null; isAdmin = false; view = "login"; route(); return; }
  const { data: pessoa } = await sb.from("pessoas").select("*").eq("id", session.user.id).maybeSingle();
  me = pessoa || { id: session.user.id, email: session.user.email, nome: session.user.email };
  isAdmin = !!(pessoa && pessoa.is_admin);
  if (isAdmin) { view = "console"; route(); }
  else { await rotaCliente(); }
}

/* Cliente: abre direto o projeto se houver só um; senão lista */
async function rotaCliente() {
  const { data: membros } = await sb.from("membros").select("projeto_id, projetos(*, clientes(*))");
  const projs = (membros || []).map(m => m.projetos).filter(Boolean);
  if (projs.length === 1) { await abrirProjeto(projs[0].id); return; }
  if (projs.length > 1) {
    view = "cliente";
    // reaproveita a grade: mostra os projetos do cliente logado
    curCliente = projs[0].clientes;
    $("#canvas").style.display = "none";
    const hint = $("#emptyHint"); hint.style.display = "block";
    hint.innerHTML = '<div class="page"><div class="page-head"><h2>Seus projetos</h2></div><div class="cli-grid">' +
      projs.map(p => '<div class="cli-card" onclick="abrirProjeto(\'' + p.id + '\')"><div class="cli-name">' + esc(p.nome) + '</div><div class="cli-meta"><span class="cli-status ' + (p.status === "ativo" ? "ativo" : "pausado") + '">' + esc(p.status) + '</span><span>' + p.progresso + '%</span></div></div>').join("") +
      '</div></div>';
    applyBrand(); paintTools(); return;
  }
  // sem acesso ainda
  me && (view = "login");
  const hint = $("#emptyHint"); $("#canvas").style.display = "none"; hint.style.display = "block";
  hint.innerHTML = '<div class="welcome"><h2>Olá, ' + esc(me.nome || "") + '</h2><p>Você ainda não tem projetos liberados. Fale com o responsável.</p></div>';
  applyBrand(); paintTools();
}

/* ===== 13b) Gestão interna: documentos, anotações, checklists ===== */
function visChip(v) { return '<span class="vis ' + v + '">' + (v === "compartilhado" ? "👁 cliente vê" : "🔒 interno") + '</span>'; }
function visSelect(cur) {
  cur = cur || "interno";
  return '<label>Visibilidade</label><select data-k="vis">' +
    '<option value="interno"' + (cur === "interno" ? " selected" : "") + '>🔒 Interno (só você)</option>' +
    '<option value="compartilhado"' + (cur === "compartilhado" ? " selected" : "") + '>👁 Compartilhado (cliente vê)</option></select>';
}
function actions(ok) { return '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>' + esc(ok) + '</button></div>'; }

async function renderGestao(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  hint.innerHTML = '<div class="page"><p class="muted-note">Carregando…</p></div>';
  const [docs, anos, chs] = await Promise.all([
    sb.from("documentos").select("*").eq("projeto_id", pid).order("created_at", { ascending: false }),
    sb.from("anotacoes").select("*").eq("projeto_id", pid).order("updated_at", { ascending: false }),
    sb.from("checklists").select("*, checklist_itens(*)").eq("projeto_id", pid).order("ordem")
  ]);

  const docsHtml = (docs.data || []).map(d =>
    '<div class="grow-row"><div class="gr-main"><span class="gr-name">📄 ' + esc(d.nome) + '</span>' + visChip(d.visibilidade) + '</div>' +
    '<div class="gr-actions">' +
    (d.storage_path ? '<button class="lnk" onclick="baixarDoc(\'' + escAttr(d.storage_path) + '\')">baixar</button>' :
      (d.url ? '<a class="lnk" href="' + escAttr(d.url) + '" target="_blank" rel="noopener">abrir</a>' : "")) +
    '<button class="lnk" onclick="toggleVis(\'documentos\',\'' + d.id + '\',\'' + d.visibilidade + '\')">' + (d.visibilidade === "compartilhado" ? "tornar interno" : "compartilhar") + '</button>' +
    '<button class="lnk del" onclick="delDoc(\'' + d.id + '\',\'' + escAttr(d.storage_path || "") + '\')">excluir</button></div></div>'
  ).join("") || '<p class="muted-note">Nenhum documento ainda.</p>';

  const anosHtml = (anos.data || []).map(a =>
    '<div class="grow-row ano" onclick="editarAnotacao(\'' + a.id + '\')"><div class="gr-main"><span class="gr-name">📝 ' + esc(a.titulo || "(sem título)") + '</span>' + visChip(a.visibilidade) + '</div>' +
    '<div class="ano-prev">' + esc((a.corpo || "").slice(0, 120)) + '</div>' +
    '<button class="lnk del" onclick="event.stopPropagation();delAnotacao(\'' + a.id + '\')">excluir</button></div>'
  ).join("") || '<p class="muted-note">Nenhuma anotação ainda.</p>';

  const chsHtml = (chs.data || []).map(cl =>
    '<div class="chk"><div class="chk-head"><span class="chk-title">' + esc(cl.titulo) + '</span>' + visChip(cl.visibilidade) +
    '<span class="grow"></span>' +
    '<button class="lnk" onclick="toggleVis(\'checklists\',\'' + cl.id + '\',\'' + cl.visibilidade + '\')">' + (cl.visibilidade === "compartilhado" ? "tornar interno" : "compartilhar") + '</button>' +
    '<button class="lnk del" onclick="delChecklist(\'' + cl.id + '\')">excluir</button></div>' +
    '<div class="chk-items">' +
    (cl.checklist_itens || []).sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at)).map(it =>
      '<label class="chk-item' + (it.concluido ? " done" : "") + '"><input type="checkbox" ' + (it.concluido ? "checked" : "") + ' onchange="toggleItem(\'' + it.id + '\',' + it.concluido + ')"><span>' + esc(it.texto) + '</span><button class="lnk del" onclick="delItem(\'' + it.id + '\')">✕</button></label>'
    ).join("") +
    '<div class="chk-add"><input id="ni-' + cl.id + '" placeholder="Novo item…" onkeydown="if(event.key===\'Enter\')addItem(\'' + cl.id + '\')"><button class="btn sm" onclick="addItem(\'' + cl.id + '\')">＋</button></div>' +
    '</div></div>'
  ).join("") || '<p class="muted-note">Nenhum checklist ainda.</p>';

  hint.innerHTML = '<div class="page">' +
    '<div class="gsec"><div class="gsec-head"><h3>🗂 Documentos</h3><button class="btn sm primary" onclick="novoDocumento()">＋ Documento</button></div><div class="glist">' + docsHtml + '</div></div>' +
    '<div class="gsec"><div class="gsec-head"><h3>📝 Anotações</h3><button class="btn sm primary" onclick="novaAnotacao()">＋ Anotação</button></div><div class="glist">' + anosHtml + '</div></div>' +
    '<div class="gsec"><div class="gsec-head"><h3>✅ Checklists</h3><button class="btn sm primary" onclick="novoChecklist()">＋ Checklist</button></div><div class="glist">' + chsHtml + '</div></div>' +
    '</div>';
}

/* — Documentos — */
function novoDocumento() {
  openModal('<h3>Novo documento</h3>' + field("Nome", "nome", "") +
    '<label>Arquivo</label><input type="file" id="docfile">' +
    '<label>…ou link (URL)</label><input data-k="url" placeholder="https://">' +
    visSelect() + actions("Adicionar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        const url = m.querySelector('[data-k="url"]').value.trim();
        const vis = m.querySelector('[data-k="vis"]').value;
        const file = m.querySelector("#docfile").files[0];
        if (!nome && !file && !url) { alert("Informe um nome e um arquivo ou link."); return; }
        let storage_path = null, tipo = null, tamanho = null;
        if (file) {
          storage_path = curProjeto.id + "/" + uid() + "-" + file.name.replace(/[^\w.\-]/g, "_");
          const up = await sb.storage.from("documentos").upload(storage_path, file);
          if (up.error) { alert("Erro no upload: " + up.error.message); return; }
          tipo = file.type; tamanho = file.size;
        } else if (url) { tipo = "link"; }
        const { error } = await sb.from("documentos").insert({
          projeto_id: curProjeto.id, nome: nome || (file && file.name) || url,
          storage_path, url: url || null, tipo, tamanho, visibilidade: vis, criado_por: me.id
        });
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function baixarDoc(path) {
  const { data, error } = await sb.storage.from("documentos").createSignedUrl(path, 3600);
  if (error) { alert("Erro: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}
async function delDoc(id, path) {
  if (!confirm("Excluir este documento?")) return;
  if (path) await sb.storage.from("documentos").remove([path]);
  await sb.from("documentos").delete().eq("id", id); route();
}
async function toggleVis(table, id, cur) {
  await sb.from(table).update({ visibilidade: cur === "compartilhado" ? "interno" : "compartilhado" }).eq("id", id);
  route();
}

/* — Anotações — */
function novaAnotacao() { abrirAnotacao(null, { titulo: "", corpo: "", visibilidade: "interno" }); }
async function editarAnotacao(id) {
  const { data } = await sb.from("anotacoes").select("*").eq("id", id).single();
  abrirAnotacao(id, data || { titulo: "", corpo: "", visibilidade: "interno" });
}
function abrirAnotacao(id, a) {
  openModal('<h3>' + (id ? "Editar" : "Nova") + ' anotação</h3>' + field("Título", "titulo", a.titulo || "") +
    '<label>Texto</label><textarea data-k="corpo" style="min-height:120px">' + esc(a.corpo || "") + '</textarea>' +
    visSelect(a.visibilidade) + actions("Salvar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const rec = {
          projeto_id: curProjeto.id,
          titulo: m.querySelector('[data-k="titulo"]').value.trim(),
          corpo: m.querySelector('[data-k="corpo"]').value,
          visibilidade: m.querySelector('[data-k="vis"]').value
        };
        let error;
        if (id) ({ error } = await sb.from("anotacoes").update(rec).eq("id", id));
        else { rec.criado_por = me.id; ({ error } = await sb.from("anotacoes").insert(rec)); }
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function delAnotacao(id) { if (!confirm("Excluir esta anotação?")) return; await sb.from("anotacoes").delete().eq("id", id); route(); }

/* — Checklists — */
function novoChecklist() {
  openModal('<h3>Novo checklist</h3>' + field("Título", "titulo", "") + visSelect() + actions("Criar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const titulo = m.querySelector('[data-k="titulo"]').value.trim();
        if (!titulo) { alert("Informe o título."); return; }
        const { error } = await sb.from("checklists").insert({ projeto_id: curProjeto.id, titulo, visibilidade: m.querySelector('[data-k="vis"]').value, criado_por: me.id });
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function delChecklist(id) { if (!confirm("Excluir o checklist e seus itens?")) return; await sb.from("checklists").delete().eq("id", id); route(); }
async function addItem(clId) {
  const el = document.getElementById("ni-" + clId); const texto = (el.value || "").trim(); if (!texto) return;
  const { error } = await sb.from("checklist_itens").insert({ checklist_id: clId, texto });
  if (error) { alert("Erro: " + error.message); return; }
  route();
}
async function toggleItem(id, cur) {
  const done = !cur;
  await sb.from("checklist_itens").update({ concluido: done, concluido_por: done ? me.id : null, concluido_em: done ? new Date().toISOString() : null }).eq("id", id);
  route();
}
async function delItem(id) { await sb.from("checklist_itens").delete().eq("id", id); route(); }

/* ===== 13c) Mensagens ===== */
async function renderMensagens(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const [msgs, mbs] = await Promise.all([
    sb.from("mensagens").select("*, autor:pessoas!autor_id(nome,email)").eq("projeto_id", pid).order("created_at"),
    sb.from("membros").select("pessoa_id, papel, pessoas(nome,email)").eq("projeto_id", pid)
  ]);
  const participantes = (mbs.data || []).filter(x => x.pessoa_id !== me.id);
  const lista = (msgs.data || []).map(mm => {
    const mine = mm.autor_id === me.id;
    const who = (mm.autor && (mm.autor.nome || mm.autor.email)) || "—";
    const priv = mm.destinatario_id ? ' · <span class="msg-priv">privado</span>' : "";
    const anexo = mm.anexo_storage_path
      ? '<div class="msg-anexo"><button class="lnk" onclick="baixarChatAnexo(\'' + escAttr(mm.anexo_storage_path) + '\')">📎 ' + esc(mm.anexo_nome || "Arquivo") + '</button></div>'
      : "";
    return '<div class="msg' + (mine ? " mine" : "") + '"><div class="msg-meta">' + esc(who) + priv + '</div>' +
      '<div class="msg-bubble">' + (mm.corpo ? esc(mm.corpo) : "") + anexo + '</div></div>';
  }).join("") || '<p class="muted-note" style="text-align:center;margin-top:30px">Nenhuma mensagem ainda. Diga olá 👋</p>';

  const opts = '<option value="">📢 Todos os participantes</option>' +
    participantes.map(p => '<option value="' + p.pessoa_id + '">' + esc((p.pessoas && (p.pessoas.nome || p.pessoas.email)) || p.pessoa_id) + (p.papel === "gestor" ? " (gestor)" : "") + '</option>').join("");

  const composerHtml = perm("pode_enviar_mensagens")
    ? '<div class="composer">' +
      '<select id="msgTo">' + opts + '</select>' +
      '<div class="composer-body">' +
      '<textarea id="msgBody" placeholder="Escreva uma mensagem…" onkeydown="if(event.key===\'Enter\'&&(event.metaKey||event.ctrlKey))enviarMsg()"></textarea>' +
      '<div id="msgAnexoPrev" class="msg-anexo-prev" style="display:none"></div>' +
      '</div>' +
      '<div class="composer-send">' +
      '<label class="btn sm ghost iconbtn" title="Anexar arquivo">📎<input type="file" id="msgFile" style="display:none" onchange="onMsgFile(this)"></label>' +
      '<button class="btn primary" onclick="enviarMsg()">Enviar</button>' +
      '</div></div>'
    : '<p class="muted-note perm-aviso">Você não tem permissão para enviar mensagens neste projeto.</p>';
  hint.innerHTML = '<div class="page msgs"><div class="msg-list" id="msgList">' + lista + '</div>' + composerHtml + '</div>';
  const ml = document.getElementById("msgList"); if (ml) ml.scrollTop = ml.scrollHeight;
}
function onMsgFile(input) {
  const f = input.files[0];
  const prev = document.getElementById("msgAnexoPrev");
  if (!prev) return;
  if (f) {
    prev.style.display = "flex";
    prev.innerHTML = '📎 <span>' + esc(f.name) + '</span><button class="lnk del" onclick="document.getElementById(\'msgFile\').value=\'\';document.getElementById(\'msgAnexoPrev\').style.display=\'none\'">✕</button>';
  } else {
    prev.style.display = "none";
    prev.innerHTML = "";
  }
}

async function enviarMsg() {
  const body = document.getElementById("msgBody");
  const corpo = (body.value || "").trim();
  const fileInput = document.getElementById("msgFile");
  const file = fileInput && fileInput.files[0];
  if (!corpo && !file) return;
  let anexo_storage_path = null, anexo_nome = null;
  if (file) {
    const path = curProjeto.id + "/" + uid() + "-" + file.name.replace(/[^\w.\-]/g, "_");
    const { error: upErr } = await sb.storage.from("chat").upload(path, file);
    if (upErr) { alert("Erro no upload: " + upErr.message); return; }
    anexo_storage_path = path; anexo_nome = file.name;
  }
  const to = document.getElementById("msgTo").value || null;
  const { error } = await sb.from("mensagens").insert({
    projeto_id: curProjeto.id, autor_id: me.id, destinatario_id: to,
    corpo: corpo || "", anexo_storage_path, anexo_nome
  });
  if (error) { alert("Erro: " + error.message); return; }
  route();
}

async function baixarChatAnexo(path) {
  const { data, error } = await sb.storage.from("chat").createSignedUrl(path, 3600);
  if (error) { alert("Erro: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}

/* ===== 13d) Aprovações (Fase 3) ===== */
const APBADGE = { pendente: "⏳ pendente", aprovado: "✓ aprovado", reprovado: "✕ reprovado" };
async function renderAprovacoes(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const { data: aps } = await sb.from("aprovacoes")
    .select("*, decisor:pessoas!decidido_por(nome,email), comentarios(*, autor:pessoas!autor_id(nome,email))")
    .eq("projeto_id", pid)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "comentarios", ascending: true });

  const cards = (aps || []).map(a => {
    const coms = (a.comentarios || []).map(c =>
      '<div class="co"><span class="co-who">' + esc((c.autor && (c.autor.nome || c.autor.email)) || "—") + '</span> ' + esc(c.corpo) + '</div>').join("");
    const decided = a.status !== "pendente";
    const decisor = a.decisor && (a.decisor.nome || a.decisor.email);
    return '<div class="apcard">' +
      '<div class="ap-head"><span class="ap-title">' + esc(a.titulo) + '</span><span class="apbadge ' + a.status + '">' + APBADGE[a.status] + '</span></div>' +
      (a.descricao ? '<div class="ap-desc">' + esc(a.descricao) + '</div>' : "") +
      (decided ? '<div class="ap-decision">' + (a.status === "aprovado" ? "Aprovado" : "Reprovado") + (decisor ? " por " + esc(decisor) : "") + (a.parecer ? ' — “' + esc(a.parecer) + '”' : "") + '</div>'
        : '<div class="ap-actions"><button class="btn sm ok" onclick="decidir(\'' + a.id + '\',\'aprovado\')">✓ Aprovar</button><button class="btn sm danger" onclick="decidir(\'' + a.id + '\',\'reprovado\')">✕ Reprovar</button></div>') +
      '<div class="co-thread">' + coms +
      '<div class="co-add"><input id="co-' + a.id + '" placeholder="Comentar…" onkeydown="if(event.key===\'Enter\')addComentario(\'' + a.id + '\')"><button class="btn sm" onclick="addComentario(\'' + a.id + '\')">Enviar</button></div>' +
      '</div>' +
      (canEdit ? '<button class="lnk del ap-del" onclick="delAprovacao(\'' + a.id + '\')">excluir</button>' : "") +
      '</div>';
  }).join("") || '<p class="muted-note">Nenhuma aprovação ainda.' + (canEdit ? " Crie uma para o cliente avaliar." : "") + '</p>';

  hint.innerHTML = '<div class="page">' +
    '<div class="page-head"><h2>✅ Aprovações</h2>' + (canEdit ? '<button class="btn primary" onclick="novaAprovacao()">＋ Nova aprovação</button>' : "") + '</div>' +
    cards + '</div>';
}
function novaAprovacao() {
  openModal('<h3>Nova aprovação</h3>' + field("Título", "titulo", "") +
    '<label>Descrição</label><textarea data-k="descricao" placeholder="A ideia/entrega que o cliente vai avaliar…"></textarea>' + actions("Criar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const titulo = m.querySelector('[data-k="titulo"]').value.trim();
        if (!titulo) { alert("Informe o título."); return; }
        const { error } = await sb.from("aprovacoes").insert({ projeto_id: curProjeto.id, titulo, descricao: m.querySelector('[data-k="descricao"]').value.trim(), criado_por: me.id });
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
function decidir(apId, status) {
  openModal('<h3>' + (status === "aprovado" ? "Aprovar" : "Reprovar") + '</h3>' +
    '<label>Comentário (opcional)</label><textarea data-k="parecer"></textarea>' + actions(status === "aprovado" ? "Confirmar aprovação" : "Confirmar reprovação"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const { error } = await sb.from("aprovacoes").update({ status, parecer: m.querySelector('[data-k="parecer"]').value.trim() || null, decidido_por: me.id, decidido_em: new Date().toISOString() }).eq("id", apId);
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function delAprovacao(id) { if (!confirm("Excluir esta aprovação?")) return; await sb.from("aprovacoes").delete().eq("id", id); route(); }
async function addComentario(apId) {
  const el = document.getElementById("co-" + apId); const corpo = (el.value || "").trim(); if (!corpo) return;
  const { error } = await sb.from("comentarios").insert({ aprovacao_id: apId, autor_id: me.id, corpo });
  if (error) { alert("Erro: " + error.message); return; }
  route();
}

/* ===== 13e) Materiais (visão do cliente: conteúdo compartilhado) ===== */
async function renderMateriais(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const [docs, anos, chs] = await Promise.all([
    sb.from("documentos").select("*").eq("projeto_id", pid).order("created_at", { ascending: false }),
    sb.from("anotacoes").select("*").eq("projeto_id", pid).order("updated_at", { ascending: false }),
    sb.from("checklists").select("*, checklist_itens(*)").eq("projeto_id", pid).order("ordem")
  ]);
  const docsHtml = !perm("pode_ver_documentos")
    ? '<p class="muted-note perm-aviso">Acesso a documentos não habilitado neste projeto.</p>'
    : (docs.data || []).map(d =>
        '<div class="grow-row"><div class="gr-main"><span class="gr-name">📄 ' + esc(d.nome) + '</span>' +
        '<div class="gr-actions">' + (d.storage_path ? '<button class="lnk" onclick="baixarDoc(\'' + escAttr(d.storage_path) + '\')">baixar</button>' : (d.url ? '<a class="lnk" href="' + escAttr(d.url) + '" target="_blank" rel="noopener">abrir</a>' : "")) + '</div></div></div>'
      ).join("") || '<p class="muted-note">Nada compartilhado aqui.</p>';
  const anosHtml = (anos.data || []).map(a =>
    '<div class="grow-row"><div class="gr-main"><span class="gr-name">📝 ' + esc(a.titulo || "(sem título)") + '</span></div>' +
    (a.corpo ? '<div class="ano-prev" style="white-space:pre-wrap">' + esc(a.corpo) + '</div>' : "") + '</div>'
  ).join("") || '<p class="muted-note">Nenhuma anotação compartilhada.</p>';
  const chsHtml = (chs.data || []).map(cl =>
    '<div class="chk"><div class="chk-head"><span class="chk-title">' + esc(cl.titulo) + '</span></div><div class="chk-items">' +
    (cl.checklist_itens || []).sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at)).map(it =>
      '<label class="chk-item' + (it.concluido ? " done" : "") + '"><input type="checkbox" ' + (it.concluido ? "checked" : "") + ' onchange="toggleItem(\'' + it.id + '\',' + it.concluido + ')"><span>' + esc(it.texto) + '</span></label>').join("") +
    '</div></div>'
  ).join("") || '<p class="muted-note">Nenhum checklist compartilhado.</p>';

  hint.innerHTML = '<div class="page">' +
    '<div class="gsec"><div class="gsec-head"><h3>📄 Documentos</h3></div><div class="glist">' + docsHtml + '</div></div>' +
    '<div class="gsec"><div class="gsec-head"><h3>📝 Anotações</h3></div><div class="glist">' + anosHtml + '</div></div>' +
    '<div class="gsec"><div class="gsec-head"><h3>✅ Checklists</h3></div><div class="glist">' + chsHtml + '</div></div></div>';
}

/* ===== 13f) Questionários ===== */
async function renderQuestionarios(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const { data: qs } = await sb.from("questionarios")
    .select("*, perguntas(count)")
    .eq("projeto_id", pid)
    .order("created_at", { ascending: false });

  let myRespostasMap = {};
  if (!isAdmin) {
    const { data: rs } = await sb.from("respostas").select("questionario_id").eq("respondido_por", me.id);
    (rs || []).forEach(r => { myRespostasMap[r.questionario_id] = true; });
  } else {
    const { data: rs } = await sb.from("respostas").select("questionario_id, respondido_por, pessoas(nome,email)").in("questionario_id", (qs || []).map(q => q.id));
    const byQ = {};
    (rs || []).forEach(r => {
      if (!byQ[r.questionario_id]) byQ[r.questionario_id] = [];
      byQ[r.questionario_id].push(r.pessoas);
    });
    myRespostasMap = byQ;
  }

  const cards = (qs || []).map(q => {
    const nPergs = (q.perguntas && q.perguntas[0] && q.perguntas[0].count) || 0;
    let statusEl = '';
    if (isAdmin) {
      const respondentes = myRespostasMap[q.id] || [];
      const nomes = respondentes.map(p => p ? esc(p.nome || p.email || "?") : "?").join(", ");
      statusEl = '<div class="q-resp">' + (respondentes.length ? respondentes.length + ' resposta(s): ' + nomes : 'Sem respostas ainda') + '</div>';
    } else {
      const jaRespondeu = !!myRespostasMap[q.id];
      statusEl = jaRespondeu
        ? '<span class="qbadge respondido">✓ respondido</span>'
        : '<button class="btn sm primary" onclick="responderQuestionario(\'' + q.id + '\')">Responder</button>';
    }
    return '<div class="qcard">' +
      '<div class="q-head"><span class="q-title">' + esc(q.titulo) + '</span>' +
      '<span class="qbadge ' + q.status + '">' + q.status + '</span></div>' +
      (q.descricao ? '<div class="q-desc">' + esc(q.descricao) + '</div>' : '') +
      '<div class="q-meta">' + nPergs + ' pergunta(s)' + (canEdit ? '' : '') + '</div>' +
      statusEl +
      (canEdit ? '<div class="q-admin-actions">' +
        '<button class="lnk" onclick="editarQuestionario(\'' + q.id + '\')">editar perguntas</button>' +
        '<button class="lnk" onclick="toggleQStatus(\'' + q.id + '\',\'' + q.status + '\')">' + (q.status === 'aberto' ? 'fechar' : 'reabrir') + '</button>' +
        '<button class="lnk del" onclick="delQuestionario(\'' + q.id + '\')">excluir</button></div>' : '') +
      '</div>';
  }).join("") || '<p class="muted-note">Nenhum questionário ainda.' + (canEdit ? ' Crie um para o cliente responder.' : '') + '</p>';

  hint.innerHTML = '<div class="page"><div class="page-head"><h2>📝 Questionários</h2>' +
    (canEdit ? '<button class="btn primary" onclick="novoQuestionario()">＋ Novo questionário</button>' : '') +
    '</div>' + cards + '</div>';
}

function novoQuestionario() {
  openModal('<h3>Novo questionário</h3>' + field("Título", "titulo", "") +
    '<label>Descrição (opcional)</label><textarea data-k="descricao" placeholder="Contexto para o cliente…"></textarea>' +
    actions("Criar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const titulo = m.querySelector('[data-k="titulo"]').value.trim();
        if (!titulo) { alert("Informe o título."); return; }
        const { data, error } = await sb.from("questionarios").insert({
          projeto_id: curProjeto.id, titulo,
          descricao: m.querySelector('[data-k="descricao"]').value.trim() || null,
          criado_por: me.id
        }).select().single();
        if (error) { alert("Erro: " + error.message); return; }
        closeModal();
        editarQuestionario(data.id);
      };
    });
}

async function editarQuestionario(qid) {
  const [{ data: q }, { data: pergs }] = await Promise.all([
    sb.from("questionarios").select("*").eq("id", qid).single(),
    sb.from("perguntas").select("*").eq("questionario_id", qid).order("ordem")
  ]);

  function pergHtml(p, i) {
    const tipoOpts = ["texto", "multipla", "unica", "escala"]
      .map(t => '<option value="' + t + '"' + (p.tipo === t ? " selected" : "") + '>' + { texto: "Texto livre", multipla: "Múltipla escolha", unica: "Escolha única", escala: "Escala 1–5" }[t] + '</option>').join("");
    return '<div class="perg-row" data-perg-id="' + p.id + '">' +
      '<div class="perg-num">' + (i + 1) + '</div>' +
      '<div class="perg-body">' +
      '<input data-k="texto" value="' + escAttr(p.texto) + '" placeholder="Pergunta…" style="width:100%">' +
      '<div style="display:flex;gap:8px;margin-top:6px;align-items:center">' +
      '<select data-k="tipo" style="flex:1">' + tipoOpts + '</select>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);text-transform:none;letter-spacing:0;margin:0">' +
      '<input type="checkbox" data-k="obrigatoria"' + (p.obrigatoria ? " checked" : "") + '> Obrigatória</label>' +
      '</div>' +
      ((p.tipo === "multipla" || p.tipo === "unica") ? '<textarea data-k="opcoes" style="margin-top:6px;min-height:50px" placeholder="Uma opção por linha">' + esc((p.opcoes || []).join("\n")) + '</textarea>' : '') +
      '</div>' +
      '<button class="lnk del" onclick="delPergunta(\'' + p.id + '\',\'' + qid + '\')">✕</button>' +
      '</div>';
  }

  const pergsHtml = (pergs || []).map(pergHtml).join("");

  openModal('<h3>Perguntas — ' + esc(q.titulo) + '</h3>' +
    '<div id="pergList">' + pergsHtml + '</div>' +
    '<button class="btn sm" style="margin-top:10px" onclick="addPergunta(\'' + qid + '\')">＋ Pergunta</button>' +
    '<div class="modal-actions"><span class="grow"></span>' +
    '<button class="btn" data-x>Fechar</button>' +
    '<button class="btn primary" data-ok>Salvar alterações</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = () => { closeModal(); route(); };
      m.querySelector("[data-ok]").onclick = async () => {
        const rows = m.querySelectorAll("[data-perg-id]");
        const saves = Array.from(rows).map((row, i) => {
          const get = k => (row.querySelector('[data-k="' + k + '"]') || {}).value;
          const checked = k => !!(row.querySelector('[data-k="' + k + '"]') || {}).checked;
          const tipo = get("tipo") || "texto";
          const opcoesRaw = get("opcoes") || "";
          const opcoes = (tipo === "multipla" || tipo === "unica")
            ? opcoesRaw.split("\n").map(s => s.trim()).filter(Boolean)
            : null;
          return sb.from("perguntas").update({
            texto: get("texto"), tipo, obrigatoria: checked("obrigatoria"), opcoes, ordem: i
          }).eq("id", row.dataset.pergId);
        });
        await Promise.all(saves);
        closeModal(); route();
      };
    });
}

async function addPergunta(qid) {
  const { data } = await sb.from("perguntas").insert({
    questionario_id: qid, texto: "Nova pergunta", tipo: "texto", ordem: 99
  }).select().single();
  if (data) { closeModal(); editarQuestionario(qid); }
}

async function delPergunta(pid, qid) {
  if (!confirm("Excluir esta pergunta?")) return;
  await sb.from("perguntas").delete().eq("id", pid);
  closeModal(); editarQuestionario(qid);
}

async function toggleQStatus(qid, cur) {
  await sb.from("questionarios").update({ status: cur === "aberto" ? "fechado" : "aberto" }).eq("id", qid);
  route();
}

async function delQuestionario(qid) {
  if (!confirm("Excluir este questionário e todas as respostas?")) return;
  await sb.from("questionarios").delete().eq("id", qid);
  route();
}

async function responderQuestionario(qid) {
  const [{ data: q }, { data: pergs }, { data: respostaExist }] = await Promise.all([
    sb.from("questionarios").select("*").eq("id", qid).single(),
    sb.from("perguntas").select("*").eq("questionario_id", qid).order("ordem"),
    sb.from("respostas").select("*").eq("questionario_id", qid).eq("respondido_por", me.id).maybeSingle()
  ]);
  const saved = (respostaExist && respostaExist.respostas) || {};

  const pergsHtml = (pergs || []).map((p, i) => {
    const v = saved[p.id] || "";
    let input = '';
    if (p.tipo === "texto") {
      input = '<textarea data-pid="' + p.id + '" style="width:100%;min-height:60px">' + esc(v) + '</textarea>';
    } else if (p.tipo === "escala") {
      input = '<div class="escala-row">' + [1, 2, 3, 4, 5].map(n =>
        '<label style="display:flex;align-items:center;gap:5px;font-size:13px;text-transform:none;letter-spacing:0;margin:0"><input type="radio" name="esc-' + p.id + '" data-pid="' + p.id + '" value="' + n + '"' + (String(v) === String(n) ? " checked" : "") + '> ' + n + '</label>'
      ).join("") + '</div>';
    } else {
      const opts = (p.opcoes || []);
      const multi = p.tipo === "multipla";
      const selected = Array.isArray(v) ? v : (v ? [v] : []);
      input = '<div class="opts-list">' + opts.map(o =>
        '<label style="display:flex;align-items:center;gap:8px;font-size:13.5px;text-transform:none;letter-spacing:0;margin:0;padding:4px 0"><input type="' + (multi ? "checkbox" : "radio") + '" name="opt-' + p.id + '" data-pid="' + p.id + '" value="' + escAttr(o) + '"' + (selected.includes(o) ? " checked" : "") + '> ' + esc(o) + '</label>'
      ).join("") + '</div>';
    }
    return '<div class="perg-resp">' +
      '<div class="perg-label">' + (i + 1) + '. ' + esc(p.texto) + (p.obrigatoria ? ' <span style="color:var(--danger)">*</span>' : '') + '</div>' +
      input + '</div>';
  }).join("");

  openModal('<h3>' + esc(q.titulo) + '</h3>' +
    (q.descricao ? '<p class="muted-note">' + esc(q.descricao) + '</p>' : '') +
    pergsHtml +
    '<div class="auth-err" id="qErr"></div>' +
    actions(respostaExist ? "Atualizar respostas" : "Enviar respostas"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const errEl = m.querySelector("#qErr");
        const respostasObj = {};
        for (const p of (pergs || [])) {
          const type = p.tipo;
          if (type === "texto") {
            const el = m.querySelector('[data-pid="' + p.id + '"]');
            respostasObj[p.id] = el ? el.value.trim() : "";
          } else if (type === "escala") {
            const el = m.querySelector('[data-pid="' + p.id + '"]:checked');
            respostasObj[p.id] = el ? el.value : "";
          } else if (type === "unica") {
            const el = m.querySelector('[data-pid="' + p.id + '"]:checked');
            respostasObj[p.id] = el ? el.value : "";
          } else {
            const els = m.querySelectorAll('[data-pid="' + p.id + '"]:checked');
            respostasObj[p.id] = Array.from(els).map(e => e.value);
          }
          if (p.obrigatoria) {
            const r = respostasObj[p.id];
            const empty = !r || (Array.isArray(r) && r.length === 0);
            if (empty) { errEl.textContent = 'A pergunta "' + p.texto + '" é obrigatória.'; return; }
          }
        }
        errEl.textContent = "Salvando…";
        const rec = { questionario_id: qid, respondido_por: me.id, respostas: respostasObj, updated_at: new Date().toISOString() };
        let err;
        if (respostaExist) {
          ({ error: err } = await sb.from("respostas").update({ respostas: respostasObj, updated_at: rec.updated_at }).eq("id", respostaExist.id));
        } else {
          ({ error: err } = await sb.from("respostas").insert(rec));
        }
        if (err) { errEl.textContent = "Erro: " + err.message; return; }
        closeModal(); route();
      };
    });
}

/* ===== 13g) Reuniões ===== */
function fmtDt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function renderReunioes(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const { data: rs } = await sb.from("reunioes")
    .select("*")
    .eq("projeto_id", pid)
    .order("data_hora");

  const SBADGE = { agendada: "⏳ agendada", realizada: "✓ realizada", cancelada: "✕ cancelada" };
  const cards = (rs || []).map(r => {
    return '<div class="reucard">' +
      '<div class="reu-head"><span class="reu-title">' + esc(r.titulo) + '</span>' +
      '<span class="reubadge ' + r.status + '">' + SBADGE[r.status] + '</span></div>' +
      '<div class="reu-when">📅 ' + fmtDt(r.data_hora) + ' · ' + r.duracao_min + ' min</div>' +
      (r.local_ou_link ? '<div class="reu-local">' + (r.local_ou_link.startsWith("http") ?
        '<a href="' + escAttr(r.local_ou_link) + '" target="_blank" rel="noopener" class="lnk">🔗 Link da reunião</a>' :
        '📍 ' + esc(r.local_ou_link)) + '</div>' : '') +
      (r.descricao ? '<div class="reu-desc">' + esc(r.descricao) + '</div>' : '') +
      (r.notas ? '<div class="reu-notas"><b>📋 Ata:</b> ' + esc(r.notas) + '</div>' : '') +
      (canEdit ? '<div class="reu-actions">' +
        '<button class="lnk" onclick="editarReuniao(\'' + r.id + '\')">editar</button>' +
        (r.status === "agendada" ? '<button class="lnk ok" onclick="realizarReuniao(\'' + r.id + '\')">marcar como realizada</button>' : '') +
        '<button class="lnk del" onclick="delReuniao(\'' + r.id + '\')">excluir</button></div>' : '') +
      '</div>';
  }).join("") || '<p class="muted-note">Nenhuma reunião agendada.</p>';

  hint.innerHTML = '<div class="page"><div class="page-head"><h2>📅 Reuniões</h2>' +
    (canEdit || perm("pode_marcar_reunioes") ? '<button class="btn primary" onclick="novaReuniao()">＋ Agendar reunião</button>' : '') +
    '</div>' + cards + '</div>';
}

function reuForm(r) {
  r = r || {};
  const toLocalDt = iso => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };
  return field("Título", "titulo", r.titulo || "") +
    '<label>Data e hora</label><input type="datetime-local" data-k="data_hora" value="' + escAttr(toLocalDt(r.data_hora)) + '">' +
    field("Duração (minutos)", "duracao_min", r.duracao_min || 60) +
    field("Local ou link", "local_ou_link", r.local_ou_link || "") +
    '<label>Descrição (pauta)</label><textarea data-k="descricao">' + esc(r.descricao || "") + '</textarea>';
}

function novaReuniao() {
  openModal('<h3>Agendar reunião</h3>' + reuForm() + actions("Agendar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => (m.querySelector('[data-k="' + k + '"]') || {}).value || "";
        const titulo = get("titulo").trim();
        const data_hora = get("data_hora");
        if (!titulo) { alert("Informe o título."); return; }
        if (!data_hora) { alert("Informe a data e hora."); return; }
        const { error } = await sb.from("reunioes").insert({
          projeto_id: curProjeto.id, titulo, data_hora: new Date(data_hora).toISOString(),
          duracao_min: parseInt(get("duracao_min")) || 60,
          local_ou_link: get("local_ou_link").trim() || null,
          descricao: get("descricao").trim() || null,
          criado_por: me.id
        });
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}

async function editarReuniao(rid) {
  const { data: r } = await sb.from("reunioes").select("*").eq("id", rid).single();
  openModal('<h3>Editar reunião</h3>' + reuForm(r) +
    '<label>Ata / notas pós-reunião</label><textarea data-k="notas">' + esc(r.notas || "") + '</textarea>' +
    actions("Salvar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => (m.querySelector('[data-k="' + k + '"]') || {}).value || "";
        const titulo = get("titulo").trim();
        const data_hora = get("data_hora");
        if (!titulo || !data_hora) { alert("Título e data são obrigatórios."); return; }
        const { error } = await sb.from("reunioes").update({
          titulo, data_hora: new Date(data_hora).toISOString(),
          duracao_min: parseInt(get("duracao_min")) || 60,
          local_ou_link: get("local_ou_link").trim() || null,
          descricao: get("descricao").trim() || null,
          notas: get("notas").trim() || null
        }).eq("id", rid);
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}

async function realizarReuniao(rid) {
  openModal('<h3>Marcar como realizada</h3>' +
    '<label>Ata / notas (opcional)</label><textarea data-k="notas" style="min-height:100px"></textarea>' +
    actions("Confirmar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const notas = m.querySelector('[data-k="notas"]').value.trim() || null;
        await sb.from("reunioes").update({ status: "realizada", notas }).eq("id", rid);
        closeModal(); route();
      };
    });
}

async function delReuniao(rid) {
  if (!confirm("Excluir esta reunião?")) return;
  await sb.from("reunioes").delete().eq("id", rid);
  route();
}

/* ===== 13h) Participantes (Fase 5 antecipada) ===== */
function papelSelect(cur) {
  return '<label>Papel</label><select data-k="papel">' +
    '<option value="cliente"' + (cur !== "gestor" ? " selected" : "") + '>Cliente (participante)</option>' +
    '<option value="gestor"' + (cur === "gestor" ? " selected" : "") + '>Gestor (seu time)</option></select>';
}
function permChecks(m) {
  m = m || {};
  const row = (k, label, def) => '<label class="ckrow"><input type="checkbox" data-k="' + k + '" ' + ((m[k] !== undefined ? m[k] : def) ? "checked" : "") + '> ' + label + '</label>';
  return '<label>Permissões</label><div class="ckgroup">' +
    row("pode_ver_documentos", "Ver documentos", true) +
    row("pode_enviar_mensagens", "Enviar mensagens", true) +
    row("pode_marcar_reunioes", "Marcar reuniões", false) +
    row("pode_adicionar_pessoas", "Adicionar pessoas", false) + '</div>';
}
function lerPerms(m) {
  const o = {};
  ["pode_adicionar_pessoas", "pode_enviar_mensagens", "pode_marcar_reunioes", "pode_ver_documentos"]
    .forEach(k => { o[k] = m.querySelector('[data-k="' + k + '"]').checked; });
  return o;
}

async function renderParticipantes(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const { data: ms } = await sb.from("membros").select("*, pessoas(nome,email)").eq("projeto_id", pid).order("created_at");
  const rows = (ms || []).map(m => {
    const p = m.pessoas || {};
    const perms = [
      m.pode_adicionar_pessoas && "adiciona pessoas", m.pode_enviar_mensagens && "mensagens",
      m.pode_marcar_reunioes && "reuniões", m.pode_ver_documentos && "documentos"
    ].filter(Boolean).map(x => '<span class="permchip">' + x + '</span>').join("");
    return '<div class="grow-row"><div class="gr-main">' +
      '<span class="gr-name">' + esc(p.nome || p.email || "—") + ' <span class="papel ' + m.papel + '">' + m.papel + '</span></span>' +
      '<div class="gr-actions"><button class="lnk" onclick="editarMembro(\'' + m.id + '\')">permissões</button>' +
      '<button class="lnk del" onclick="removerMembro(\'' + m.id + '\')">remover</button></div></div>' +
      '<div class="ano-prev">' + esc(p.email || "") + '</div>' +
      (perms ? '<div class="perms">' + perms + '</div>' : "") + '</div>';
  }).join("") || '<p class="muted-note">Nenhum participante ainda. Adicione alguém para liberar o portal do cliente.</p>';
  hint.innerHTML = '<div class="page"><div class="page-head"><h2>👥 Participantes</h2>' +
    '<button class="btn primary" onclick="adicionarParticipante()">＋ Adicionar</button></div>' + rows + '</div>';
}

function adicionarParticipante() {
  openModal('<h3>Adicionar participante</h3>' +
    field("E-mail", "email", "") + field("Nome (opcional)", "nome", "") +
    papelSelect("cliente") + permChecks(null) +
    '<p class="muted-note" style="font-size:12px;margin-top:8px">Se a pessoa ainda não tiver conta, ela será convidada por e-mail.</p>' +
    '<div class="auth-err" id="ppErr"></div>' + actions("Adicionar / convidar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const email = m.querySelector('[data-k="email"]').value.trim();
        const errEl = m.querySelector("#ppErr");
        if (!email) { errEl.textContent = "Informe o e-mail."; return; }
        errEl.textContent = "Processando…";
        const { data, error } = await sb.functions.invoke("adicionar-participante", {
          body: {
            projeto_id: curProjeto.id, email,
            nome: m.querySelector('[data-k="nome"]').value.trim(),
            papel: m.querySelector('[data-k="papel"]').value,
            permissoes: lerPerms(m)
          }
        });
        if (error) {
          let msg = error.message;
          try { const ctx = await error.context.json(); if (ctx && ctx.error) msg = ctx.error; } catch (e) {}
          errEl.textContent = "Erro: " + msg; return;
        }
        if (data && data.error) { errEl.textContent = "Erro: " + data.error; return; }
        closeModal(); route();
      };
    });
}

async function editarMembro(id) {
  const { data: m } = await sb.from("membros").select("*, pessoas(nome,email)").eq("id", id).single();
  openModal('<h3>Permissões — ' + esc((m.pessoas && (m.pessoas.nome || m.pessoas.email)) || "") + '</h3>' +
    papelSelect(m.papel) + permChecks(m) + actions("Salvar"),
    mo => {
      mo.querySelector("[data-x]").onclick = closeModal;
      mo.querySelector("[data-ok]").onclick = async () => {
        const rec = Object.assign({ papel: mo.querySelector('[data-k="papel"]').value }, lerPerms(mo));
        const { error } = await sb.from("membros").update(rec).eq("id", id);
        if (error) { alert("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function removerMembro(id) { if (!confirm("Remover este participante do projeto?")) return; await sb.from("membros").delete().eq("id", id); route(); }

/* — Editar / Excluir cliente — */
function editarCliente() {
  const c = curCliente;
  openModal('<h3>Editar cliente</h3>' +
    field("Empresa", "empresa", c.empresa || "") +
    field("Contato / nome", "nome", c.nome || "") +
    '<label>Status</label><select data-k="status">' +
    '<option value="ativo"' + (c.status === "ativo" ? " selected" : "") + '>Ativo</option>' +
    '<option value="pausado"' + (c.status !== "ativo" ? " selected" : "") + '>Pausado</option></select>' +
    '<label>Cor da marca</label><input type="color" data-k="cor" value="' + escAttr((c.marca && c.marca.cor) || "#e8a33d") + '" style="height:40px;padding:4px">' +
    actions("Salvar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => m.querySelector('[data-k="' + k + '"]').value.trim();
        const empresa = get("empresa");
        if (!empresa) { alert("Informe a empresa."); return; }
        const marca = Object.assign({}, c.marca || {}, { cor: get("cor"), titulo: empresa });
        const upd = { empresa, nome: get("nome") || empresa, status: get("status"), marca };
        const { error } = await sb.from("clientes").update(upd).eq("id", c.id);
        if (error) { alert("Erro: " + error.message); return; }
        curCliente = Object.assign({}, c, upd);
        closeModal(); route();
      };
    });
}

async function excluirCliente() {
  if (curCliente.is_interno) { alert("Não é possível excluir Meus Projetos."); return; }
  const nome = curCliente.empresa || curCliente.nome;
  if (!confirm('Excluir "' + nome + '" e TODOS os seus projetos, painéis, documentos e mensagens?\n\nEsta ação não pode ser desfeita.')) return;
  const { error } = await sb.from("clientes").delete().eq("id", curCliente.id);
  if (error) { alert("Erro: " + error.message); return; }
  irConsole();
}

/* ===== 14) Topbar ===== */
function wireTopbar() {
  $("#authBtn").onclick = authModal;
  $("#adminBtn").onclick = irConsole;
  $("#meusBtn").onclick = irMeusProjetos;
  $("#addBtn").onclick = openPicker;
  $("#editBtn").onclick = () => { editMode = !editMode; route(); };
}

/* ===== Boot ===== */
/* IMPORTANTE: não chamar `await sb.from(...)` dentro do callback de
   onAuthStateChange (deadlock no lock interno). Adiamos com setTimeout(0).
   O evento INITIAL_SESSION já entrega a sessão persistida no load. */
wireTopbar();
sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => onSession(session), 0); });
