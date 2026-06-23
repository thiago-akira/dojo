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
let canEdit = false;           // pode editar o painel atual (admin ou gestor)
let editMode = false;
let brand = { titulo: "Dojo", cor: "#e8a33d", logoUrl: "" };

/* Estado do painel (layout de widgets) */
let state = defaultState();
let _saveTimer = null;

function defaultState() { return { spaces: [{ id: uid(), name: "Painel", tiles: [] }] }; }
function space() { return state.spaces[0] || (state.spaces[0] = { id: uid(), name: "Painel", tiles: [] }); }

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
  $("#crumb").innerHTML = "";

  if (!me) return showLogin(hint);
  if (view === "console") return renderConsole(canvas, hint);
  if (view === "cliente") return renderClienteDetail(canvas, hint);
  if (view === "painel") return renderPainel(canvas, hint);
  showLogin(hint);
}

function showLogin(hint) {
  hint.style.display = "block";
  hint.innerHTML = '<div class="welcome"><div class="welcome-mark">◯</div>' +
    '<h2>Dojo</h2><p>Entre para acessar seus painéis.</p>' +
    '<button class="btn primary" onclick="authModal()">Entrar</button></div>';
}

/* ===== 6) Console do admin: lista de clientes ===== */
async function renderConsole(canvas, hint) {
  view = "console"; curCliente = null; curProjeto = null;
  $("#crumb").innerHTML = '<span class="cr-cur">Clientes</span>';
  const { data: clientes, error } = await sb.from("clientes").select("*, projetos(count)").order("nome");
  if (error) { hint.style.display = "block"; hint.textContent = "Erro ao carregar clientes."; return; }
  canvas.style.display = "none";
  hint.style.display = "block";
  hint.innerHTML = '<div class="page">' +
    '<div class="page-head"><h2>👥 Clientes</h2><button class="btn primary" onclick="novoCliente()">＋ Novo cliente</button></div>' +
    (clientes.length ? '<div class="cli-grid">' + clientes.map(c => {
      const n = (c.projetos && c.projetos[0] && c.projetos[0].count) || 0;
      return '<div class="cli-card" onclick="abrirCliente(\'' + c.id + '\')">' +
        '<div class="cli-name">' + esc(c.empresa || c.nome) + '</div>' +
        '<div class="cli-sub">' + esc(c.nome) + '</div>' +
        '<div class="cli-meta"><span class="cli-status ' + (c.status === "ativo" ? "ativo" : "pausado") + '">' + esc(c.status) + '</span>' +
        '<span>' + n + ' projeto' + (n === 1 ? "" : "s") + '</span></div></div>';
    }).join("") + '</div>'
      : '<p class="muted-note">Nenhum cliente ainda. Crie o primeiro com <b>＋ Novo cliente</b>.</p>') +
    '</div>';
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
    '<div class="page-head"><h2>' + esc(c.empresa || c.nome) + '</h2><button class="btn primary" onclick="novoProjeto()">＋ Novo projeto</button></div>' +
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
  canEdit = isAdmin; // gestor também poderá editar (RLS cobre); refinaremos na Fase 5
  await loadPainel(id);
  view = "painel"; editMode = false; route();
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

/* ===== 9) Render do painel (grid de widgets) ===== */
function renderPainel(canvas, hint) {
  const c = curCliente;
  $("#crumb").innerHTML =
    (isAdmin ? '<a class="cr-link" onclick="irConsole()">Clientes</a><span class="cr-sep">›</span>' +
      '<a class="cr-link" onclick="abrirCliente(\'' + c.id + '\')">' + esc(c.empresa || c.nome) + '</a><span class="cr-sep">›</span>' : '') +
    '<span class="cr-cur">' + esc(curProjeto.nome) + '</span>';

  canvas.style.display = "grid";
  const tiles = space().tiles;
  if (!tiles.length) {
    hint.style.display = "block";
    hint.textContent = editMode ? "Painel vazio — clique em ＋ Adicionar." : "Nada por aqui ainda.";
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
  const inPainel = view === "painel";
  $("#adminBtn").style.display = (isAdmin && view !== "console") ? "" : "none";
  $("#editBtn").style.display = (inPainel && canEdit) ? "" : "none";
  $("#addBtn").style.display = (inPainel && canEdit && editMode) ? "" : "none";
  $("#editBtn").classList.toggle("on", editMode);
  $("#editBtn").textContent = editMode ? "✓ Concluir" : "✏ Editar";
  $("#authBtn").textContent = me ? (me.nome || me.email || "Conta") : "Entrar";
  document.body.classList.toggle("edit", editMode && inPainel);
}
function irConsole() { view = "console"; route(); }

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
          err("✓ Conta criada! Confirme pelo e-mail e depois entre.");
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

/* ===== 14) Topbar ===== */
function wireTopbar() {
  $("#authBtn").onclick = authModal;
  $("#adminBtn").onclick = irConsole;
  $("#addBtn").onclick = openPicker;
  $("#editBtn").onclick = () => { editMode = !editMode; route(); };
}

/* ===== Boot ===== */
wireTopbar();
sb.auth.onAuthStateChange((_e, session) => onSession(session));
sb.auth.getSession().then(({ data }) => onSession(data.session));
