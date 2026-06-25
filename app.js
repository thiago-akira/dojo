/* ====================================================================
   Dojo — Painéis de Clientes (admin controla, cliente vê/interage)
   Vanilla JS, sem build. Backend: Supabase (Auth + Postgres + RLS).
   ==================================================================== */

/* ===== 1) Cliente Supabase ===== */
const CFG = window.DOJO_CONFIG || {};
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
const COLS = 24;   // resolução lógica do grid (coordenadas dos tiles)
const RES = 2;     // fator de migração de layouts antigos (12→24)
const SUB = 2;     // sub-resolução de render: permite passo de 0,5 célula (ajuste fino)

/* ===== 2) Helpers ===== */
const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const escAttr = s => String(s == null ? "" : s).replace(/"/g, "&quot;");

/* ===== 2b) Personalização por usuário (localStorage) ===== */
const DEFAULT_PREFS = { theme: "escuro", fontScale: 100, contrast: false };
let prefs = (() => { try { return Object.assign({}, DEFAULT_PREFS, JSON.parse(localStorage.getItem("dojo_prefs") || "{}")); } catch (e) { return Object.assign({}, DEFAULT_PREFS); } })();
function savePrefs() { try { localStorage.setItem("dojo_prefs", JSON.stringify(prefs)); } catch (e) { } }
function applyPrefs() {
  const root = document.documentElement;
  root.setAttribute("data-theme", prefs.theme || "escuro");
  root.classList.toggle("hc", !!prefs.contrast);
  document.body.style.zoom = (prefs.fontScale || 100) / 100;
  const b = getProjBg();
  if (b.type === "solid" || b.type === "gradient") document.body.style.background = b.value || "";
  else if (b.type === "photo" && b.value) document.body.style.background = "#0f0f14 url('" + String(b.value).replace(/['"\\]/g, "") + "') center/cover fixed";
  else document.body.style.background = "";
}
/* Fundo POR PROJETO, por usuário (item 6) — localStorage por projeto */
function getProjBg() {
  if (!curProjeto || view !== "painel") return { type: "none" };   // fundo só vale dentro do projeto
  try { return JSON.parse(localStorage.getItem("dojo_bg_" + curProjeto.id) || '{"type":"none"}'); } catch (e) { return { type: "none" }; }
}
function setProjBg(bg) {
  if (!curProjeto) { toast("Abra um projeto para definir o fundo."); return; }
  localStorage.setItem("dojo_bg_" + curProjeto.id, JSON.stringify(bg || { type: "none" }));
  applyPrefs();
}
const GRADIENTES = [
  "linear-gradient(135deg,#1a1b2e,#2d1b3d)", "linear-gradient(135deg,#0f2027,#203a43,#2c5364)",
  "linear-gradient(135deg,#42275a,#734b6d)", "linear-gradient(135deg,#232526,#414345)",
  "linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)", "linear-gradient(135deg,#16222a,#3a6073)"
];
const TEMAS = [
  { k: "escuro", nome: "Escuro", chip: "#1a1b22" }, { k: "noturno", nome: "Noturno", chip: "#0b1220" },
  { k: "claro", nome: "Claro", chip: "#ffffff" }, { k: "areia", nome: "Areia", chip: "#f3ece0" }
];

function abrirPersonalizar() {
  const themeBtns = TEMAS.map(t => '<button class="theme-opt' + (prefs.theme === t.k ? " on" : "") + '" data-theme="' + t.k + '"><span class="theme-chip" style="background:' + t.chip + '"></span>' + t.nome + '</button>').join("");
  const gradBtns = GRADIENTES.map((g, i) => '<button class="grad-opt" data-grad="' + i + '" style="background:' + g + '"></button>').join("");
  const canExport = canEdit && curProjeto;
  openModal('<h3>⚙ Personalizar</h3>' +
    '<div class="pz-sec"><div class="pz-sec-tit">🎨 Tema</div><div class="theme-grid">' + themeBtns + '</div></div>' +
    '<div class="pz-sec"><div class="pz-sec-tit">🖼 Plano de fundo <span class="muted-note" style="text-transform:none;letter-spacing:0;font-weight:600;font-size:11px">(só deste projeto)</span></div><div class="bg-grid">' +
      '<button class="bg-opt" data-bg="none">Nenhum</button><button class="bg-opt" data-bg="gradient">Degradê</button>' +
      '<button class="bg-opt" data-bg="solid">Cor sólida</button><button class="bg-opt" data-bg="foto">🎲 Foto aleatória</button>' +
      '<button class="bg-opt" data-bg="link">Link/Upload</button></div>' +
      '<div class="grad-row" id="gradRow" style="display:none">' + gradBtns + '</div><div id="bgExtra" style="margin-top:8px"></div></div>' +
    '<div class="pz-sec"><div class="pz-sec-tit">🔤 Acessibilidade</div>' +
      '<div class="pz-row"><span style="font-size:13px">Tamanho de tudo</span><div class="font-ctrl"><button data-font="-">−</button><span class="font-val" id="fontVal">' + (prefs.fontScale || 100) + '%</span><button data-font="+">＋</button></div></div>' +
      '<label class="pz-toggle" style="margin-top:10px"><input type="checkbox" id="hcChk"' + (prefs.contrast ? " checked" : "") + '> Alto contraste</label></div>' +
    (canExport ? '<div class="pz-sec"><div class="pz-sec-tit">💾 Painel (JSON)</div><div class="pz-actions"><button class="btn sm" id="expBtn">📥 Exportar</button><label class="btn sm" style="cursor:pointer">📤 Importar<input type="file" id="impFile" accept="application/json" style="display:none"></label></div></div>' : '') +
    '<div class="pz-sec"><button class="btn" id="ajudaBtn">❓ Como usar o Dojo</button></div>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn primary" data-x>Fechar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelectorAll(".theme-opt").forEach(b => b.onclick = () => { prefs.theme = b.dataset.theme; savePrefs(); applyPrefs(); m.querySelectorAll(".theme-opt").forEach(x => x.classList.toggle("on", x === b)); });
      const gradRow = m.querySelector("#gradRow"), bgExtra = m.querySelector("#bgExtra");
      const markBg = t => m.querySelectorAll(".bg-opt").forEach(x => x.classList.toggle("on", x.dataset.bg === t));
      const sortearFoto = () => { const seed = "d" + Math.random().toString(36).slice(2, 9); setProjBg({ type: "photo", value: "https://picsum.photos/seed/" + seed + "/1600/900" }); };
      const uploadFundo = file => { if (!file) return; if (file.size > 1600000) { toast("Imagem grande demais (máx ~1.5MB). Use um link."); return; } const r = new FileReader(); r.onload = () => { setProjBg({ type: "photo", value: r.result }); }; r.readAsDataURL(file); };
      m.querySelectorAll(".bg-opt").forEach(b => b.onclick = () => {
        const t = b.dataset.bg; gradRow.style.display = "none"; bgExtra.innerHTML = "";
        if (t === "none") { setProjBg({ type: "none" }); markBg("none"); }
        else if (t === "gradient") { gradRow.style.display = "flex"; markBg("gradient"); }
        else if (t === "solid") { markBg("solid"); bgExtra.innerHTML = '<input type="color" id="bgColor" value="#1a1b2e" style="height:40px;padding:4px;width:100%">'; m.querySelector("#bgColor").oninput = e => setProjBg({ type: "solid", value: e.target.value }); }
        else if (t === "foto") { markBg("foto"); sortearFoto(); bgExtra.innerHTML = '<button class="btn sm" id="reFoto">🎲 Outra foto</button> <span class="muted-note" style="font-size:12px">só neste projeto — clique pra outra</span>'; m.querySelector("#reFoto").onclick = sortearFoto; }
        else if (t === "link") { markBg("link"); bgExtra.innerHTML = '<input id="bgUrl" placeholder="Cole o link de uma imagem…" style="width:100%"><label class="btn sm" style="cursor:pointer;margin-top:8px;display:inline-block">📁 Enviar imagem<input type="file" id="bgUpload" accept="image/*" style="display:none"></label>'; m.querySelector("#bgUrl").onchange = e => { const v = e.target.value.trim(); if (v) setProjBg({ type: "photo", value: v }); }; m.querySelector("#bgUpload").onchange = e => uploadFundo(e.target.files[0]); }
      });
      m.querySelectorAll(".grad-opt").forEach(b => b.onclick = () => { setProjBg({ type: "gradient", value: GRADIENTES[+b.dataset.grad] }); m.querySelectorAll(".grad-opt").forEach(x => x.classList.toggle("on", x === b)); });
      const cur = getProjBg();
      markBg(cur.type === "photo" ? (String(cur.value).includes("picsum") ? "foto" : "link") : cur.type);
      if (cur.type === "gradient") gradRow.style.display = "flex";
      m.querySelectorAll("[data-font]").forEach(b => b.onclick = () => { let v = (prefs.fontScale || 100) + (b.dataset.font === "+" ? 10 : -10); v = Math.max(80, Math.min(160, v)); prefs.fontScale = v; savePrefs(); applyPrefs(); m.querySelector("#fontVal").textContent = v + "%"; });
      m.querySelector("#hcChk").onchange = e => { prefs.contrast = e.target.checked; savePrefs(); applyPrefs(); };
      if (canExport) { m.querySelector("#expBtn").onclick = exportarPainel; m.querySelector("#impFile").onchange = e => { if (e.target.files[0]) importarPainel(e.target.files[0]); }; }
      m.querySelector("#ajudaBtn").onclick = abrirAjuda;
    });
}
function exportarPainel() {
  if (!curProjeto) { toast("Abra um projeto para exportar."); return; }
  const data = JSON.stringify({ projeto: curProjeto.nome, layout: state, exportado_em: new Date().toISOString() }, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = "dojo-" + String(curProjeto.nome || "painel").replace(/\W+/g, "_").toLowerCase() + ".json";
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importarPainel(file) {
  const r = new FileReader();
  r.onload = async () => {
    let layout;
    try { const obj = JSON.parse(r.result); layout = obj.layout || obj; if (!layout || !layout.spaces) throw 0; } catch (e) { toast("Erro: arquivo JSON inválido."); return; }
    if (!(await confirmDialog("Substituir o painel atual pelo conteúdo do arquivo? O atual será sobrescrito."))) return;
    state = layout; save(); pushHist("Importou painel"); closeModal(); route(); toast("Painel importado.");
  };
  r.readAsText(file);
}
function abrirAjuda() {
  openModal('<h3>❓ Como usar o Dojo</h3><div class="ajuda">' +
    '<h4>📋 Painel e widgets</h4><p>No modo <b>Editar</b>, clique em <b>＋ Adicionar</b> para inserir widgets. Arraste pela borda para mover e use o canto inferior direito para redimensionar. O ⚙ configura cada widget.</p>' +
    '<h4>🗂 Abas e espaço Admin</h4><p><b>Painel</b> = o que o cliente vê; <b>🔒 Admin</b> = só você. Use <b>＋ Aba</b> para criar novas abas de painel.</p>' +
    '<h4>👁 Ver como cliente</h4><p>Mostra o portal exatamente como o cliente enxerga, sem os controles de admin.</p>' +
    '<h4>💬 Comentários</h4><p>Passe o mouse sobre um widget (ou item dentro dele) e clique no 💬 para conversar. Aparece ao vivo.</p>' +
    '<h4>📋 Formulários</h4><p>O widget <b>Formulário</b> mostra as perguntas no painel; você vê o dashboard de respostas com médias e resumo por IA.</p>' +
    '<h4>🔔 Avisos</h4><p>O sino mostra novidades. Você vê acessos dos clientes; o cliente vê mensagens, aprovações, etapas concluídas, etc.</p>' +
    '<h4>🎨 Personalizar</h4><p>Neste menu (⋮): tema, fundo, tamanho das fontes e alto contraste — salvo só pra você.</p>' +
    '</div><div class="modal-actions"><span class="grow"></span><button class="btn primary" data-x>Entendi</button></div>',
    m => { m.querySelector("[data-x]").onclick = closeModal; });
}

/* ===== 3) Estado de sessão e navegação ===== */
let me = null;                 // linha de `pessoas` do usuário logado
let isAdmin = false;
let view = "login";            // login | console | cliente | painel
let curCliente = null;         // {id, nome, empresa, marca, ...}
let curProjeto = null;         // {id, nome, ...}
let myMembro = null;           // linha de `membros` do usuário no projeto atual (null se admin)
let canEdit = false;           // EFETIVO (considera a prévia de cliente)
let canEditReal = false;       // valor real (admin ou gestor do projeto)
let previewCliente = false;    // admin vendo "como o cliente vê"
let editMode = false;
let projTab = "painel";        // painel | gestao | mensagens
let consoleTab = "clientes";   // clientes | meus-projetos
let curSpaceId = null;         // id do espaço (aba de painel) ativo

/* Em prévia, simula um cliente padrão (vê documentos e mensagens; sem perms elevadas) */
const PREVIEW_PERMS = { pode_ver_documentos: true, pode_enviar_mensagens: true, pode_marcar_reunioes: false, pode_adicionar_pessoas: false };
/* Admin "atuante": false quando ele está na prévia de cliente */
function actingAdmin() { return isAdmin && !previewCliente; }

/* Checa flag de permissão do membro atual. Admin e gestores têm tudo. */
function perm(flag) {
  if (previewCliente) return !!PREVIEW_PERMS[flag];
  if (isAdmin || canEdit) return true;
  return !!(myMembro && myMembro[flag]);
}

/* Estado do painel (layout de widgets) */
let state = defaultState();
let _saveTimer = null;

function defaultState() { return { _res2: true, spaces: [{ id: uid(), name: "Painel", visibility: "compartilhado", tiles: [] }] }; }
function space() {
  const ss = state.spaces || [];
  return ss.find(s => s.id === curSpaceId) || ss[0] || (ss.push({ id: uid(), name: "Painel", visibility: "compartilhado", tiles: [] }), ss[0]);
}
/* Espaços visíveis para o usuário atual (admin vê tudo; cliente só vê compartilhados) */
function visibleSpaces() {
  return (state.spaces || []).filter(s => actingAdmin() || s.visibility !== "interno");
}
/* Contexto do painel atual: "interno" (aba Admin, só você) ou "shared" (aba Painel, cliente vê) */
function panelCtx() { return projTab === "admin" ? "interno" : "shared"; }
function spacesFor(ctx) {
  return (state.spaces || []).filter(s => ctx === "interno" ? s.visibility === "interno" : s.visibility !== "interno");
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
    emoji: "📝", name: "Nota / Aviso", hidden: true, desc: "Texto livre para o cliente ler.",
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
    w: 3, h: 3, defaults: { title: "Links", items: [{label: "Site", url: "https://exemplo.com", desc: ""}] },
    render(t, c) {
      const p = t.props;
      if (!p.items && p.raw !== undefined) {
        p.items = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]).map(a => ({label: a[0], url: a[1] || "", desc: ""}));
        delete p.raw; if (canEdit) save();
      }
      const items = p.items || [];
      const head = '<div class="w-head"><span class="w-title">' + esc(p.title || "Links") + '</span>' + (canEdit ? '<button class="btn sm" onclick="linkAdd(\'' + t.id + '\')">＋ Link</button>' : '') + '</div>';
      const body = items.map((a, i) => {
        if (canEdit) {
          return '<div class="link-row link-edit">' +
            '<div class="link-fields">' +
            '<input class="link-inp" value="' + escAttr(a.label || "") + '" placeholder="Nome" oninput="linkUpdate(\'' + t.id + '\',' + i + ',\'label\',this.value)">' +
            '<input class="link-inp" value="' + escAttr(a.url || "") + '" placeholder="https://..." oninput="linkUpdate(\'' + t.id + '\',' + i + ',\'url\',this.value)">' +
            '<input class="link-inp" value="' + escAttr(a.desc || "") + '" placeholder="Descrição (opcional)" oninput="linkUpdate(\'' + t.id + '\',' + i + ',\'desc\',this.value)">' +
            '</div>' +
            '<button class="lnk del link-del" onclick="linkDel(\'' + t.id + '\',' + i + ')" title="Remover">✕</button>' +
            '</div>';
        }
        return '<div class="link-row">' +
          '<a href="' + escAttr(a.url || "#") + '" target="_blank" rel="noopener" class="link-title">🔗 ' + esc(a.label || a.url || "") + '</a>' +
          (a.desc ? '<div class="link-desc-txt">' + esc(a.desc) + '</div>' : '') +
          '</div>';
      }).join("");
      c.innerHTML = head + '<div class="w-body"><div class="links-list">' + (body || '<p class="muted-note">Nenhum link.</p>') + '</div></div>';
    },
    form(p) { return field("Título", "title", p.title); }
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
  },
  video: {
    emoji: "🎬", name: "Vídeo", desc: "Incorpora um vídeo do YouTube, Vimeo, Loom ou link direto.",
    w: 5, h: 4, defaults: { title: "", url: "" },
    render(t, c) {
      const p = t.props;
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      const e = videoEmbedUrl(p.url);
      let body;
      if (e.type === "none") body = '<div class="video-empty">🎬 Configure o link do vídeo ao editar este widget.</div>';
      else if (e.type === "iframe") body = '<div class="video-frame"><iframe src="' + escAttr(e.url) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>';
      else if (e.type === "video") body = '<div class="video-frame"><video src="' + escAttr(e.url) + '" controls></video></div>';
      else body = '<div class="video-empty">Link não reconhecido. Use YouTube, Vimeo, Loom ou um arquivo .mp4.</div>';
      c.innerHTML = head + body;
    },
    form(p) { return field("Título (opcional)", "title", p.title) + field("Link do vídeo", "url", p.url); }
  },
  code: {
    emoji: "💻", name: "Código", desc: "Bloco de código editável com botão copiar.",
    w: 5, h: 4, defaults: { title: "Código", lang: "", code: "" },
    render(t, c) {
      const p = t.props;
      const LANGS = ["Texto", "JSON", "Python", "JavaScript", "CSS", "HTML"];
      const langSel = '<select class="code-lang-sel" onchange="codeLangChange(\'' + t.id + '\',this.value)">' +
        '<option value=""' + (!p.lang ? " selected" : "") + '>linguagem…</option>' +
        LANGS.map(l => '<option value="' + l + '"' + (p.lang === l ? " selected" : "") + '>' + l + '</option>').join("") + '</select>';
      const titleHtml = canEdit
        ? '<span class="w-title code-title-edit" contenteditable="true" spellcheck="false" onblur="codeTitleSave(\'' + t.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' + esc(p.title || "Código") + '</span>'
        : '<span class="w-title">' + esc(p.title || "Código") + '</span>';
      const head = '<div class="w-head">' + titleHtml + langSel + '<span class="grow"></span><button class="code-copy" title="Copiar código" onclick="copyCode(this)">⧉</button></div>';
      if (canEdit) {
        c.innerHTML = head + '<div class="code-body-edit"><textarea class="code-textarea" spellcheck="false" oninput="codeContentSave(\'' + t.id + '\',this)">' + esc(p.code || "") + '</textarea></div>';
      } else {
        c.innerHTML = head + '<div class="code-body"><pre><code>' + esc(p.code || "") + '</code></pre></div>';
      }
    },
    form(p) { return field("Título", "title", p.title); }
  },
  paragrafo: {
    emoji: "📄", name: "Parágrafo", desc: "Texto editável ao clicar, com estilo ajustável.",
    w: 4, h: 3, defaults: { title: "", text: "Clique para escrever…", size: "15", align: "left", color: "" },
    render(t, c) {
      const p = t.props;
      const style = 'font-size:' + (parseInt(p.size) || 15) + 'px;text-align:' + (p.align || "left") + ';' + (p.color ? 'color:' + p.color + ';' : '');
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      const body = p.html ? sanitizeHtml(p.html) : esc(p.text || "");
      if (editMode && canEdit) {
        c.innerHTML = head + '<div class="para-body para-edit" contenteditable="true" style="' + style + '" oninput="onParaInput(this,\'' + t.id + '\')" onfocus="paraToolbar(this)" onblur="hideParaToolbar()">' + body + '</div>';
      } else {
        c.innerHTML = head + '<div class="para-body" style="' + style + '">' + body + '</div>';
      }
    },
    form(p) {
      return field("Título (opcional)", "title", p.title) +
        field("Tamanho da fonte (px)", "size", p.size) +
        '<label>Alinhamento</label><select data-k="align">' +
        '<option value="left"' + (p.align !== "center" && p.align !== "right" ? " selected" : "") + '>Esquerda</option>' +
        '<option value="center"' + (p.align === "center" ? " selected" : "") + '>Centro</option>' +
        '<option value="right"' + (p.align === "right" ? " selected" : "") + '>Direita</option></select>' +
        '<label>Cor do texto (opcional)</label><input type="color" data-k="color" value="' + escAttr(p.color || "#e9eaf0") + '" style="height:40px;padding:4px">' +
        '<label>Texto</label><textarea data-k="text" style="min-height:110px">' + esc(p.text) + '</textarea>';
    }
  },
  lista: {
    emoji: "📋", name: "Lista / Notas", desc: "Lista estruturada: títulos, subtítulos, parágrafos, marcadores e numeração.",
    w: 4, h: 4, defaults: { title: "Lista", items: [] },
    render(t, c) {
      const p = t.props;
      // Migração: lista antiga usava props.html (contenteditable)
      if (p.html !== undefined && !p.items) { p.items = parseListaHtml(p.html); delete p.html; if (canEdit) save(); }
      const items = p.items || [];
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      if (editMode && canEdit) {
        const TYPE_LABELS = { h3: 'H', h4: 'h', p: '¶', bullet: '•', num: '1.' };
        const TYPES = ['h3', 'h4', 'p', 'bullet', 'num'];
        const rows = items.map((item, i) => {
          const opts = TYPES.map(tp => '<option value="' + tp + '"' + (item.type === tp ? ' selected' : '') + '>' + TYPE_LABELS[tp] + '</option>').join('');
          return '<div class="lista-row">' +
            '<select class="lista-type" onchange="onListaType(\'' + t.id + '\',' + i + ',this.value)">' + opts + '</select>' +
            '<input class="lista-item-text" type="text" value="' + escAttr(item.text || '') + '" placeholder="Texto do item…" ' +
            'oninput="onListaText(\'' + t.id + '\',' + i + ',this)" ' +
            'onkeydown="listaItemKeydown(event,\'' + t.id + '\',' + i + ')">' +
            '<button class="lnk del lista-del" onclick="delListaItem(\'' + t.id + '\',' + i + ')" title="Remover">✕</button></div>';
        }).join('');
        c.innerHTML = head + '<div class="lista-body lista-editor">' + rows +
          '<button class="lnk lista-add" onclick="addListaItem(\'' + t.id + '\')">＋ Item</button></div>';
      } else {
        c.innerHTML = head + '<div class="lista-body">' + (renderListaViewHtml(items) || '<p class="muted-note">Lista vazia — clique em ✏ Editar para adicionar itens.</p>') + '</div>';
      }
    },
    form(p) { return field("Título (opcional)", "title", p.title); }
  },
  tabela: {
    emoji: "📊", name: "Tabela", desc: "Tabela de dados editável — linhas e colunas.",
    w: 6, h: 3, defaults: { title: "Tabela", headers: ["Item", "Valor", "Status"], rows: [["Fase 1", "R$ 5.000", "✓ Concluída"], ["Fase 2", "R$ 8.000", "Em andamento"]] },
    render(t, c) {
      const p = t.props;
      if (!p.headers && p.raw !== undefined) {
        const rr = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(r => r.some(x => x));
        p.headers = rr.length ? rr[0] : ["Item", "Valor", "Status"];
        p.rows = rr.length > 1 ? rr.slice(1) : [];
        delete p.raw; if (canEdit) save();
      }
      const headers = p.headers || ["Item"];
      const rows = p.rows || [];
      if (canEdit) {
        const thead = '<thead><tr><th class="tab-ctrl-col"></th>' +
          headers.map((h, ci) => '<th><div class="tab-th-wrap"><span class="tab-cell-edit" contenteditable="true" spellcheck="false" onblur="tabelaHeaderSave(\'' + t.id + '\',' + ci + ',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' + esc(h) + '</span>' +
            (headers.length > 1 ? '<button class="lnk del tab-del-col" onclick="tabelaDelCol(\'' + t.id + '\',' + ci + ')" title="Remover col">✕</button>' : '') + '</div></th>').join("") +
          '<th class="tab-add-col"><button class="lnk" onclick="tabelaAddCol(\'' + t.id + '\')">＋</button></th></tr></thead>';
        const tbody = '<tbody>' + rows.map((r, ri) =>
          '<tr><td class="tab-ctrl-col">' +
          (ri > 0 ? '<button class="lnk tab-mv" onclick="tabelaMoveRow(\'' + t.id + '\',' + ri + ',-1)">↑</button>' : '<span class="tab-mv-ph"></span>') +
          (ri < rows.length - 1 ? '<button class="lnk tab-mv" onclick="tabelaMoveRow(\'' + t.id + '\',' + ri + ',1)">↓</button>' : '<span class="tab-mv-ph"></span>') +
          '<button class="lnk del tab-del-row" onclick="tabelaDelRow(\'' + t.id + '\',' + ri + ')" title="Remover">✕</button></td>' +
          headers.map((_, ci) => '<td><span class="tab-cell-edit" contenteditable="true" spellcheck="false" onblur="tabelaCellSave(\'' + t.id + '\',' + ri + ',' + ci + ',this)" onkeydown="if(event.key===\'Tab\'){event.preventDefault();tabelaNextCell(event.target,' + ri + ',' + ci + ');}if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' + esc((r[ci] !== undefined ? r[ci] : "")) + '</span></td>').join("") +
          '</tr>').join("") + '</tbody>';
        c.innerHTML = '<div class="w-head"><span class="w-title risk-title-editable" contenteditable="true" spellcheck="false" onblur="tabelaTitleSave(\'' + t.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' + esc(p.title || "Tabela") + '</span>' +
          '<button class="btn sm" onclick="tabelaAddRow(\'' + t.id + '\')">＋ Linha</button></div>' +
          '<div class="w-body"><div class="uso-table-wrap"><table class="data-table tab-edit">' + thead + tbody + '</table></div></div>';
      } else {
        const table = rows.length
          ? '<table class="data-table"><thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join("") + '</tr></thead><tbody>' +
            rows.map(r => '<tr data-item="' + escAttr(itemKey(r[0] || "")) + '" data-itemlabel="' + escAttr(r[0] || "") + '">' + headers.map((_, i) => '<td>' + esc(r[i] || "") + '</td>').join("") + '</tr>').join("") + '</tbody></table>'
          : '<p class="muted-note">Sem dados.</p>';
        c.innerHTML = '<div class="w-head"><span class="w-title">' + esc(p.title || "Tabela") + '</span></div><div class="w-body">' + table + '</div>';
      }
    },
    form(p) { return field("Título", "title", p.title); }
  },
  marcos: {
    emoji: "🗓", name: "Linha do tempo", desc: "Marcos do projeto, manuais ou alimentados pelas Entregas.",
    w: 4, h: 4, defaults: { title: "Cronograma", fonte: "manual", raw: "feito | Briefing | Jan\nfeito | Design | Fev\natual | Desenvolvimento | Mar\nfuturo | Entrega | Abr" },
    render(t, c) {
      const p = t.props;
      const linked = p.fonte && p.fonte !== "manual";
      // Cabeçalho (com selo quando vinculado às Entregas)
      const head = '<div class="w-head"><span class="w-title">' + esc(p.title || "Cronograma") + '</span>' +
        (linked ? '<span class="grow"></span><span class="tl-linked" title="Alimentado pelo widget Entregas do projeto">🔗 Entregas</span>' : '') + '</div>';
      let items;
      if (linked) {
        const found = findTileGlobal(p.fonte);
        // Não vaza Entregas de aba interna para quem não é admin atuante
        const privada = found && found.space && found.space.visibility === "interno" && !actingAdmin();
        if (!found || found.tile.type !== "entregas" || privada) {
          c.innerHTML = head + '<div class="w-body"><p class="muted-note">Fonte de Entregas vinculada não encontrada. Edite o widget para revincular.</p></div>';
          return;
        }
        // Cada entrega vira um marco: concluída → feito; a 1ª pendente → atual; demais → futuro
        let usouAtual = false;
        items = (found.tile.props.items || []).map(e => {
          let status;
          if (e.done) status = "feito";
          else if (!usouAtual) { status = "atual"; usouAtual = true; }
          else status = "futuro";
          const datas = [];
          if (e.previsto) datas.push("Previsto " + e.previsto);
          if (e.realizado) datas.push("Realizado " + e.realizado);
          return { status, titulo: e.nome || "", data: datas.join(" · ") };
        });
      } else {
        const rows = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a.some(x => x));
        const KNOWN = { feito: 1, atual: 1, futuro: 1 };
        items = rows.map(a => {
          if (a[0] && KNOWN[a[0].toLowerCase()]) return { status: a[0].toLowerCase(), titulo: a[1] || "", data: a[2] || "" };
          return { status: "futuro", titulo: a[0] || "", data: a[1] || "" };
        });
      }
      const body = items.map(a =>
        '<div class="tl-item ' + a.status + '" data-item="' + escAttr(itemKey(a.titulo)) + '" data-itemlabel="' + escAttr(a.titulo) + '"><div class="tl-dot"></div><div class="tl-body">' +
        '<div class="tl-title">' + esc(a.titulo) + '</div>' + (a.data ? '<div class="tl-date">' + esc(a.data) + '</div>' : '') + '</div></div>'
      ).join("");
      c.innerHTML = head + '<div class="w-body"><div class="timeline">' + (body || '<p class="muted-note">Sem marcos.</p>') + '</div></div>';
    },
    form(p) {
      const ents = entregaTilesList();
      const fonte = p.fonte || "manual";
      const opts = '<option value="manual"' + (fonte === "manual" ? " selected" : "") + '>✍ Manual (digitar marcos)</option>' +
        ents.map(e => '<option value="' + escAttr(e.id) + '"' + (fonte === e.id ? " selected" : "") + '>📦 ' + esc(e.label) + '</option>').join("");
      const showManual = fonte === "manual";
      return field("Título", "title", p.title) +
        '<label>Fonte dos dados</label>' +
        '<select data-k="fonte" onchange="marcosFonteChange(this)">' + opts + '</select>' +
        '<p class="muted-note" style="font-size:11.5px;margin:6px 0 0;text-transform:none;letter-spacing:0;font-weight:600">' +
        (ents.length ? 'Vinculado a um widget <b>Entregas do projeto</b>: cada entrega vira um marco (título + Previsto · Realizado) e as marcadas como entregues aparecem como concluídas.' :
          'Nenhum widget <b>Entregas do projeto</b> no painel ainda. Adicione um para poder alimentar a linha do tempo automaticamente.') + '</p>' +
        '<div id="marcosManual" style="display:' + (showManual ? 'block' : 'none') + '">' +
        '<label>Marcos</label>' +
        '<p class="muted-note" style="font-size:11.5px;margin:2px 0 6px;text-transform:none;letter-spacing:0;font-weight:600">Um marco por linha: <b>status | nome | data</b>. Status: <b>feito</b>, <b>atual</b> ou <b>futuro</b>.</p>' +
        '<textarea data-k="raw" spellcheck="false" style="min-height:150px;font-family:var(--font-mono);font-size:12.5px;line-height:1.6">' + esc(p.raw) + '</textarea>' +
        '</div>';
    }
  },
  embed: {
    emoji: "🔗", name: "Incorporar", desc: "Incorpora Figma, Sheets, Maps, Calendly via iframe.",
    w: 5, h: 4, defaults: { title: "", url: "" },
    render(t, c) {
      const p = t.props;
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      const url = (p.url || "").trim();
      let body;
      if (!url) body = '<div class="video-empty">🔗 Configure a URL para incorporar ao editar este widget.</div>';
      else if (!/^https?:\/\//i.test(url)) body = '<div class="video-empty">URL inválida — use http(s)://</div>';
      else body = '<div class="video-frame"><iframe src="' + escAttr(url) + '" allow="fullscreen; clipboard-write" allowfullscreen loading="lazy"></iframe></div>';
      c.innerHTML = head + body;
    },
    form(p) {
      return field("Título (opcional)", "title", p.title) +
        field("URL para incorporar", "url", p.url) +
        '<p class="muted-note" style="font-size:11.5px;margin:6px 0 0;text-transform:none;letter-spacing:0;font-weight:600">Use a URL de <b>embed</b> (Figma: Share → Embed; Google Sheets: Publicar na web). Alguns sites bloqueiam incorporação.</p>';
    }
  },
  metricas: {
    emoji: "🔢", name: "Painel de KPIs", desc: "Vários indicadores num só card.",
    w: 5, h: 2, defaults: { title: "Métricas", raw: "Leads | 128\nMRR | R$ 8.400\nNPS | 94%\nChurn | 1,2%" },
    render(t, c) {
      const p = t.props;
      const items = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]);
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      c.innerHTML = head + '<div class="w-body"><div class="metric-grid">' +
        items.map(a => '<div class="metric-cell"><div class="metric-val">' + esc(a[1] || "") + '</div><div class="metric-lbl">' + esc(a[0]) + '</div></div>').join("") +
        '</div></div>';
    },
    form(p) {
      return field("Título", "title", p.title) + '<label>Métricas</label>' +
        '<p class="muted-note" style="font-size:11.5px;margin:2px 0 6px;text-transform:none;letter-spacing:0;font-weight:600">Uma por linha: <b>Rótulo | Valor</b>.</p>' +
        '<textarea data-k="raw" spellcheck="false" style="min-height:130px;font-family:var(--font-mono);font-size:12.5px;line-height:1.6">' + esc(p.raw) + '</textarea>';
    }
  },
  grafico: {
    emoji: "📈", name: "Gráfico", desc: "Gráfico de barras a partir de dados.",
    w: 5, h: 3, defaults: { title: "Vendas por mês", raw: "Jan | 12\nFev | 19\nMar | 8\nAbr | 24\nMai | 17" },
    render(t, c) {
      const p = t.props;
      const rows = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]);
      const nums = rows.map(a => parseFloat((a[1] || "0").replace(",", ".")) || 0);
      const max = Math.max(1, ...nums);
      const head = '<div class="w-head"><span class="w-title">' + esc(p.title || "Gráfico") + '</span></div>';
      c.innerHTML = head + '<div class="w-body"><div class="bchart">' +
        rows.map((a, i) => {
          const pct = Math.round(nums[i] / max * 100);
          return '<div class="bchart-col"><div class="bchart-track"><div class="bchart-bar" style="height:' + pct + '%"></div></div>' +
            '<div class="bchart-val">' + esc(a[1] || "") + '</div><div class="bchart-lbl">' + esc(a[0]) + '</div></div>';
        }).join("") + '</div></div>';
    },
    form(p) {
      return field("Título", "title", p.title) + '<label>Dados</label>' +
        '<p class="muted-note" style="font-size:11.5px;margin:2px 0 6px;text-transform:none;letter-spacing:0;font-weight:600">Uma barra por linha: <b>Rótulo | Número</b>.</p>' +
        '<textarea data-k="raw" spellcheck="false" style="min-height:130px;font-family:var(--font-mono);font-size:12.5px;line-height:1.6">' + esc(p.raw) + '</textarea>';
    }
  },
  semaforo: {
    emoji: "🚦", name: "Status / Saúde", desc: "Indicador de saúde do projeto.",
    w: 3, h: 2, defaults: { title: "Saúde do projeto", status: "verde", texto: "No prazo, tudo certo." },
    render(t, c) {
      const p = t.props;
      const st = ["verde", "amarelo", "vermelho"].includes(p.status) ? p.status : "verde";
      const LABEL = { verde: "No prazo", amarelo: "Atenção", vermelho: "Em risco" };
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      c.innerHTML = head + '<div class="w-body"><div class="status-box ' + st + '"><span class="status-dot"></span>' +
        '<div><div class="status-label">' + LABEL[st] + '</div>' + (p.texto ? '<div class="status-text">' + esc(p.texto) + '</div>' : '') + '</div></div></div>';
    },
    form(p) {
      return field("Título", "title", p.title) +
        '<label>Status</label><select data-k="status">' +
        '<option value="verde"' + (p.status === "verde" ? " selected" : "") + '>🟢 No prazo</option>' +
        '<option value="amarelo"' + (p.status === "amarelo" ? " selected" : "") + '>🟡 Atenção</option>' +
        '<option value="vermelho"' + (p.status === "vermelho" ? " selected" : "") + '>🔴 Em risco</option></select>' +
        '<label>Mensagem</label><textarea data-k="texto">' + esc(p.texto) + '</textarea>';
    }
  },
  countdown: {
    emoji: "⏳", name: "Contador regressivo", hidden: true, desc: "Tempo restante até uma data.",
    w: 3, h: 2, defaults: { title: "Lançamento", alvo: "" },
    render(t, c) {
      const p = t.props;
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      let body;
      if (!p.alvo) body = '<div class="video-empty">Defina a data-alvo ao editar.</div>';
      else {
        const diff = new Date(p.alvo).getTime() - Date.now();
        if (isNaN(diff)) body = '<div class="video-empty">Data inválida.</div>';
        else if (diff <= 0) body = '<div class="cd-box"><div class="cd-done">✓ Chegou!</div></div>';
        else {
          const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
          body = '<div class="cd-box"><span class="cd-n">' + d + '</span><span class="cd-u">dia' + (d === 1 ? "" : "s") + '</span>' +
            '<span class="cd-n">' + h + '</span><span class="cd-u">h</span></div>';
        }
      }
      c.innerHTML = head + body;
    },
    form(p) {
      return field("Título", "title", p.title) +
        '<label>Data e hora alvo</label><input type="datetime-local" data-k="alvo" value="' + escAttr(p.alvo) + '">';
    }
  },
  imagem: {
    emoji: "🖼", name: "Imagem / Galeria", desc: "Uma ou várias imagens por URL.",
    w: 4, h: 4, defaults: { title: "", raw: "" },
    render(t, c) {
      const p = t.props;
      const urls = (p.raw || "").split("\n").map(s => s.trim()).filter(Boolean);
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      let body;
      if (!urls.length) body = '<div class="video-empty">🖼 Adicione URLs de imagem (uma por linha) ao editar.</div>';
      else body = '<div class="img-body"><div class="img-grid' + (urls.length === 1 ? " single" : "") + '">' +
        urls.map(u => '<a href="' + escAttr(u) + '" target="_blank" rel="noopener" class="img-cell"><img src="' + escAttr(u) + '" loading="lazy" alt=""></a>').join("") + '</div></div>';
      c.innerHTML = head + body;
    },
    form(p) {
      return field("Título (opcional)", "title", p.title) + '<label>Imagens</label>' +
        '<p class="muted-note" style="font-size:11.5px;margin:2px 0 6px;text-transform:none;letter-spacing:0;font-weight:600">Uma URL de imagem por linha. Várias = galeria em grade.</p>' +
        '<textarea data-k="raw" spellcheck="false" style="min-height:110px;font-family:var(--font-mono);font-size:12px">' + esc(p.raw) + '</textarea>';
    }
  },
  paleta: {
    emoji: "🎨", name: "Paleta de marca", desc: "Amostras de cores com código.",
    w: 4, h: 2, defaults: { title: "Cores", items: [{nome: "Primária", cor: "#e8a33d"}, {nome: "Fundo", cor: "#0f0f14"}, {nome: "Texto", cor: "#e9eaf0"}, {nome: "Destaque", cor: "#5b8def"}] },
    render(t, c) {
      const p = t.props;
      if (!p.items && p.raw !== undefined) {
        p.items = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]).map(a => ({nome: a[0], cor: a[1] || ""}));
        delete p.raw; if (canEdit) save();
      }
      const items = p.items || [];
      const head = '<div class="w-head"><span class="w-title">' + esc(p.title || "Cores") + '</span>' + (canEdit ? '<button class="btn sm" onclick="palAddRow(\'' + t.id + '\')">＋ Cor</button>' : '') + '</div>';
      c.innerHTML = head + '<div class="w-body"><div class="swatches">' +
        items.map((a, i) => {
          const hexSafe = (a.cor || "").replace(/[^#\w(),.%\s]/g, "");
          const pickerVal = /^#[0-9a-fA-F]{3,8}$/.test(a.cor || "") ? a.cor : "#000000";
          return '<div class="swatch"><div class="swatch-chip" id="swatch-chip-' + t.id + '-' + i + '" style="background:' + escAttr(hexSafe) + '"></div>' +
            '<div class="swatch-info">' +
            (canEdit
              ? '<input class="pal-inp pal-name" value="' + escAttr(a.nome || "") + '" placeholder="Nome" oninput="palUpdate(\'' + t.id + '\',' + i + ',\'nome\',this.value)">' +
                '<div class="pal-cor-row"><input class="pal-inp pal-hex" value="' + escAttr(a.cor || "") + '" placeholder="#hex" oninput="palUpdate(\'' + t.id + '\',' + i + ',\'cor\',this.value)">' +
                '<input type="color" class="pal-picker" value="' + escAttr(pickerVal) + '" oninput="palUpdate(\'' + t.id + '\',' + i + ',\'cor\',this.value)" title="Escolher cor"></div>'
              : '<div class="swatch-name">' + esc(a.nome || "") + '</div><div class="swatch-hex">' + esc(a.cor || "") + '</div>') +
            '</div>' +
            (canEdit ? '<button class="lnk del swatch-del" onclick="palDelRow(\'' + t.id + '\',' + i + ')" title="Remover">✕</button>' : '') +
            '</div>';
        }).join("") + '</div></div>';
    },
    form(p) { return field("Título", "title", p.title); }
  },
  referencias: {
    emoji: "📚", name: "Referências", desc: "Biblioteca de links com título, URL e motivo.",
    w: 5, h: 4, defaults: { title: "Referências", categories: [{nome: "Geral", items: [{titulo: "Exemplo", url: "https://exemplo.com", motivo: "Referência inicial"}]}] },
    render(t, c) {
      const p = t.props;
      if (!p.categories && p.raw !== undefined) {
        p.categories = parseRefColumns(p.raw).map(col => ({
          nome: col.title || "Geral",
          items: (col.links || []).map(l => ({titulo: l.label || l.url || "", url: l.url || "", motivo: ""}))
        }));
        if (!p.categories.length) p.categories = [{nome: "Geral", items: []}];
        delete p.raw; if (canEdit) save();
      }
      const cats = p.categories || [];
      const titleEl = canEdit
        ? '<span class="w-title risk-title-editable" contenteditable="true" spellcheck="false" onblur="refTitleSave(\'' + t.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' + esc(p.title || "Referências") + '</span>'
        : '<span class="w-title">' + esc(p.title || "Referências") + '</span>';
      const head = '<div class="w-head">' + titleEl + (canEdit ? '<button class="btn sm" onclick="refAddCat(\'' + t.id + '\')">＋ Categoria</button>' : '') + '</div>';
      const body = cats.map((cat, ci) => {
        const items = cat.items || [];
        const itemsHtml = items.map((item, ii) =>
          canEdit
            ? '<div class="ref-item ref-item-edit">' +
              '<input class="ref-inp" value="' + escAttr(item.titulo || "") + '" placeholder="Título" oninput="refItemSave(\'' + t.id + '\',' + ci + ',' + ii + ',\'titulo\',this.value)">' +
              '<input class="ref-inp ref-url-inp" value="' + escAttr(item.url || "") + '" placeholder="https://..." oninput="refItemSave(\'' + t.id + '\',' + ci + ',' + ii + ',\'url\',this.value)">' +
              '<input class="ref-inp" value="' + escAttr(item.motivo || "") + '" placeholder="Motivo / descrição" oninput="refItemSave(\'' + t.id + '\',' + ci + ',' + ii + ',\'motivo\',this.value)">' +
              '<button class="lnk del" onclick="refDelItem(\'' + t.id + '\',' + ci + ',' + ii + ')" title="Remover">✕</button></div>'
            : '<div class="ref-item"><a href="' + escAttr(item.url || "#") + '" target="_blank" rel="noopener" class="ref-link">🔗 ' + esc(item.titulo || item.url || "") + '</a>' +
              (item.motivo ? '<div class="ref-motivo">' + esc(item.motivo) + '</div>' : '') + '</div>'
        ).join("");
        return '<div class="ref-cat">' +
          '<div class="ref-cat-head">' +
          (canEdit
            ? '<span class="ref-cat-name" contenteditable="true" spellcheck="false" onblur="refCatSave(\'' + t.id + '\',' + ci + ',this)">' + esc(cat.nome || "") + '</span>' +
              '<button class="lnk" onclick="refAddItem(\'' + t.id + '\',' + ci + ')" title="Adicionar referência">＋</button>' +
              '<button class="lnk del" onclick="refDelCat(\'' + t.id + '\',' + ci + ')" title="Excluir categoria">✕</button>'
            : '<span class="ref-cat-name">' + esc(cat.nome || "") + '</span>') +
          '</div><div class="ref-items">' + (itemsHtml || '<p class="muted-note" style="margin:4px 0;font-size:12px">Nenhuma referência.</p>') + '</div></div>';
      }).join("");
      c.innerHTML = head + '<div class="w-body"><div class="ref-body">' + (body || '<p class="muted-note">Nenhuma categoria.</p>') + '</div></div>';
    },
    form(p) { return field("Título", "title", p.title); }
  },
  banner: {
    emoji: "📣", name: "Banner / Destaque", desc: "Aviso grande e colorido.",
    w: 6, h: 2, defaults: { texto: "Anúncio importante aqui.", cor: "#e8a33d", icone: "📣" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = '<div class="banner-box" style="--bn:' + escAttr(p.cor || "#e8a33d") + '">' +
        (p.icone ? '<span class="banner-ico">' + esc(p.icone) + '</span>' : '') +
        '<div class="banner-text">' + esc(p.texto || "") + '</div></div>';
    },
    form(p) {
      return field("Texto", "texto", p.texto) + field("Ícone (emoji, opcional)", "icone", p.icone) +
        '<label>Cor</label><input type="color" data-k="cor" value="' + escAttr(p.cor || "#e8a33d") + '" style="height:40px;padding:4px">';
    }
  },
  secao: {
    emoji: "🗂", name: "Cabeçalho de seção", noComment: true, desc: "Título divisor para organizar o painel.",
    w: 12, h: 1, defaults: { titulo: "Nova seção", subtitulo: "" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = '<div class="sec-head"><div class="sec-titles"><div class="sec-title">' + esc(p.titulo || "") + '</div>' +
        (p.subtitulo ? '<div class="sec-sub">' + esc(p.subtitulo) + '</div>' : '') + '</div><div class="sec-rule"></div></div>';
    },
    form(p) { return field("Título", "titulo", p.titulo) + field("Subtítulo (opcional)", "subtitulo", p.subtitulo); }
  },
  proxima_reuniao: {
    emoji: "📅", name: "Próxima reunião", desc: "Mostra a próxima reunião agendada — automático.",
    w: 4, h: 2, defaults: { title: "Próxima reunião" },
    render(t, c) {
      const p = t.props;
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      c.innerHTML = head + '<div class="w-body"><p class="muted-note">Carregando…</p></div>';
      loadProximaReuniao(c);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  aprovacoes_pendentes: {
    emoji: "✅", name: "Aprovações pendentes", desc: "Conta e lista o que falta aprovar — automático.",
    w: 4, h: 3, defaults: { title: "Aprovações pendentes" },
    render(t, c) {
      const p = t.props;
      const head = p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '';
      c.innerHTML = head + '<div class="w-body"><p class="muted-note">Carregando…</p></div>';
      loadAprovacoesPendentes(c);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  checklist_projeto: {
    emoji: "✅", name: "Checklist do projeto", desc: "Progresso dos checklists do projeto — automático.",
    w: 4, h: 3, defaults: { title: "Checklists" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = (p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '') + '<div class="w-body"><p class="muted-note">Carregando…</p></div>';
      loadChecklistProjeto(c);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  resumo_projeto: {
    emoji: "📊", name: "Resumo do projeto", desc: "Progresso, status e participantes — automático.",
    w: 4, h: 2, defaults: { title: "Resumo do projeto" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = (p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '') + '<div class="w-body"><p class="muted-note">Carregando…</p></div>';
      loadResumoProjeto(c);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  documentos_projeto: {
    emoji: "📁", name: "Documentos do projeto", desc: "Lista viva dos documentos — automático.",
    w: 4, h: 3, defaults: { title: "Documentos" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = (p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '') + '<div class="w-body"><p class="muted-note">Carregando…</p></div>';
      loadDocumentosProjeto(c);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  atividade_recente: {
    emoji: "🔔", name: "Atividade recente", desc: "Últimas mensagens e uploads — automático.",
    w: 4, h: 3, defaults: { title: "Atividade recente" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = (p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '') + '<div class="w-body"><p class="muted-note">Carregando…</p></div>';
      loadAtividadeRecente(c);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  questionarios_pendentes: {
    emoji: "📝", name: "Questionários pendentes", desc: "O que falta responder — automático.",
    w: 4, h: 3, defaults: { title: "Questionários" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = (p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '') + '<div class="w-body"><p class="muted-note">Carregando…</p></div>';
      loadQuestionariosPendentes(c);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  kanban: {
    emoji: "🗂", name: "Kanban / Quadro", desc: "Colunas e cartões estilo Trello — arraste, edite, detalhe.",
    w: 8, h: 5, defaults: { title: "Quadro", columns: [
      {id: "c1", nome: "A fazer", cards: [{id: "k1", titulo: "Briefing do cliente", desc: "", etiqueta: "", prazo: "", checklist: []}]},
      {id: "c2", nome: "Fazendo", cards: [{id: "k2", titulo: "Desenvolvimento", desc: "", etiqueta: "azul", prazo: "", checklist: []}]},
      {id: "c3", nome: "Feito", cards: [{id: "k3", titulo: "Logo", desc: "", etiqueta: "verde", prazo: "", checklist: []}]}
    ] },
    render(t, c) {
      const p = t.props;
      if (!p.columns && p.raw !== undefined) {
        p.columns = parseKanban(p.raw).map((col, ci) => ({
          id: "c" + (ci + 1) + uid().slice(-3), nome: col.title || "Coluna",
          cards: (col.cards || []).map(card => ({id: uid(), titulo: card, desc: "", etiqueta: "", prazo: "", checklist: []}))
        }));
        delete p.raw; if (canEdit) save();
      }
      const cols = p.columns || [];
      const ETIQ = { vermelho: "#e5534b", laranja: "#e8913d", amarelo: "#d9b13b", verde: "#4caf72", azul: "#5b8def", roxo: "#a472e0" };
      const head = '<div class="w-head"><span class="w-title' + (canEdit ? ' risk-title-editable" contenteditable="true" spellcheck="false" onblur="kanbanTitleSave(\'' + t.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}"' : '"') + '>' + esc(p.title || "Quadro") + '</span>' +
        (canEdit ? '<button class="btn sm" onclick="kanbanAddCol(\'' + t.id + '\')">＋ Coluna</button>' : '') + '</div>';
      const board = cols.map(col => {
        const cards = col.cards || [];
        const cardsHtml = cards.map(card => {
          const done = (card.checklist || []).filter(x => x.done).length;
          const totalChk = (card.checklist || []).length;
          const badges = [];
          if (card.prazo) badges.push('<span class="kb-badge kb-prazo">🕑 ' + esc(card.prazo) + '</span>');
          if (totalChk) badges.push('<span class="kb-badge' + (done === totalChk ? ' done' : '') + '">☑ ' + done + '/' + totalChk + '</span>');
          if (card.desc) badges.push('<span class="kb-badge">≡</span>');
          return '<div class="kb-card"' + (canEdit ? ' draggable="true" ondragstart="kanbanCardDragStart(event,\'' + t.id + '\',\'' + col.id + '\',\'' + card.id + '\')"' : '') +
            ' onclick="kanbanOpenCard(\'' + t.id + '\',\'' + col.id + '\',\'' + card.id + '\')"' +
            ' data-item="' + escAttr(itemKey(card.titulo || "")) + '" data-itemlabel="' + escAttr(card.titulo || "") + '">' +
            (card.etiqueta && ETIQ[card.etiqueta] ? '<span class="kb-etiq" style="background:' + ETIQ[card.etiqueta] + '"></span>' : '') +
            '<span class="kb-card-title">' + esc(card.titulo || "Sem título") + '</span>' +
            (badges.length ? '<div class="kb-badges">' + badges.join("") + '</div>' : '') +
            '</div>';
        }).join("");
        const colHead = canEdit
          ? '<div class="kb-col-head"><span class="kb-col-name" contenteditable="true" spellcheck="false" onblur="kanbanColRename(\'' + t.id + '\',\'' + col.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' + esc(col.nome) + '</span>' +
            '<span class="kb-count">' + cards.length + '</span><button class="lnk del kb-col-del" onclick="kanbanDelCol(\'' + t.id + '\',\'' + col.id + '\')" title="Excluir coluna">✕</button></div>'
          : '<div class="kb-col-head"><span class="kb-col-name">' + esc(col.nome) + '</span><span class="kb-count">' + cards.length + '</span></div>';
        return '<div class="kb-col"' + (canEdit ? ' ondragover="kanbanColDragOver(event)" ondragleave="kanbanColDragLeave(event)" ondrop="kanbanCardDrop(event,\'' + t.id + '\',\'' + col.id + '\')"' : '') + '>' +
          colHead + '<div class="kb-cards">' + cardsHtml + '</div>' +
          (canEdit ? '<button class="kb-add-card" onclick="kanbanAddCard(\'' + t.id + '\',\'' + col.id + '\')">＋ Adicionar card</button>' : '') +
          '</div>';
      }).join("");
      c.innerHTML = head + '<div class="w-body"><div class="kanban">' + board + '</div></div>';
    },
    form(p) { return field("Título", "title", p.title); }
  },
  orcamento: {
    emoji: "💰", name: "Orçamento", desc: "Total e rateio por categoria (imposto, comissão, logística…).",
    w: 4, h: 3, defaults: { title: "Orçamento", moeda: "R$", total: "20000", items: [{cat: "Imposto", valor: "3000"}, {cat: "Comissão", valor: "2000"}, {cat: "Logística", valor: "1500"}] },
    render(t, c) {
      const p = t.props;
      if (!p.items) {
        p.items = [];
        if (p.gasto !== undefined && parseFloat(p.gasto)) p.items.push({cat: "Geral", valor: String(parseFloat(p.gasto) || 0)});
        delete p.gasto; if (canEdit) save();
      }
      const moeda = p.moeda || "R$";
      const total = parseFloat(p.total) || 0;
      const items = p.items || [];
      const alocado = items.reduce((s, it) => s + (parseFloat(it.valor) || 0), 0);
      const resta = total - alocado, over = alocado > total;
      const pct = total ? Math.min(100, Math.round(alocado / total * 100)) : 0;
      const fmt = n => moeda + " " + Math.round(n).toLocaleString("pt-BR");
      const totalEl = canEdit
        ? moeda + ' <input class="orc-total-inp" value="' + escAttr(p.total || "") + '" inputmode="numeric" placeholder="0" oninput="orcSave(\'' + t.id + '\',\'total\',this.value)">'
        : '<span class="orc-total">' + esc(fmt(total)) + '</span>';
      const head = '<div class="w-head"><span class="w-title' + (canEdit ? ' risk-title-editable" contenteditable="true" spellcheck="false" onblur="orcTitleSave(\'' + t.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}"' : '"') + '>' + esc(p.title || "Orçamento") + '</span><span class="grow"></span>' + totalEl + '</div>';
      const bar = '<div class="prog-bar"><i style="width:' + pct + '%' + (over ? ';background:var(--danger)' : '') + '"></i></div>' +
        '<div class="orc-row"><span class="orc-gasto">Alocado ' + esc(fmt(alocado)) + ' · ' + pct + '%</span>' +
        '<span class="orc-resta' + (over ? ' neg' : '') + '">' + (over ? "Excedeu " + esc(fmt(-resta)) : "Livre " + esc(fmt(resta))) + '</span></div>';
      const rows = items.map((it, i) => {
        const v = parseFloat(it.valor) || 0;
        const ipct = total ? Math.round(v / total * 100) : 0;
        if (canEdit) {
          return '<div class="orc-item-edit">' +
            '<input class="orc-cat-inp" value="' + escAttr(it.cat || "") + '" placeholder="Categoria" oninput="orcItemSave(\'' + t.id + '\',' + i + ',\'cat\',this.value)">' +
            '<input class="orc-val-inp" value="' + escAttr(it.valor || "") + '" inputmode="numeric" placeholder="0" oninput="orcItemSave(\'' + t.id + '\',' + i + ',\'valor\',this.value)">' +
            '<button class="lnk del" onclick="orcItemDel(\'' + t.id + '\',' + i + ')" title="Remover">✕</button></div>';
        }
        return '<div class="orc-item"><span class="orc-cat">' + esc(it.cat || "—") + '</span>' +
          '<span class="orc-item-bar"><i style="width:' + Math.min(100, ipct) + '%"></i></span>' +
          '<span class="orc-item-val">' + esc(fmt(v)) + '</span></div>';
      }).join("");
      const addBtn = canEdit ? '<button class="btn sm" onclick="orcItemAdd(\'' + t.id + '\')" style="margin-top:8px">＋ Categoria</button>' : '';
      c.innerHTML = head + '<div class="w-body">' + bar + '<div class="orc-items">' + (rows || '<p class="muted-note" style="font-size:12px">Sem categorias.</p>') + '</div>' + addBtn + '</div>';
    },
    form(p) {
      return field("Título", "title", p.title) + field("Moeda", "moeda", p.moeda || "R$") + field("Orçado (total)", "total", p.total);
    }
  },
  equipe: {
    emoji: "👥", name: "Equipe & responsáveis", desc: "Quem cuida de quê no projeto.",
    w: 4, h: 3, defaults: { title: "Equipe", raw: "Ana Souza | Design\nBruno Lima | Desenvolvimento\nCarla Dias | Gestão" },
    render(t, c) {
      const p = t.props;
      const items = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]);
      c.innerHTML = (p.title ? '<div class="w-head"><span class="w-title">' + esc(p.title) + '</span></div>' : '') +
        '<div class="w-body"><div class="team">' + items.map(a => {
          const nome = a[0], papel = a[1] || "";
          const ini = nome.split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase();
          return '<div class="team-row" data-item="' + escAttr(itemKey(nome)) + '" data-itemlabel="' + escAttr(nome) + '"><div class="team-av">' + esc(ini) + '</div><div class="team-info"><div class="team-name">' + esc(nome) + '</div>' + (papel ? '<div class="team-role">' + esc(papel) + '</div>' : '') + '</div></div>';
        }).join("") + '</div></div>';
    },
    form(p) {
      return field("Título", "title", p.title) + '<label>Pessoas</label>' +
        '<p class="muted-note" style="font-size:11.5px;margin:2px 0 6px;text-transform:none;letter-spacing:0;font-weight:600">Uma por linha: <b>Nome | Responsabilidade</b>.</p>' +
        '<textarea data-k="raw" spellcheck="false" style="min-height:120px;font-family:var(--font-mono);font-size:12.5px;line-height:1.6">' + esc(p.raw) + '</textarea>';
    }
  },
  riscos: {
    emoji: "⚠️", name: "Riscos & bloqueios", desc: "Impedimentos com nível de severidade.",
    w: 4, h: 3, defaults: { title: "Riscos & bloqueios", items: [] },
    render(t, c) {
      const p = t.props;
      // Migração do formato antigo (raw text)
      if (!p.items && p.raw !== undefined) {
        const SEV_V = { alto: 1, medio: 1, baixo: 1 };
        p.items = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]).map(a => {
          if (a[1] !== undefined && SEV_V[(a[0] || "").toLowerCase()]) return { sev: a[0].toLowerCase(), text: a[1] };
          return { sev: "medio", text: a[0] };
        });
        delete p.raw; if (canEdit) save();
      }
      const items = p.items || [];
      const SEV = { alto: "Alto", medio: "Médio", baixo: "Baixo" };
      const rows = items.length === 0
        ? '<p class="muted-note">Nenhum risco. Use ＋ para adicionar.</p>'
        : items.map((it, i) => {
          const sev = it.sev || "medio";
          const isDone = !!it.done;
          if (canEdit) {
            return '<div class="risk-row ' + sev + ' risk-row-edit' + (isDone ? ' done' : '') + '" draggable="true"' +
              ' ondragstart="riscoDragStart(event,\'' + t.id + '\',' + i + ')"' +
              ' ondragover="riscoDragOver(event)" ondrop="riscoDrop(event,\'' + t.id + '\',' + i + ')">' +
              '<span class="risk-grip" title="Arrastar para reordenar">⠿</span>' +
              '<input type="checkbox" class="risk-chk"' + (isDone ? ' checked' : '') + ' onchange="toggleRiscoDone(\'' + t.id + '\',' + i + ')" title="Marcar como concluído">' +
              '<span class="risk-sev risk-sev-btn" onclick="riscoNextSev(\'' + t.id + '\',' + i + ')" title="Clique para alterar nível">' + (SEV[sev] || "Médio") + '</span>' +
              '<textarea class="risk-edit-inp" rows="1" oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\';onRiscoText(\'' + t.id + '\',' + i + ',this)">' + esc(it.text || "") + '</textarea>' +
              '<div class="risk-order-btns">' +
              (i > 0 ? '<button class="lnk risk-mv" onclick="riscoMover(\'' + t.id + '\',' + i + ',-1)" title="Subir">↑</button>' : '<span class="risk-mv-ph"></span>') +
              (i < items.length - 1 ? '<button class="lnk risk-mv" onclick="riscoMover(\'' + t.id + '\',' + i + ',1)" title="Descer">↓</button>' : '<span class="risk-mv-ph"></span>') +
              '</div>' +
              '<button class="lnk del risk-del" onclick="delRisco(\'' + t.id + '\',' + i + ')" title="Remover">✕</button>' +
              '</div>';
          }
          return '<div class="risk-row ' + sev + (isDone ? ' done' : '') + '" data-item="' + escAttr(itemKey(it.text || "")) + '" data-itemlabel="' + escAttr(it.text || "") + '">' +
            '<input type="checkbox" class="risk-chk"' + (isDone ? ' checked' : '') + ' disabled>' +
            '<span class="risk-sev">' + (SEV[sev] || "Médio") + '</span>' +
            '<span class="risk-txt">' + esc(it.text || "") + '</span>' +
            '</div>';
        }).join("");
      const addForm = canEdit
        ? '<div class="risk-add-row" id="risk-add-' + t.id + '">' +
          '<select class="risk-add-sev" id="risk-add-sev-' + t.id + '">' +
          '<option value="baixo">Baixo</option><option value="medio" selected>Médio</option><option value="alto">Alto</option>' +
          '</select>' +
          '<input class="risk-add-input" id="risk-add-txt-' + t.id + '" placeholder="Descreva o risco ou bloqueio…" ' +
          'onkeydown="if(event.key===\'Enter\')saveRisco(\'' + t.id + '\')">' +
          '<button class="btn sm primary" onclick="saveRisco(\'' + t.id + '\')">Adicionar</button>' +
          '</div>' : '';
      const titleEl = canEdit
        ? '<span class="w-title risk-title-editable" contenteditable="true" spellcheck="false" ' +
          'onblur="saveRiscoTitle(\'' + t.id + '\',this)" ' +
          'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' +
          esc(p.title || "Riscos & bloqueios") + '</span>'
        : '<span class="w-title">' + esc(p.title || "Riscos & bloqueios") + '</span>';
      c.innerHTML = '<div class="w-head">' + titleEl +
        (canEdit ? '<button class="btn sm risk-add-btn" id="risk-btn-' + t.id + '" onclick="toggleRiscoForm(\'' + t.id + '\')">＋ Risco</button>' : '') +
        '</div><div class="w-body"><div class="risks">' + rows + '</div>' + addForm + '</div>';
      if (canEdit) requestAnimationFrame(() => {
        c.querySelectorAll('.risk-edit-inp').forEach(ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
      });
    },
    form(p) { return field("Título", "title", p.title); }
  },
  proximos_passos: {
    emoji: "➡️", name: "Próximos passos", desc: "Action items com responsável, prazo e detalhes.",
    w: 4, h: 3, defaults: { title: "Próximos passos", items: [{texto: "Aprovar layout final", responsavel: "Cliente", prazo: "sex", detalhes: "", done: false}] },
    render(t, c) {
      const p = t.props;
      // Migração do formato antigo (raw + done[])
      if (!p.items && p.raw !== undefined) {
        const done = new Set(p.done || []);
        p.items = (p.raw || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]).map(a => ({
          texto: a[0], responsavel: a[1] || "", prazo: "", detalhes: "", done: done.has(itemKey(a[0]))
        }));
        delete p.raw; delete p.done; if (canEdit) save();
      }
      const items = p.items || [];
      const head = '<div class="w-head"><span class="w-title' + (canEdit ? ' risk-title-editable" contenteditable="true" spellcheck="false" onblur="passoTitleSave(\'' + t.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}"' : '"') + '>' + esc(p.title || "Próximos passos") + '</span>' +
        (canEdit ? '<button class="btn sm" onclick="passoAdd(\'' + t.id + '\')">＋ Passo</button>' : '') + '</div>';
      const body = items.length === 0
        ? '<p class="muted-note">Nenhum passo. Use ＋ para adicionar.</p>'
        : items.map((it, i) => {
          if (canEdit) {
            return '<div class="step-row step-edit' + (it.done ? ' done' : '') + '">' +
              '<input type="checkbox" class="step-chk"' + (it.done ? ' checked' : '') + ' onchange="passoToggle(\'' + t.id + '\',' + i + ')">' +
              '<div class="step-fields">' +
              '<input class="step-inp step-main" value="' + escAttr(it.texto || "") + '" placeholder="O que precisa ser feito?" oninput="passoSave(\'' + t.id + '\',' + i + ',\'texto\',this.value)">' +
              '<div class="step-meta-row">' +
              '<input class="step-inp step-sub" value="' + escAttr(it.responsavel || "") + '" placeholder="Responsável" oninput="passoSave(\'' + t.id + '\',' + i + ',\'responsavel\',this.value)">' +
              '<input class="step-inp step-sub" value="' + escAttr(it.prazo || "") + '" placeholder="Pra quando" oninput="passoSave(\'' + t.id + '\',' + i + ',\'prazo\',this.value)">' +
              '</div>' +
              '<textarea class="step-inp step-det" rows="1" placeholder="Detalhes (opcional)" oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\';passoSave(\'' + t.id + '\',' + i + ',\'detalhes\',this.value)">' + esc(it.detalhes || "") + '</textarea>' +
              '</div>' +
              '<button class="lnk del" onclick="passoDel(\'' + t.id + '\',' + i + ')" title="Remover">✕</button>' +
              '</div>';
          }
          const meta = [it.responsavel, it.prazo].filter(Boolean).join(" · ");
          return '<div class="step-row' + (it.done ? " done" : "") + '" data-item="' + escAttr(itemKey(it.texto || "")) + '" data-itemlabel="' + escAttr(it.texto || "") + '">' +
            '<input type="checkbox" class="step-chk"' + (it.done ? " checked" : "") + ' disabled>' +
            '<div class="step-body"><div class="step-txt">' + esc(it.texto || "") + '</div>' +
            (meta ? '<div class="step-meta">' + esc(meta) + '</div>' : '') +
            (it.detalhes ? '<div class="step-det-txt">' + esc(it.detalhes) + '</div>' : '') + '</div></div>';
        }).join("");
      c.innerHTML = head + '<div class="w-body"><div class="steps">' + body + '</div></div>';
      if (canEdit) requestAnimationFrame(() => {
        c.querySelectorAll('.step-det').forEach(ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
      });
    },
    form(p) { return field("Título", "title", p.title); }
  },
  entregas: {
    emoji: "📦", name: "Entregas do projeto", desc: "Entregas do contrato com checkbox, previsto e realizado. Alimenta o medidor do topo.",
    w: 5, h: 4, defaults: { title: "Entregas do projeto", items: [
      {id: "e1", nome: "Identidade visual", desc: "Logo, paleta e manual de marca", done: true, previsto: "10/06", realizado: "08/06"},
      {id: "e2", nome: "Site institucional", desc: "5 páginas responsivas", done: false, previsto: "30/06", realizado: ""}
    ] },
    render(t, c) {
      const p = t.props;
      const items = p.items || [];
      const doneN = items.filter(x => x.done).length;
      const pct = items.length ? Math.round(doneN / items.length * 100) : 0;
      const titleEl = canEdit
        ? '<span class="w-title risk-title-editable" contenteditable="true" spellcheck="false" onblur="entregaTitleSave(\'' + t.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur()}">' + esc(p.title || "Entregas do projeto") + '</span>'
        : '<span class="w-title">' + esc(p.title || "Entregas do projeto") + '</span>';
      const head = '<div class="w-head">' + titleEl + '<span class="grow"></span><span class="entrega-pct">' + doneN + '/' + items.length + ' · ' + pct + '%</span>' +
        (canEdit ? '<button class="btn sm" onclick="entregaAdd(\'' + t.id + '\')">＋ Entrega</button>' : '') + '</div>';
      const body = items.length === 0
        ? '<p class="muted-note">Nenhuma entrega cadastrada. Use ＋ para adicionar.</p>'
        : items.map((it, i) => {
          if (canEdit) {
            return '<div class="entrega-row entrega-edit' + (it.done ? ' done' : '') + '">' +
              '<input type="checkbox" class="entrega-chk"' + (it.done ? ' checked' : '') + ' onchange="entregaToggle(\'' + t.id + '\',' + i + ')" title="Marcar como entregue">' +
              '<div class="entrega-fields">' +
              '<input class="entrega-inp entrega-nome" value="' + escAttr(it.nome || "") + '" placeholder="Nome da entrega" oninput="entregaSave(\'' + t.id + '\',' + i + ',\'nome\',this.value)">' +
              '<textarea class="entrega-inp entrega-desc" rows="1" placeholder="Descrição / escopo" oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\';entregaSave(\'' + t.id + '\',' + i + ',\'desc\',this.value)">' + esc(it.desc || "") + '</textarea>' +
              '<div class="entrega-datas">' +
              '<label class="entrega-data">Previsto <input class="entrega-inp" value="' + escAttr(it.previsto || "") + '" placeholder="dd/mm" oninput="entregaSave(\'' + t.id + '\',' + i + ',\'previsto\',this.value)"></label>' +
              '<label class="entrega-data">Realizado <input class="entrega-inp" value="' + escAttr(it.realizado || "") + '" placeholder="dd/mm" oninput="entregaSave(\'' + t.id + '\',' + i + ',\'realizado\',this.value)"></label>' +
              '</div></div>' +
              '<button class="lnk del" onclick="entregaDel(\'' + t.id + '\',' + i + ')" title="Remover">✕</button>' +
              '</div>';
          }
          const datas = [];
          if (it.previsto) datas.push('Previsto ' + esc(it.previsto));
          if (it.realizado) datas.push('Realizado ' + esc(it.realizado));
          return '<div class="entrega-row' + (it.done ? " done" : "") + '" data-item="' + escAttr(itemKey(it.nome || "")) + '" data-itemlabel="' + escAttr(it.nome || "") + '">' +
            '<input type="checkbox" class="entrega-chk"' + (it.done ? " checked" : "") + ' disabled>' +
            '<div class="entrega-body"><div class="entrega-nome-txt">' + esc(it.nome || "") + '</div>' +
            (it.desc ? '<div class="entrega-desc-txt">' + esc(it.desc) + '</div>' : '') +
            (datas.length ? '<div class="entrega-datas-txt">' + datas.join(" · ") + '</div>' : '') +
            '</div></div>';
        }).join("");
      c.innerHTML = head + '<div class="w-body"><div class="entregas">' + body + '</div></div>';
      if (canEdit) requestAnimationFrame(() => {
        c.querySelectorAll('.entrega-desc').forEach(ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
      });
    },
    form(p) { return field("Título", "title", p.title); }
  },
  mural: {
    emoji: "📌", name: "Mural de ideias", desc: "Post-its colaborativos — você e o cliente adicionam ao vivo.",
    w: 6, h: 4, defaults: { title: "Mural de ideias" },
    render(t, c) {
      const p = t.props;
      c.innerHTML = '<div class="w-head"><span class="w-title">' + esc(p.title || "Mural de ideias") + '</span>' +
        '<span class="grow"></span><button class="btn sm primary" onclick="event.stopPropagation();addMuralNota(\'' + t.id + '\')">＋ Ideia</button></div>' +
        '<div class="w-body"><div class="mural" id="mural-' + t.id + '"><p class="muted-note">Carregando…</p></div></div>';
      loadMural(t.id);
    },
    form(p) { return field("Título", "title", p.title); }
  },
  enquete: {
    emoji: "📊", name: "Enquete / Votação", desc: "Pergunta com opções — todos votam ao vivo.",
    w: 4, h: 3, defaults: { pergunta: "Qual direção você prefere?", opcoes: "Opção A\nOpção B\nOpção C" },
    render(t, c) {
      const p = t.props;
      const opcoes = (p.opcoes || "").split("\n").map(s => s.trim()).filter(Boolean);
      c.innerHTML = '<div class="w-head"><span class="w-title">' + esc(p.pergunta || "Enquete") + '</span></div>' +
        '<div class="w-body"><div class="poll" id="poll-' + t.id + '">' +
        opcoes.map(o => '<button class="poll-opt" data-op="' + escAttr(o) + '" onclick="event.stopPropagation();votarEnquete(\'' + t.id + '\',this.dataset.op)">' +
          '<span class="poll-bar" style="width:0%"></span><span class="poll-label">' + esc(o) + '</span><span class="poll-count"></span></button>').join("") +
        '</div><div class="poll-total" id="polltot-' + t.id + '"></div></div>';
      loadEnquete(t.id);
    },
    form(p) {
      return field("Pergunta", "pergunta", p.pergunta) + '<label>Opções</label>' +
        '<p class="muted-note" style="font-size:11.5px;margin:2px 0 6px;text-transform:none;letter-spacing:0;font-weight:600">Uma opção por linha. Quem vê pode votar e trocar o voto.</p>' +
        '<textarea data-k="opcoes" spellcheck="false" style="min-height:110px;font-size:13px;line-height:1.6">' + esc(p.opcoes) + '</textarea>';
    }
  },
  formulario: {
    emoji: "📋", name: "Formulário / Pesquisa", desc: "Perguntas multimídia; cada pessoa responde; relatório e médias.",
    w: 6, h: 4, defaults: {},
    render(t, c) {
      c.innerHTML = '<div class="w-head"><span class="w-title">Formulário</span></div>' +
        '<div class="w-body"><div class="form-w" id="formw-' + t.id + '"><p class="muted-note">Carregando…</p></div></div>';
      loadFormularioWidget(t.id);
    },
    form() {
      return '<p class="muted-note" style="text-transform:none;letter-spacing:0;font-weight:600;font-size:13px">Use os botões dentro do widget para <b>editar as perguntas</b> e <b>ver as respostas</b>. As perguntas, mídias e respostas ficam salvas no banco (não aqui).</p>';
    }
  }
};
function field(label, k, v) { return '<label>' + esc(label) + '</label><input data-k="' + k + '" value="' + escAttr(v) + '">'; }

/* — Vínculo Linha do tempo ↔ Entregas — */
function findTileGlobal(id) {
  for (const s of (state.spaces || [])) {
    const t = (s.tiles || []).find(x => x.id === id);
    if (t) return { tile: t, space: s };
  }
  return null;
}
function entregaTilesList() {
  const out = [];
  (state.spaces || []).forEach(s => (s.tiles || []).forEach(t => {
    if (t.type === "entregas") out.push({ id: t.id, label: (t.props.title || "Entregas do projeto") + " · " + s.name });
  }));
  return out;
}
function marcosFonteChange(sel) {
  const man = document.getElementById("marcosManual");
  if (man) man.style.display = sel.value === "manual" ? "block" : "none";
}

/* — Helpers dos widgets de mídia — */
function videoEmbedUrl(url) {
  url = (url || "").trim();
  if (!url) return { type: "none" };
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { type: "iframe", url: "https://www.youtube.com/embed/" + m[1] };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { type: "iframe", url: "https://player.vimeo.com/video/" + m[1] };
  m = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
  if (m) return { type: "iframe", url: "https://www.loom.com/embed/" + m[1] };
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) return { type: "video", url };
  return { type: "unknown" };
}
function copyCode(btn) {
  const code = btn.closest(".content").querySelector("code");
  if (!code || !navigator.clipboard) return;
  navigator.clipboard.writeText(code.innerText).then(() => {
    const old = btn.textContent; btn.textContent = "✓";
    setTimeout(() => { btn.textContent = old; }, 1200);
  });
}
function onParaInput(el, id) {
  const t = space().tiles.find(x => x.id === id);
  if (!t) return;
  t.props.html = sanitizeHtml(el.innerHTML);
  t.props.text = el.innerText;
  save(); // não chama route() — preserva o foco/cursor enquanto digita
}
/* Sanitiza HTML do rich text (remove script/eventos) — editores são confiáveis (canEdit) */
function sanitizeHtml(s) {
  const d = document.createElement("div"); d.innerHTML = String(s == null ? "" : s);
  d.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach(n => n.remove());
  d.querySelectorAll("*").forEach(n => {
    [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /javascript:/i.test(a.value))) n.removeAttribute(a.name); });
  });
  return d.innerHTML;
}
/* Barra de formatação rápida do parágrafo (item 7) */
function _showToolbar(el, html) {
  let tb = document.getElementById("paraTb"); if (tb) tb.remove();
  tb = document.createElement("div"); tb.id = "paraTb"; tb.className = "para-tb"; tb.innerHTML = html;
  document.body.appendChild(tb);
  tb.querySelectorAll("button").forEach(b => b.onmousedown = e => {
    e.preventDefault();
    if (b.dataset.cmd) document.execCommand(b.dataset.cmd, false, null);
    else if (b.dataset.fb) document.execCommand("formatBlock", false, b.dataset.fb);
    else if (b.dataset.sz) document.execCommand("fontSize", false, b.dataset.sz);
  });
  const r = el.getBoundingClientRect();
  tb.style.display = "flex";
  tb.style.top = Math.max(8, r.top - 42) + "px";
  tb.style.left = Math.min(r.left, window.innerWidth - 300) + "px";
}
function paraToolbar(el) {
  _showToolbar(el, '<button data-cmd="bold" title="Negrito"><b>B</b></button><button data-cmd="italic" title="Itálico"><i>I</i></button><button data-cmd="underline" title="Sublinhado"><u>U</u></button><span class="ptb-sep"></span><button data-sz="2" title="Menor">A−</button><button data-sz="3" title="Médio">A</button><button data-sz="5" title="Maior">A+</button>');
}
function listaToolbar(el) {
  _showToolbar(el, '<button data-fb="h3" title="Título">T</button><button data-fb="h4" title="Subtítulo">t</button><button data-fb="div" title="Texto normal">¶</button><span class="ptb-sep"></span><button data-cmd="insertUnorderedList" title="Marcadores">•</button><button data-cmd="insertOrderedList" title="Numerada">1.</button><span class="ptb-sep"></span><button data-cmd="bold" title="Negrito"><b>B</b></button><button data-cmd="italic" title="Itálico"><i>I</i></button><button data-cmd="underline" title="Sublinhado"><u>U</u></button>');
}
function hideParaToolbar() { setTimeout(() => { const tb = document.getElementById("paraTb"); if (tb) tb.style.display = "none"; }, 180); }

/* ===== Funções do widget Lista (editor estruturado por linhas) ===== */
function parseListaHtml(html) {
  if (!html) return [];
  const tmp = document.createElement("div"); tmp.innerHTML = html;
  const items = [];
  function walk(node) {
    const tag = node.tagName;
    if (tag === "H3") { items.push({ type: "h3", text: node.textContent.trim() }); }
    else if (tag === "H4") { items.push({ type: "h4", text: node.textContent.trim() }); }
    else if (tag === "UL") { node.querySelectorAll("li").forEach(li => items.push({ type: "bullet", text: li.textContent.trim() })); }
    else if (tag === "OL") { node.querySelectorAll("li").forEach(li => items.push({ type: "num", text: li.textContent.trim() })); }
    else if (tag === "P" || tag === "DIV") { const t = node.textContent.trim(); if (t) items.push({ type: "p", text: t }); }
    else { Array.from(node.children || []).forEach(walk); }
  }
  Array.from(tmp.children).forEach(walk);
  return items;
}
function renderListaViewHtml(items) {
  if (!items || !items.length) return "";
  const out = []; let inUl = false, inOl = false;
  for (const it of items) {
    const tp = it.type || "bullet", txt = esc(it.text || "");
    if (tp === "bullet") {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push("<li>" + txt + "</li>");
    } else if (tp === "num") {
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push("<li>" + txt + "</li>");
    } else {
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (tp === "h3") out.push("<h3>" + txt + "</h3>");
      else if (tp === "h4") out.push("<h4>" + txt + "</h4>");
      else out.push("<p>" + txt + "</p>");
    }
  }
  if (inUl) out.push("</ul>");
  if (inOl) out.push("</ol>");
  return out.join("");
}
function _reRenderLista(tid, t, focusIdx) {
  const content = document.querySelector('.tile[data-id="' + tid + '"] .content');
  if (content) {
    WIDGETS.lista.render(t, content);
    if (focusIdx != null) {
      const inputs = content.querySelectorAll(".lista-item-text");
      const el = inputs[focusIdx] || inputs[inputs.length - 1];
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    }
  }
}
function addListaItem(tid, afterIdx) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.items) t.props.items = [];
  const ref = t.props.items[afterIdx != null ? afterIdx : t.props.items.length - 1];
  const newType = ref ? (["h3", "h4", "p"].includes(ref.type) ? "bullet" : ref.type) : "bullet";
  const at = afterIdx != null ? afterIdx + 1 : t.props.items.length;
  t.props.items.splice(at, 0, { type: newType, text: "" });
  save(); _reRenderLista(tid, t, at);
}
function delListaItem(tid, idx) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.items = (t.props.items || []).filter((_, i) => i !== idx);
  save(); _reRenderLista(tid, t, Math.max(0, idx - 1));
}
function onListaType(tid, idx, type) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (t.props.items && t.props.items[idx]) t.props.items[idx].type = type;
  save(); _reRenderLista(tid, t, idx);
}
function onListaText(tid, idx, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t) return;
  if (!t.props.items) t.props.items = [];
  if (t.props.items[idx]) t.props.items[idx].text = el.value;
  save();
}
function listaItemKeydown(e, tid, idx) {
  if (e.key === "Enter") { e.preventDefault(); addListaItem(tid, idx); }
  else if (e.key === "Backspace" && e.target.value === "") {
    e.preventDefault(); delListaItem(tid, idx);
  }
}

/* ===== Funções do widget Riscos & Bloqueios ===== */
function toggleRiscoForm(tid) {
  const form = document.getElementById("risk-add-" + tid);
  const btn = document.getElementById("risk-btn-" + tid);
  if (!form) return;
  const opening = form.style.display === "none" || !form.style.display;
  // Esconde qualquer outro form aberto primeiro
  document.querySelectorAll(".risk-add-row").forEach(el => { el.style.display = "none"; });
  document.querySelectorAll(".risk-add-btn").forEach(el => el.classList.remove("on"));
  if (opening) {
    form.style.display = "flex";
    if (btn) btn.classList.add("on");
    const inp = document.getElementById("risk-add-txt-" + tid);
    if (inp) { inp.value = ""; inp.focus(); }
  }
}
function saveRisco(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const inp = document.getElementById("risk-add-txt-" + tid);
  const sevEl = document.getElementById("risk-add-sev-" + tid);
  const text = (inp && inp.value.trim()) || "";
  if (!text) { if (inp) inp.focus(); return; }
  const sev = (sevEl && sevEl.value) || "medio";
  if (!t.props.items) t.props.items = [];
  t.props.items.push({ sev, text });
  save();
  const content = document.querySelector('.tile[data-id="' + tid + '"] .content');
  if (content) { WIDGETS.riscos.render(t, content); }
  // Reabre o form para adicionar mais riscos rapidamente
  toggleRiscoForm(tid);
}
function delRisco(tid, idx) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.items = (t.props.items || []).filter((_, i) => i !== idx);
  save();
  const content = document.querySelector('.tile[data-id="' + tid + '"] .content');
  if (content) WIDGETS.riscos.render(t, content);
}
function riscoNextSev(tid, idx) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const items = t.props.items || []; if (!items[idx]) return;
  const cycle = { baixo: "medio", medio: "alto", alto: "baixo" };
  items[idx].sev = cycle[items[idx].sev || "medio"] || "medio";
  save();
  const content = document.querySelector('.tile[data-id="' + tid + '"] .content');
  if (content) WIDGETS.riscos.render(t, content);
}
function riscoMover(tid, idx, dir) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const items = t.props.items || []; const to = idx + dir;
  if (to < 0 || to >= items.length) return;
  [items[idx], items[to]] = [items[to], items[idx]];
  save();
  const content = document.querySelector('.tile[data-id="' + tid + '"] .content');
  if (content) WIDGETS.riscos.render(t, content);
}
function onRiscoText(tid, idx, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const items = t.props.items || []; if (!items[idx]) return;
  items[idx].text = el.value; save();
}
function saveRiscoTitle(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Riscos & bloqueios";
  save();
}
function toggleRiscoDone(tid, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const it = (t.props.items || [])[i]; if (!it) return;
  it.done = !it.done; save(); route();
}

/* ===== Próximos passos widget ===== */
function passoTitleSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Próximos passos"; save();
}
function passoAdd(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.items) t.props.items = [];
  t.props.items.push({texto: "", responsavel: "", prazo: "", detalhes: "", done: false}); save(); recomputeEvolucaoSeAuto(); route();
}
function passoSave(tid, i, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const it = (t.props.items || [])[i]; if (!it) return;
  it[key] = val; save();
}
function passoToggle(tid, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const it = (t.props.items || [])[i]; if (!it) return;
  it.done = !it.done; save(); recomputeEvolucaoSeAuto(); route();
}
function passoDel(tid, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.items = (t.props.items || []).filter((_, idx) => idx !== i); save(); recomputeEvolucaoSeAuto(); route();
}

/* ===== Orçamento widget ===== */
function orcTitleSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Orçamento"; save();
}
function orcRefreshBar(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t) return;
  const tile = document.querySelector('.tile[data-id="' + tid + '"]'); if (!tile) return;
  const moeda = t.props.moeda || "R$";
  const total = parseFloat(t.props.total) || 0;
  const alocado = (t.props.items || []).reduce((s, it) => s + (parseFloat(it.valor) || 0), 0);
  const resta = total - alocado, over = alocado > total;
  const pct = total ? Math.min(100, Math.round(alocado / total * 100)) : 0;
  const fmt = n => moeda + " " + Math.round(n).toLocaleString("pt-BR");
  const bar = tile.querySelector(".prog-bar i");
  if (bar) { bar.style.width = pct + "%"; bar.style.background = over ? "var(--danger)" : ""; }
  const g = tile.querySelector(".orc-gasto"); if (g) g.textContent = "Alocado " + fmt(alocado) + " · " + pct + "%";
  const r = tile.querySelector(".orc-resta");
  if (r) { r.textContent = over ? "Excedeu " + fmt(-resta) : "Livre " + fmt(resta); r.classList.toggle("neg", over); }
}
function orcSave(tid, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props[key] = val; save(); orcRefreshBar(tid);
}
function orcItemAdd(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.items) t.props.items = [];
  t.props.items.push({cat: "", valor: ""}); save(); route();
}
function orcItemSave(tid, i, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const it = (t.props.items || [])[i]; if (!it) return;
  it[key] = val; save();
  if (key === "valor") orcRefreshBar(tid);
}
function orcItemDel(tid, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.items = (t.props.items || []).filter((_, idx) => idx !== i); save(); route();
}

/* ===== Kanban widget ===== */
let _kbDrag = null;
function _kbCol(t, colId) { return (t.props.columns || []).find(c => c.id === colId); }
function _kbCard(t, colId, cardId) { const col = _kbCol(t, colId); return col ? (col.cards || []).find(c => c.id === cardId) : null; }
function kanbanTitleSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Quadro"; save();
}
function kanbanAddCol(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.columns) t.props.columns = [];
  t.props.columns.push({id: uid(), nome: "Nova coluna", cards: []}); save(); recomputeEvolucaoSeAuto(); route();
}
function kanbanColRename(tid, colId, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const col = _kbCol(t, colId); if (!col) return;
  col.nome = el.textContent.trim() || "Coluna"; save(); recomputeEvolucaoSeAuto();
}
function kanbanDelCol(tid, colId) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const col = _kbCol(t, colId); if (!col) return;
  if ((col.cards || []).length && !confirm('Excluir a coluna "' + col.nome + '" e seus ' + col.cards.length + ' card(s)?')) return;
  t.props.columns = (t.props.columns || []).filter(c => c.id !== colId); save(); recomputeEvolucaoSeAuto(); route();
}
function kanbanAddCard(tid, colId) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const col = _kbCol(t, colId); if (!col) return;
  if (!col.cards) col.cards = [];
  const card = {id: uid(), titulo: "", desc: "", etiqueta: "", prazo: "", checklist: []};
  col.cards.push(card); save(); recomputeEvolucaoSeAuto(); route();
  kanbanOpenCard(tid, colId, card.id);
}
function kanbanCardDragStart(e, tid, colId, cardId) {
  _kbDrag = { tid, colId, cardId };
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", cardId); } catch (_) { }
}
function kanbanColDragOver(e) { e.preventDefault(); e.currentTarget.classList.add("kb-col-over"); }
function kanbanColDragLeave(e) { e.currentTarget.classList.remove("kb-col-over"); }
function kanbanCardDrop(e, tid, destColId) {
  e.preventDefault(); e.currentTarget.classList.remove("kb-col-over");
  if (!_kbDrag || _kbDrag.tid !== tid) return;
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const srcCol = _kbCol(t, _kbDrag.colId), destCol = _kbCol(t, destColId);
  if (!srcCol || !destCol) return;
  const idx = (srcCol.cards || []).findIndex(c => c.id === _kbDrag.cardId);
  if (idx < 0) return;
  const [card] = srcCol.cards.splice(idx, 1);
  if (!destCol.cards) destCol.cards = [];
  destCol.cards.push(card);
  _kbDrag = null; save(); recomputeEvolucaoSeAuto(); route();
}
function kanbanOpenCard(tid, colId, cardId) {
  openModal(kanbanCardModalHtml(tid, colId, cardId), m => kanbanWireCardModal(m, tid, colId, cardId));
}
function kanbanCardModalHtml(tid, colId, cardId) {
  const t = space().tiles.find(x => x.id === tid); if (!t) return "<p>Card não encontrado.</p>";
  const card = _kbCard(t, colId, cardId); if (!card) return "<p>Card não encontrado.</p>";
  const ETIQS = [["", "Nenhuma"], ["vermelho", "Vermelho"], ["laranja", "Laranja"], ["amarelo", "Amarelo"], ["verde", "Verde"], ["azul", "Azul"], ["roxo", "Roxo"]];
  const ro = !canEdit;
  const chk = card.checklist || [];
  const doneN = chk.filter(x => x.done).length;
  const chkPct = chk.length ? Math.round(doneN / chk.length * 100) : 0;
  const chkHtml = chk.map((x, i) =>
    '<div class="kbm-chk-row">' +
    '<input type="checkbox" ' + (x.done ? "checked" : "") + (ro ? " disabled" : "") + ' onchange="kanbanChkToggle(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\',' + i + ')">' +
    (ro ? '<span class="' + (x.done ? "kbm-chk-done" : "") + '">' + esc(x.txt || "") + '</span>'
        : '<input class="kbm-chk-inp" value="' + escAttr(x.txt || "") + '" oninput="kanbanChkText(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\',' + i + ',this.value)">' +
          '<button class="lnk del" onclick="kanbanChkDel(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\',' + i + ')">✕</button>') +
    '</div>'
  ).join("");
  return '<div class="kbm">' +
    '<div class="kbm-head"><h3>' + (ro ? esc(card.titulo || "Card") : '<input class="kbm-title" value="' + escAttr(card.titulo || "") + '" placeholder="Título do card" oninput="kanbanCardSave(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\',\'titulo\',this.value)">') + '</h3>' +
    '<button class="modal-x" onclick="closeModal()">✕</button></div>' +
    '<div class="kbm-grid">' +
    '<label>Etiqueta</label>' +
    (ro ? '<div>' + esc((card.etiqueta || "—")) + '</div>'
        : '<div class="kbm-etiqs">' + ETIQS.map(([v, lbl]) => '<button class="kbm-etiq-btn ' + (v || "none") + (card.etiqueta === v ? " on" : "") + '" title="' + lbl + '" onclick="kanbanCardSave(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\',\'etiqueta\',\'' + v + '\');kanbanReopenCard(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\')"></button>').join("") + '</div>') +
    '<label>Prazo</label>' +
    (ro ? '<div>' + esc(card.prazo || "—") + '</div>'
        : '<input class="kbm-inp" value="' + escAttr(card.prazo || "") + '" placeholder="Ex.: 30/06 ou Sexta" oninput="kanbanCardSave(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\',\'prazo\',this.value)">') +
    '<label>Descrição</label>' +
    (ro ? '<div class="kbm-desc-ro">' + esc(card.desc || "—") + '</div>'
        : '<textarea class="kbm-inp kbm-desc" placeholder="Detalhes, contexto, links…" oninput="kanbanCardSave(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\',\'desc\',this.value)">' + esc(card.desc || "") + '</textarea>') +
    '<label>Checklist ' + (chk.length ? '· ' + chkPct + '%' : '') + '</label>' +
    '<div class="kbm-chk">' +
    (chk.length ? '<div class="kbm-chk-bar"><i style="width:' + chkPct + '%"></i></div>' : '') +
    chkHtml +
    (ro ? '' : '<button class="btn sm" onclick="kanbanChkAdd(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\')">＋ Item</button>') +
    '</div>' +
    '</div>' +
    (ro ? '' : '<div class="kbm-foot"><button class="btn sm del-btn" onclick="kanbanCardDel(\'' + tid + '\',\'' + colId + '\',\'' + cardId + '\')">🗑 Excluir card</button></div>') +
    '</div>';
}
function kanbanWireCardModal(m, tid, colId, cardId) {
  const ta = m.querySelector(".kbm-desc");
  if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; }
}
function kanbanReopenCard(tid, colId, cardId) {
  // re-render modal preservando estado (usado por trocas que mudam layout, ex.: etiqueta)
  const m = $("#modal"); if (!m) return;
  m.innerHTML = kanbanCardModalHtml(tid, colId, cardId);
  kanbanWireCardModal(m, tid, colId, cardId);
}
function kanbanCardSave(tid, colId, cardId, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const card = _kbCard(t, colId, cardId); if (!card) return;
  card[key] = val; save();
  if (key === "titulo" || key === "prazo") route();
}
function kanbanCardDel(tid, colId, cardId) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const col = _kbCol(t, colId); if (!col) return;
  col.cards = (col.cards || []).filter(c => c.id !== cardId); save(); recomputeEvolucaoSeAuto(); closeModal(); route();
}
function kanbanChkAdd(tid, colId, cardId) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const card = _kbCard(t, colId, cardId); if (!card) return;
  if (!card.checklist) card.checklist = [];
  card.checklist.push({txt: "", done: false}); save(); kanbanReopenCard(tid, colId, cardId); route();
}
function kanbanChkToggle(tid, colId, cardId, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const card = _kbCard(t, colId, cardId); if (!card || !card.checklist[i]) return;
  card.checklist[i].done = !card.checklist[i].done; save(); kanbanReopenCard(tid, colId, cardId); route();
}
function kanbanChkText(tid, colId, cardId, i, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const card = _kbCard(t, colId, cardId); if (!card || !card.checklist[i]) return;
  card.checklist[i].txt = val; save();
}
function kanbanChkDel(tid, colId, cardId, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const card = _kbCard(t, colId, cardId); if (!card) return;
  card.checklist = (card.checklist || []).filter((_, idx) => idx !== i); save(); kanbanReopenCard(tid, colId, cardId); route();
}

/* ===== Entregas do projeto widget ===== */
function entregaTitleSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Entregas do projeto"; save();
}
function entregaAdd(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.items) t.props.items = [];
  t.props.items.push({id: uid(), nome: "", desc: "", done: false, previsto: "", realizado: ""}); save(); route();
}
function entregaSave(tid, i, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const it = (t.props.items || [])[i]; if (!it) return;
  it[key] = val; save();
  if (key === "nome") updateEntregasMeter();
}
function entregaToggle(tid, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const it = (t.props.items || [])[i]; if (!it) return;
  it.done = !it.done; save(); route();
}
function entregaDel(tid, i) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.items = (t.props.items || []).filter((_, idx) => idx !== i); save(); route();
}

/* ===== Medidor de Entregas no topo ===== */
function collectEntregas() {
  // Agrega todas as entregas dos widgets "entregas" do painel atualmente visível
  const out = [];
  visibleSpaces().forEach(sp => (sp.tiles || []).forEach(t => {
    if (t.type === "entregas") (t.props.items || []).forEach(it => out.push(it));
  }));
  return out;
}
function updateEntregasMeter() {
  const el = $("#entregasMeter"); if (!el) return;
  const all = collectEntregas();
  const inPainel = (typeof view !== "undefined" ? view : "") === "painel";
  if (!inPainel || all.length === 0) { el.style.display = "none"; el.innerHTML = ""; return; }
  const doneN = all.filter(x => x.done).length;
  const pct = Math.round(doneN / all.length * 100);
  const R = 13, C = 2 * Math.PI * R, off = C * (1 - pct / 100);
  el.style.display = "";
  el.title = "Entregas concluídas: " + doneN + " de " + all.length + " (" + pct + "%) — clique para ver todas";
  el.innerHTML = '<svg class="evo-ring" viewBox="0 0 32 32" width="30" height="30">' +
    '<circle cx="16" cy="16" r="' + R + '" class="evo-bg"></circle>' +
    '<circle cx="16" cy="16" r="' + R + '" class="evo-fg" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle></svg>' +
    '<div class="evo-meta"><span class="evo-lbl">Entregas</span><span class="evo-val">' + pct + '%</span></div>';
  el.onclick = abrirEntregasResumo;
}
function abrirEntregasResumo() {
  const groups = [];
  visibleSpaces().forEach(sp => (sp.tiles || []).forEach(t => {
    if (t.type === "entregas") {
      const items = t.props.items || [];
      if (items.length) groups.push({ titulo: t.props.title || "Entregas", items });
    }
  }));
  const all = groups.flatMap(g => g.items);
  const doneN = all.filter(x => x.done).length;
  const pct = all.length ? Math.round(doneN / all.length * 100) : 0;
  const body = groups.map(g =>
    '<div class="ent-resumo-grp"><h4>' + esc(g.titulo) + '</h4>' +
    g.items.map(it =>
      '<div class="ent-resumo-row' + (it.done ? " done" : "") + '">' +
      '<span class="ent-resumo-chk">' + (it.done ? "✅" : "⬜") + '</span>' +
      '<span class="ent-resumo-nome">' + esc(it.nome || "—") + '</span>' +
      '<span class="ent-resumo-datas">' +
      (it.previsto ? 'Previsto ' + esc(it.previsto) : '') +
      (it.realizado && it.realizado !== "✓" ? (it.previsto ? ' · ' : '') + 'Realizado ' + esc(it.realizado) : '') +
      '</span></div>'
    ).join("") + '</div>'
  ).join("") || '<p class="muted-note">Nenhuma entrega cadastrada.</p>';
  openModal('<div class="kbm-head"><h3>Entregas do projeto · ' + pct + '%</h3><button class="modal-x" onclick="closeModal()">✕</button></div>' +
    '<div class="prog-bar" style="margin:0 0 14px"><i style="width:' + pct + '%"></i></div>' +
    '<div class="ent-resumo">' + body + '</div>');
}

/* ===== Links widget ===== */
function linkAdd(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.items) t.props.items = [];
  t.props.items.push({label: "Novo link", url: "", desc: ""}); save(); route();
}
function linkUpdate(tid, idx, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const items = t.props.items || []; if (!items[idx]) return;
  items[idx][key] = val; save();
}
function linkDel(tid, idx) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.items = (t.props.items || []).filter((_, i) => i !== idx); save(); route();
}

/* ===== Code widget ===== */
function copyCode(btn) {
  const next = btn.closest(".w-head").nextElementSibling;
  const text = next ? (next.querySelector("code") ? next.querySelector("code").textContent : next.querySelector("textarea") ? next.querySelector("textarea").value : "") : "";
  navigator.clipboard.writeText(text).then(() => toast("Copiado!")).catch(() => toast("Erro ao copiar."));
}
function codeTitleSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Código"; save();
}
function codeLangChange(tid, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.lang = val; save();
}
function codeContentSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.code = el.value; save();
}

/* ===== Paleta widget ===== */
function palAddRow(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.items) t.props.items = [];
  t.props.items.push({nome: "Nova cor", cor: "#000000"}); save(); route();
}
function palUpdate(tid, idx, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const items = t.props.items || []; if (!items[idx]) return;
  items[idx][key] = val;
  if (key === "cor") {
    const chip = document.getElementById("swatch-chip-" + tid + "-" + idx);
    if (chip) chip.style.background = val;
    const wrap = chip && chip.closest(".swatch");
    const hexInp = wrap && wrap.querySelector(".pal-hex");
    if (hexInp && hexInp !== document.activeElement) hexInp.value = val;
    const picker = wrap && wrap.querySelector(".pal-picker");
    if (picker && picker !== document.activeElement && /^#[0-9a-fA-F]{6}$/.test(val)) picker.value = val;
  }
  save();
}
function palDelRow(tid, idx) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.items = (t.props.items || []).filter((_, i) => i !== idx); save(); route();
}

/* ===== Tabela widget ===== */
function tabelaTitleSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Tabela"; save();
}
function tabelaHeaderSave(tid, ci, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const headers = t.props.headers || []; headers[ci] = el.textContent.trim(); save();
}
function tabelaCellSave(tid, ri, ci, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const rows = t.props.rows || []; if (!rows[ri]) return;
  while (rows[ri].length <= ci) rows[ri].push("");
  rows[ri][ci] = el.textContent; save();
}
function tabelaAddRow(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const cols = (t.props.headers || []).length || 1;
  if (!t.props.rows) t.props.rows = [];
  t.props.rows.push(Array(cols).fill("")); save(); route();
}
function tabelaDelRow(tid, ri) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.rows = (t.props.rows || []).filter((_, i) => i !== ri); save(); route();
}
function tabelaMoveRow(tid, ri, dir) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const rows = t.props.rows || []; const ni = ri + dir;
  if (ni < 0 || ni >= rows.length) return;
  [rows[ri], rows[ni]] = [rows[ni], rows[ri]]; save(); route();
}
function tabelaAddCol(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.headers = [...(t.props.headers || []), "Nova coluna"];
  t.props.rows = (t.props.rows || []).map(r => [...r, ""]); save(); route();
}
function tabelaDelCol(tid, ci) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.headers = (t.props.headers || []).filter((_, i) => i !== ci);
  t.props.rows = (t.props.rows || []).map(r => r.filter((_, i) => i !== ci)); save(); route();
}
function tabelaNextCell(el, ri, ci) {
  const table = el.closest("table");
  if (!table) return;
  const cells = Array.from(table.querySelectorAll(".tab-cell-edit"));
  const idx = cells.indexOf(el);
  if (idx >= 0 && idx < cells.length - 1) { cells[idx + 1].focus(); }
}

/* ===== Referências widget ===== */
function refTitleSave(tid, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.title = el.textContent.trim() || "Referências"; save();
}
function refAddCat(tid) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  if (!t.props.categories) t.props.categories = [];
  t.props.categories.push({nome: "Nova categoria", items: []}); save(); route();
}
function refDelCat(tid, ci) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  t.props.categories = (t.props.categories || []).filter((_, i) => i !== ci); save(); route();
}
function refCatSave(tid, ci, el) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const cats = t.props.categories || []; if (!cats[ci]) return;
  cats[ci].nome = el.textContent.trim(); save();
}
function refAddItem(tid, ci) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const cats = t.props.categories || []; if (!cats[ci]) return;
  if (!cats[ci].items) cats[ci].items = [];
  cats[ci].items.push({titulo: "", url: "", motivo: ""}); save(); route();
}
function refDelItem(tid, ci, ii) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const cats = t.props.categories || []; if (!cats[ci]) return;
  cats[ci].items = (cats[ci].items || []).filter((_, i) => i !== ii); save(); route();
}
function refItemSave(tid, ci, ii, key, val) {
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const cats = t.props.categories || []; if (!cats[ci] || !cats[ci].items[ii]) return;
  cats[ci].items[ii][key] = val; save();
}

/* ===== Canvas pan + seleção múltipla ===== */
let _selectedTiles = new Set();
function setupCanvasPan() {
  const cw = document.querySelector(".canvas-wrap");
  if (!cw || cw._panReady) return;
  cw._panReady = true;
  cw.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    if (!e.target.closest(".tile")) {
      _selectedTiles.clear();
      document.querySelectorAll("#canvas .tile.selected").forEach(el => el.classList.remove("selected"));
    }
    if (e.target.closest(".tile,.tbar,.tgrip,.thandle,.space-tab,.space-tabs")) return;
    if (editMode) {
      startSelectionRect(e);
      return;
    }
    e.preventDefault();
    const startX = e.clientX + window.scrollX;
    const startY = e.clientY + window.scrollY;
    cw.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const mv = ev => window.scrollTo(startX - ev.clientX, startY - ev.clientY);
    const up = () => {
      document.removeEventListener("pointermove", mv);
      document.removeEventListener("pointerup", up);
      cw.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", up);
  });
  if (!editMode) cw.style.cursor = "grab";
}
function startSelectionRect(e) {
  e.preventDefault();
  const cvs = document.getElementById("canvas");
  if (!cvs) return;
  const cvsRect = cvs.getBoundingClientRect();
  const x0 = e.clientX - cvsRect.left;
  const y0 = e.clientY - cvsRect.top + window.scrollY;
  const sel = document.createElement("div"); sel.className = "canvas-sel-rect";
  sel.style.cssText = "left:" + x0 + "px;top:" + (e.clientY - cvsRect.top) + "px;width:0;height:0";
  cvs.style.position = "relative"; cvs.appendChild(sel);
  const mv = ev => {
    const x1 = ev.clientX - cvsRect.left;
    const y1 = ev.clientY - cvsRect.top;
    sel.style.left = Math.min(x0, x1) + "px";
    sel.style.top = Math.min(e.clientY - cvsRect.top, y1) + "px";
    sel.style.width = Math.abs(x1 - x0) + "px";
    sel.style.height = Math.abs(y1 - (e.clientY - cvsRect.top)) + "px";
  };
  const up = () => {
    document.removeEventListener("pointermove", mv);
    document.removeEventListener("pointerup", up);
    const selRect = sel.getBoundingClientRect();
    sel.remove();
    _selectedTiles.clear();
    document.querySelectorAll("#canvas .tile").forEach(tile => {
      const tr = tile.getBoundingClientRect();
      const overlaps = tr.left < selRect.right && tr.right > selRect.left && tr.top < selRect.bottom && tr.bottom > selRect.top;
      tile.classList.toggle("selected", overlaps);
      if (overlaps) _selectedTiles.add(tile.dataset.id);
    });
  };
  document.addEventListener("pointermove", mv);
  document.addEventListener("pointerup", up);
}
let _riscoDragFrom = null;
function riscoDragStart(event, tid, idx) { _riscoDragFrom = { tid, idx }; event.dataTransfer.effectAllowed = "move"; }
function riscoDragOver(event) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }
function riscoDrop(event, tid, dropIdx) {
  event.preventDefault();
  if (!_riscoDragFrom || _riscoDragFrom.tid !== tid) { _riscoDragFrom = null; return; }
  const fromIdx = _riscoDragFrom.idx; _riscoDragFrom = null;
  if (fromIdx === dropIdx) return;
  const t = space().tiles.find(x => x.id === tid); if (!t || !canEdit) return;
  const items = t.props.items || [];
  const item = items.splice(fromIdx, 1)[0];
  items.splice(dropIdx, 0, item);
  save();
  const content = document.querySelector('.tile[data-id="' + tid + '"] .content');
  if (content) WIDGETS.riscos.render(t, content);
}

function parseRefColumns(raw) {
  const cols = [];
  let cur = null;
  (raw || "").split("\n").forEach(line => {
    const s = line.trim();
    if (!s) return;
    if (s.startsWith("##")) { cur = { title: s.replace(/^##\s*/, ""), links: [] }; cols.push(cur); }
    else {
      if (!cur) { cur = { title: "", links: [] }; cols.push(cur); }
      const parts = s.split("|").map(x => x.trim());
      cur.links.push({ label: parts[0], url: parts[1] || "#" });
    }
  });
  return cols;
}

function parseKanban(raw) {
  const cols = []; let cur = null;
  (raw || "").split("\n").forEach(line => {
    const s = line.trim(); if (!s) return;
    if (s.startsWith("##")) { cur = { title: s.replace(/^##\s*/, ""), cards: [] }; cols.push(cur); }
    else { if (!cur) { cur = { title: "", cards: [] }; cols.push(cur); } cur.cards.push(s); }
  });
  return cols;
}
function fmtRel(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return "há " + min + " min";
  const h = Math.floor(min / 60);
  if (h < 24) return "há " + h + "h";
  const d = Math.floor(h / 24);
  if (d < 30) return "há " + d + " dia" + (d === 1 ? "" : "s");
  return fmtDt(iso);
}

/* — Loaders dos widgets dinâmicos (puxam dados reais do projeto) — */
async function loadProximaReuniao(c) {
  if (!curProjeto) return;
  const nowIso = new Date().toISOString();
  const { data } = await sb.from("reunioes").select("titulo,data_hora,duracao_min,local_ou_link")
    .eq("projeto_id", curProjeto.id).eq("status", "agendada").gte("data_hora", nowIso)
    .order("data_hora").limit(1);
  const body = c.querySelector(".w-body");
  if (!body) return;
  const r = data && data[0];
  if (!r) { body.innerHTML = '<p class="muted-note">Nenhuma reunião agendada.</p>'; return; }
  body.innerHTML = '<div class="next-reu"><div class="next-reu-title">' + esc(r.titulo) + '</div>' +
    '<div class="next-reu-when">📅 ' + fmtDt(r.data_hora) + ' · ' + r.duracao_min + ' min</div>' +
    (r.local_ou_link ? '<div class="next-reu-local">' + (r.local_ou_link.startsWith("http")
      ? '<a href="' + escAttr(r.local_ou_link) + '" target="_blank" rel="noopener" class="lnk">🔗 Entrar</a>'
      : '📍 ' + esc(r.local_ou_link)) + '</div>' : '') + '</div>';
}

async function loadAprovacoesPendentes(c) {
  if (!curProjeto) return;
  const { data } = await sb.from("aprovacoes").select("titulo")
    .eq("projeto_id", curProjeto.id).eq("status", "pendente")
    .order("created_at", { ascending: false });
  const body = c.querySelector(".w-body");
  if (!body) return;
  const list = data || [];
  if (!list.length) { body.innerHTML = '<div class="ap-pend-empty">✓ Tudo aprovado</div>'; return; }
  body.innerHTML = '<div class="ap-pend"><span class="ap-pend-count">' + list.length + '</span>' +
    '<span class="ap-pend-lbl">pendente' + (list.length === 1 ? "" : "s") + '</span></div>' +
    '<div class="ap-pend-list">' + list.slice(0, 5).map(a => '<div class="ap-pend-item">⏳ ' + esc(a.titulo) + '</div>').join("") +
    (list.length > 5 ? '<div class="muted-note" style="font-size:12px">+' + (list.length - 5) + ' mais…</div>' : '') + '</div>';
}

/* — Mural de ideias (widget colaborativo, dados em mural_notas) — */
async function loadMural(widgetId) {
  if (!curProjeto) return;
  const { data } = await sb.from("mural_notas")
    .select("id, texto, cor, autor_id, autor:pessoas!autor_id(nome,email)")
    .eq("widget_id", widgetId).order("created_at");
  const box = document.getElementById("mural-" + widgetId);
  if (!box) return;
  const notas = data || [];
  if (!notas.length) { box.innerHTML = '<p class="muted-note">Sem ideias ainda. Clique em ＋ Ideia para começar.</p>'; return; }
  box.innerHTML = notas.map(n => {
    const who = (n.autor && (n.autor.nome || n.autor.email)) || "—";
    const canDel = n.autor_id === me.id || isAdmin || canEdit;
    return '<div class="mnota" style="--mc:' + escAttr(n.cor || "#e8a33d") + '">' +
      '<div class="mnota-txt">' + esc(n.texto) + '</div>' +
      '<div class="mnota-foot"><span class="mnota-who">' + esc(who) + '</span>' +
      (canDel ? '<button class="lnk del" onclick="event.stopPropagation();delMuralNota(\'' + n.id + '\',\'' + widgetId + '\')">✕</button>' : '') +
      '</div></div>';
  }).join("");
}
function addMuralNota(widgetId) {
  const cores = ["#e8a33d", "#5b8def", "#3fa873", "#e0604a", "#b57edc"];
  openModal('<h3>Nova ideia</h3>' +
    '<label>Texto</label><textarea data-k="texto" style="min-height:80px" placeholder="Escreva a ideia…"></textarea>' +
    '<label>Cor</label><div class="cor-pick">' + cores.map((c, i) => '<button type="button" class="cor-opt' + (i === 0 ? " on" : "") + '" data-cor="' + c + '" style="background:' + c + '"></button>').join("") + '</div>' +
    actions("Adicionar"),
    m => {
      let cor = cores[0];
      m.querySelectorAll(".cor-opt").forEach(b => b.onclick = () => { cor = b.dataset.cor; m.querySelectorAll(".cor-opt").forEach(x => x.classList.toggle("on", x === b)); });
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const texto = m.querySelector('[data-k="texto"]').value.trim();
        if (!texto) { toast("Escreva algo."); return; }
        const { error } = await sb.from("mural_notas").insert({ projeto_id: curProjeto.id, widget_id: widgetId, autor_id: me.id, texto, cor });
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); loadMural(widgetId);
      };
    });
}
async function delMuralNota(id, widgetId) {
  if (!(await confirmDialog("Excluir esta ideia?"))) return;
  await sb.from("mural_notas").delete().eq("id", id);
  loadMural(widgetId);
}

/* — Enquete / votação (widget colaborativo, dados em enquete_votos) — */
async function loadEnquete(widgetId) {
  if (!curProjeto) return;
  const { data } = await sb.from("enquete_votos").select("opcao, pessoa_id").eq("widget_id", widgetId);
  const poll = document.getElementById("poll-" + widgetId); if (!poll) return;
  const votos = data || [], total = votos.length;
  const counts = {}; votos.forEach(v => counts[v.opcao] = (counts[v.opcao] || 0) + 1);
  const meu = (votos.find(v => v.pessoa_id === me.id) || {}).opcao;
  poll.querySelectorAll(".poll-opt").forEach(btn => {
    const op = btn.dataset.op, cnt = counts[op] || 0;
    const pct = total ? Math.round(cnt / total * 100) : 0;
    btn.querySelector(".poll-bar").style.width = pct + "%";
    btn.querySelector(".poll-count").textContent = total ? cnt + " · " + pct + "%" : "";
    btn.classList.toggle("voted", op === meu);
  });
  const tot = document.getElementById("polltot-" + widgetId);
  if (tot) tot.textContent = total ? total + " voto" + (total === 1 ? "" : "s") : "Seja o primeiro a votar";
}
async function votarEnquete(widgetId, opcao) {
  if (!curProjeto || !me) return;
  const { error } = await sb.from("enquete_votos").upsert(
    { projeto_id: curProjeto.id, widget_id: widgetId, pessoa_id: me.id, opcao },
    { onConflict: "widget_id,pessoa_id" });
  if (error) { toast("Erro: " + error.message); return; }
  loadEnquete(widgetId);
}

/* — Comentários no painel (por widget E por item dentro do widget) — */
let _cmtCtx = null; // { widget, item } do thread aberto
function itemKey(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "").slice(0, 48) || "item"; }

async function refreshComentarioMarcadores(widgetIds) {
  if (!curProjeto || !widgetIds.length) return;
  const { data } = await sb.from("comentarios_painel").select("widget_id, item_ref").eq("projeto_id", curProjeto.id).in("widget_id", widgetIds);
  const wC = {}, iC = {};
  (data || []).forEach(r => {
    if (r.item_ref) iC[r.widget_id + " " + r.item_ref] = (iC[r.widget_id + " " + r.item_ref] || 0) + 1;
    else wC[r.widget_id] = (wC[r.widget_id] || 0) + 1;
  });
  document.querySelectorAll(".cmt-btn").forEach(btn => {
    const n = wC[btn.dataset.wid] || 0, badge = btn.querySelector(".cmt-badge");
    if (n) { badge.textContent = n; badge.style.display = ""; btn.classList.add("has"); }
    else { badge.style.display = "none"; btn.classList.remove("has"); }
  });
  document.querySelectorAll(".item-cmt").forEach(btn => {
    const n = iC[btn.dataset.wid + " " + btn.dataset.item] || 0, badge = btn.querySelector(".item-cmt-n");
    if (badge) badge.textContent = n || "";
    btn.classList.toggle("has", !!n);
  });
}

/* Decora itens [data-item] dentro dos tiles com marcador de comentário */
function decorateItemComments() {
  document.querySelectorAll('#canvas .tile [data-item]').forEach(el => {
    if (el.dataset.cmtDone) return;
    const tile = el.closest(".tile"); if (!tile) return;
    const widgetId = tile.dataset.id, key = el.dataset.item, label = el.dataset.itemlabel || key;
    const host = el.tagName === "TR" ? el.lastElementChild : el;
    if (!host) return;
    host.classList.add("cmt-host");
    const b = document.createElement("button");
    b.className = "item-cmt"; b.innerHTML = '💬<span class="item-cmt-n"></span>';
    b.dataset.wid = widgetId; b.dataset.item = key; b.title = "Comentar: " + label;
    b.onclick = e => { e.stopPropagation(); abrirComentariosPainel(widgetId, key, label); };
    host.appendChild(b);
    el.dataset.cmtDone = "1";
  });
}

function abrirComentariosPainel(widgetId, itemRef, itemLabel) {
  itemRef = itemRef || null;
  _cmtCtx = { widget: widgetId, item: itemRef };
  openModal('<h3>' + (itemRef ? '💬 ' + esc(itemLabel || "Item") : '💬 Comentários') + '</h3>' +
    (itemRef ? '<p class="muted-note" style="margin:-6px 0 8px;text-transform:none;letter-spacing:0;font-weight:600">Comentário sobre este item.</p>' : '') +
    '<div id="cmtThread" class="cmt-thread"><p class="muted-note">Carregando…</p></div>' +
    '<div class="cmt-add"><textarea id="cmtInput" placeholder="Escreva um comentário…" onkeydown="if(event.key===\'Enter\'&&(event.metaKey||event.ctrlKey))enviarComentarioPainel()"></textarea>' +
    '<button class="btn primary" onclick="enviarComentarioPainel()">Enviar</button></div>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Fechar</button></div>',
    m => { m.querySelector("[data-x]").onclick = () => { _cmtCtx = null; closeModal(); }; });
  loadComentariosPainel();
}
async function loadComentariosPainel() {
  if (!curProjeto || !_cmtCtx) return;
  let q = sb.from("comentarios_painel")
    .select("id, corpo, autor_id, created_at, autor:pessoas!autor_id(nome,email)")
    .eq("widget_id", _cmtCtx.widget);
  q = _cmtCtx.item ? q.eq("item_ref", _cmtCtx.item) : q.is("item_ref", null);
  const { data } = await q.order("created_at");
  const thread = document.getElementById("cmtThread"); if (!thread) return;
  const list = data || [];
  thread.innerHTML = list.length ? list.map(c => {
    const who = (c.autor && (c.autor.nome || c.autor.email)) || "—";
    const canDel = c.autor_id === me.id || isAdmin || canEdit;
    return '<div class="cmt"><div class="cmt-head"><span class="cmt-who">' + esc(who) + '</span><span class="cmt-when">' + fmtRel(c.created_at) + '</span>' +
      (canDel ? '<button class="lnk del" onclick="delComentarioPainel(\'' + c.id + '\')">✕</button>' : '') +
      '</div><div class="cmt-body">' + esc(c.corpo) + '</div></div>';
  }).join("") : '<p class="muted-note">Nenhum comentário ainda. Seja o primeiro.</p>';
  thread.scrollTop = thread.scrollHeight;
}
async function enviarComentarioPainel() {
  if (!_cmtCtx) return;
  const inp = document.getElementById("cmtInput"); const corpo = (inp.value || "").trim(); if (!corpo) return;
  const { error } = await sb.from("comentarios_painel").insert({ projeto_id: curProjeto.id, widget_id: _cmtCtx.widget, item_ref: _cmtCtx.item, autor_id: me.id, corpo });
  if (error) { toast("Erro: " + error.message); return; }
  inp.value = ""; loadComentariosPainel();
  const ids = [...document.querySelectorAll(".cmt-btn")].map(b => b.dataset.wid);
  if (ids.length) refreshComentarioMarcadores(ids);
}
async function delComentarioPainel(id) {
  if (!(await confirmDialog("Excluir este comentário?"))) return;
  await sb.from("comentarios_painel").delete().eq("id", id);
  loadComentariosPainel();
  const ids = [...document.querySelectorAll(".cmt-btn")].map(b => b.dataset.wid);
  if (ids.length) refreshComentarioMarcadores(ids);
}

/* ===== Widget Formulário / Pesquisa (multimídia, respostas por pessoa, dashboard) ===== */
const FTIPOS = { texto: "Texto aberto", paragrafo: "Parágrafo longo", unica: "Escolha única", multipla: "Múltipla escolha", escala: "Escala 1–5", nota: "Nota 0–10" };

function substVars(text, vars) {
  vars = vars || {};
  return String(text || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== "") ? vars[k] : m);
}
function extractVars(text) {
  const out = []; String(text || "").replace(/\{(\w+)\}/g, (m, k) => { if (!out.includes(k)) out.push(k); return m; });
  return out;
}
async function getVarsFor(pessoaId) {
  const map = {};
  const { data: p } = await sb.from("pessoas").select("nome,email").eq("id", pessoaId).maybeSingle();
  if (p) { map.nome = p.nome || ""; map.email = p.email || ""; }
  const { data: pc } = await sb.from("pessoa_campos").select("chave,valor").eq("projeto_id", curProjeto.id).eq("pessoa_id", pessoaId);
  (pc || []).forEach(r => { map[r.chave] = r.valor || ""; });
  return map;
}

async function loadFormularioWidget(widgetId) {
  if (!curProjeto) return;
  const { data: form } = await sb.from("form_formularios").select("*").eq("widget_id", widgetId).maybeSingle();
  const box = document.getElementById("formw-" + widgetId); if (!box) return;
  const titleEl = box.closest(".content") && box.closest(".content").querySelector(".w-title");
  if (!form) {
    box.innerHTML = canEdit
      ? '<div class="form-empty"><p class="muted-note">Formulário ainda não configurado.</p><button class="btn primary" onclick="editarFormulario(\'' + widgetId + '\')">Configurar formulário</button></div>'
      : '<p class="muted-note">Formulário ainda não disponível.</p>';
    return;
  }
  if (titleEl) titleEl.textContent = form.titulo || "Formulário";
  const [{ data: pergs }, { data: respExist }, { data: campos }, { count }, vars] = await Promise.all([
    sb.from("form_perguntas").select("*").eq("formulario_id", form.id).order("ordem"),
    sb.from("form_respostas").select("*").eq("formulario_id", form.id).eq("pessoa_id", me.id).maybeSingle(),
    sb.from("form_campos").select("*").eq("projeto_id", curProjeto.id),
    sb.from("form_respostas").select("*", { count: "exact", head: true }).eq("formulario_id", form.id),
    getVarsFor(me.id)
  ]);
  const perguntas = pergs || [];
  let html = "";
  if (canEdit) {
    html += '<div class="form-actions">' +
      '<button class="btn sm primary" onclick="verRespostasFormulario(\'' + form.id + '\',\'' + widgetId + '\')">📊 Respostas (' + (count || 0) + ')</button>' +
      '<button class="btn sm" onclick="editarFormulario(\'' + widgetId + '\')">✏ Editar perguntas</button></div>';
  }
  const desc = substVars(form.descricao || "", vars);
  if (desc) html += '<div class="form-desc">' + esc(desc) + '</div>';
  if (!perguntas.length) {
    html += '<p class="muted-note">' + (canEdit ? "Sem perguntas — clique em Editar perguntas." : "Sem perguntas ainda.") + '</p>';
    box.innerHTML = html; return;
  }
  // Perguntas direto no widget (inline)
  html += buildFormInline(perguntas, campos || [], vars, respExist, form, widgetId);
  box.innerHTML = html;
}

/* HTML do input de uma pergunta (nomes de radio escopados por widget) */
function formInputHtml(p, v, scope) {
  if (p.tipo === "texto") return '<input data-pid="' + p.id + '" value="' + escAttr(v || "") + '" style="width:100%">';
  if (p.tipo === "paragrafo") return '<textarea data-pid="' + p.id + '" style="width:100%;min-height:64px">' + esc(v || "") + '</textarea>';
  if (p.tipo === "escala" || p.tipo === "nota") {
    const max = p.tipo === "escala" ? 5 : 10, start = p.tipo === "escala" ? 1 : 0;
    let s = ""; for (let n = start; n <= max; n++) s += '<label class="esc-opt"><input type="radio" name="' + scope + "-" + p.id + '" data-pid="' + p.id + '" value="' + n + '"' + (String(v) === String(n) ? " checked" : "") + '> ' + n + '</label>';
    return '<div class="escala-row">' + s + '</div>';
  }
  const opts = p.opcoes || [], multi = p.tipo === "multipla";
  const sel = Array.isArray(v) ? v : (v ? [v] : []);
  return '<div class="opts-list">' + opts.map(o => '<label class="opt-row"><input type="' + (multi ? "checkbox" : "radio") + '" name="' + scope + "-" + p.id + '" data-pid="' + p.id + '" value="' + escAttr(o) + '"' + (sel.includes(o) ? " checked" : "") + '> ' + esc(o) + '</label>').join("") + '</div>';
}

/* Formulário inline completo dentro do widget */
function buildFormInline(perguntas, campos, vars, respExist, form, widgetId) {
  const saved = (respExist && respExist.respostas) || {};
  const usadas = new Set();
  extractVars(form.descricao).forEach(k => usadas.add(k));
  perguntas.forEach(p => extractVars(p.texto).forEach(k => usadas.add(k)));
  const camposUsados = campos.filter(c => usadas.has(c.chave));
  const scope = "fi" + widgetId;
  let h = '<div class="form-inline" id="fi-' + widgetId + '">';
  if (camposUsados.length) {
    h += '<div class="f-sobre"><div class="f-sobre-tit">Sobre você</div>' + camposUsados.map(c =>
      '<div class="perg-resp"><div class="perg-label">' + esc(c.label) + '</div><input data-campo="' + escAttr(c.chave) + '" value="' + escAttr(vars[c.chave] || "") + '" style="width:100%"></div>').join("") + '</div>';
  }
  h += perguntas.map((p, i) => {
    const txt = substVars(p.texto, vars);
    return '<div class="perg-resp"><div class="perg-label">' + (i + 1) + '. ' + esc(txt) + (p.obrigatoria ? ' <span style="color:var(--danger)">*</span>' : '') + '</div>' + fMediaHtml(p) + formInputHtml(p, saved[p.id], scope) + '</div>';
  }).join("");
  h += '<div class="fi-foot"><button class="btn primary" onclick="enviarFormularioInline(\'' + widgetId + '\',\'' + form.id + '\')">' + (respExist ? "Atualizar respostas" : "Enviar respostas") + '</button>' +
    (respExist ? '<span class="qbadge respondido">✓ já respondido</span>' : '') + '<span class="fi-msg"></span></div></div>';
  return h;
}

async function enviarFormularioInline(widgetId, formId) {
  const root = document.getElementById("fi-" + widgetId); if (!root) return;
  const msg = root.querySelector(".fi-msg");
  const setMsg = (t, cls) => { if (msg) { msg.textContent = t; msg.className = "fi-msg" + (cls ? " " + cls : ""); } };
  const campoEls = root.querySelectorAll("[data-campo]");
  if (campoEls.length) {
    const ups = Array.from(campoEls).map(el => ({ projeto_id: curProjeto.id, pessoa_id: me.id, chave: el.dataset.campo, valor: el.value.trim() }));
    await sb.from("pessoa_campos").upsert(ups, { onConflict: "projeto_id,pessoa_id,chave" });
  }
  const { data: pergs } = await sb.from("form_perguntas").select("*").eq("formulario_id", formId).order("ordem");
  const obj = {};
  for (const p of (pergs || [])) {
    if (p.tipo === "texto" || p.tipo === "paragrafo") { const el = root.querySelector('[data-pid="' + p.id + '"]'); obj[p.id] = el ? el.value.trim() : ""; }
    else if (p.tipo === "escala" || p.tipo === "nota" || p.tipo === "unica") { const el = root.querySelector('[data-pid="' + p.id + '"]:checked'); obj[p.id] = el ? el.value : ""; }
    else { obj[p.id] = Array.from(root.querySelectorAll('[data-pid="' + p.id + '"]:checked')).map(e => e.value); }
    if (p.obrigatoria) { const r = obj[p.id]; if (!r || (Array.isArray(r) && !r.length)) { setMsg('Responda: "' + p.texto + '"', "err"); return; } }
  }
  setMsg("Salvando…");
  const { data: respExist } = await sb.from("form_respostas").select("id").eq("formulario_id", formId).eq("pessoa_id", me.id).maybeSingle();
  let err;
  if (respExist) ({ error: err } = await sb.from("form_respostas").update({ respostas: obj, updated_at: new Date().toISOString() }).eq("id", respExist.id));
  else ({ error: err } = await sb.from("form_respostas").insert({ formulario_id: formId, projeto_id: curProjeto.id, pessoa_id: me.id, respostas: obj }));
  if (err) { setMsg("Erro: " + err.message, "err"); return; }
  setMsg("✓ Enviado!", "ok");
  setTimeout(() => loadFormularioWidget(widgetId), 900);
}

async function ensureFormulario(widgetId) {
  let { data: form } = await sb.from("form_formularios").select("*").eq("widget_id", widgetId).maybeSingle();
  if (!form) {
    const r = await sb.from("form_formularios").insert({ projeto_id: curProjeto.id, widget_id: widgetId, titulo: "Formulário" }).select().single();
    form = r.data;
  }
  return form;
}

async function editarFormulario(widgetId) {
  const form = await ensureFormulario(widgetId);
  if (!form) { toast("Erro ao criar formulário."); return; }
  const [{ data: pergs }, { data: campos }] = await Promise.all([
    sb.from("form_perguntas").select("*").eq("formulario_id", form.id).order("ordem"),
    sb.from("form_campos").select("*").eq("projeto_id", curProjeto.id).order("label")
  ]);
  const varsDisp = ["nome", "email"].concat((campos || []).map(c => c.chave));
  const hint = 'Variáveis: ' + varsDisp.map(v => '<code>{' + v + '}</code>').join(" ");

  function pergRow(p, i) {
    const tipoOpts = Object.keys(FTIPOS).map(tp => '<option value="' + tp + '"' + (p.tipo === tp ? " selected" : "") + '>' + FTIPOS[tp] + '</option>').join("");
    const showOpc = (p.tipo === "unica" || p.tipo === "multipla");
    return '<div class="perg-row" data-pid="' + p.id + '"><div class="perg-num">' + (i + 1) + '</div><div class="perg-body">' +
      '<input data-k="texto" value="' + escAttr(p.texto) + '" placeholder="Pergunta… (pode usar {nome})" style="width:100%">' +
      '<div style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap">' +
      '<select data-k="tipo" style="flex:1;min-width:140px" onchange="this.closest(\'.perg-row\').querySelector(\'[data-opc]\').style.display=(this.value===\'unica\'||this.value===\'multipla\')?\'block\':\'none\'">' + tipoOpts + '</select>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);text-transform:none;letter-spacing:0;margin:0"><input type="checkbox" data-k="obrigatoria"' + (p.obrigatoria ? " checked" : "") + '> Obrigatória</label>' +
      '</div>' +
      '<div data-opc style="display:' + (showOpc ? "block" : "none") + '"><textarea data-k="opcoes" style="margin-top:6px;min-height:48px" placeholder="Uma opção por linha">' + esc((p.opcoes || []).join("\n")) + '</textarea></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><select data-k="media_tipo" style="width:120px"><option value=""' + (!p.media_tipo ? " selected" : "") + '>sem mídia</option><option value="imagem"' + (p.media_tipo === "imagem" ? " selected" : "") + '>imagem</option><option value="video"' + (p.media_tipo === "video" ? " selected" : "") + '>vídeo</option></select>' +
      '<input data-k="media_url" value="' + escAttr(p.media_url || "") + '" placeholder="URL da imagem/vídeo" style="flex:1"></div>' +
      '</div><button class="lnk del" onclick="delFormPergunta(\'' + p.id + '\',\'' + widgetId + '\')">✕</button></div>';
  }

  openModal('<h3>Editar formulário</h3>' +
    field("Título", "titulo", form.titulo || "") +
    '<label>Descrição / introdução</label><textarea data-k="descricao" style="min-height:60px">' + esc(form.descricao || "") + '</textarea>' +
    '<p class="muted-note" style="font-size:11.5px;margin:4px 0 10px;text-transform:none;letter-spacing:0;font-weight:600">' + hint + ' · <a class="lnk" style="display:inline" onclick="gerenciarCamposDinamicos(\'' + widgetId + '\')">gerenciar campos</a></p>' +
    '<div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn sm" onclick="usarModeloForm(\'' + widgetId + '\')">📋 Usar modelo</button><button class="btn sm" onclick="salvarFormComoModelo(\'' + widgetId + '\')">💾 Salvar como modelo</button></div>' +
    '<div id="fpergList">' + (pergs || []).map(pergRow).join("") + '</div>' +
    '<button class="btn sm" style="margin-top:8px" onclick="addFormPergunta(\'' + form.id + '\',\'' + widgetId + '\')">＋ Pergunta</button>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Fechar</button><button class="btn primary" data-ok>Salvar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = () => { closeModal(); route(); };
      m.querySelector("[data-ok]").onclick = async () => {
        await sb.from("form_formularios").update({
          titulo: m.querySelector('[data-k="titulo"]').value.trim() || "Formulário",
          descricao: m.querySelector('[data-k="descricao"]').value.trim() || null
        }).eq("id", form.id);
        const rows = m.querySelectorAll("[data-pid]");
        await Promise.all(Array.from(rows).map((row, i) => {
          const get = k => (row.querySelector('[data-k="' + k + '"]') || {}).value;
          const checked = k => !!(row.querySelector('[data-k="' + k + '"]') || {}).checked;
          const tipo = get("tipo") || "texto";
          const opcoes = (tipo === "unica" || tipo === "multipla") ? (get("opcoes") || "").split("\n").map(s => s.trim()).filter(Boolean) : null;
          return sb.from("form_perguntas").update({
            texto: get("texto"), tipo, obrigatoria: checked("obrigatoria"), opcoes,
            media_tipo: get("media_tipo") || null, media_url: (get("media_url") || "").trim() || null, ordem: i
          }).eq("id", row.dataset.pid);
        }));
        closeModal(); route();
      };
    });
}

async function addFormPergunta(formId, widgetId) {
  await sb.from("form_perguntas").insert({ formulario_id: formId, texto: "Nova pergunta", tipo: "texto", ordem: 99 });
  closeModal(); editarFormulario(widgetId);
}
async function delFormPergunta(pid, widgetId) {
  if (!(await confirmDialog("Excluir esta pergunta?"))) return;
  await sb.from("form_perguntas").delete().eq("id", pid);
  closeModal(); editarFormulario(widgetId);
}

async function gerenciarCamposDinamicos(widgetId) {
  const { data: campos } = await sb.from("form_campos").select("*").eq("projeto_id", curProjeto.id).order("label");
  const rows = (campos || []).map(c =>
    '<div class="grow-row" data-cid="' + c.id + '"><div class="gr-main"><span class="gr-name">{' + esc(c.chave) + '} — ' + esc(c.label) + '</span>' +
    '<button class="lnk del" onclick="delCampoDinamico(\'' + c.id + '\',\'' + widgetId + '\')">excluir</button></div></div>').join("") || '<p class="muted-note">Nenhum campo personalizado ainda.</p>';
  openModal('<h3>Campos dinâmicos</h3>' +
    '<p class="muted-note" style="font-size:12px;text-transform:none;letter-spacing:0;font-weight:600">Crie variáveis que você usa nas perguntas como <code>{chave}</code>. Cada pessoa preenche o valor ao responder.</p>' +
    '<div style="margin:10px 0">' + rows + '</div>' +
    '<label>Nova variável</label><div style="display:flex;gap:8px"><input data-k="chave" placeholder="chave (ex.: departamento)" style="flex:1"><input data-k="label" placeholder="rótulo" style="flex:1"></div>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Voltar</button><button class="btn primary" data-ok>Adicionar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = () => editarFormulario(widgetId);
      m.querySelector("[data-ok]").onclick = async () => {
        const chave = (m.querySelector('[data-k="chave"]').value || "").trim().toLowerCase().replace(/[^\w]/g, "");
        const label = (m.querySelector('[data-k="label"]').value || "").trim() || chave;
        if (!chave) { toast("Informe a chave."); return; }
        const { error } = await sb.from("form_campos").insert({ projeto_id: curProjeto.id, chave, label });
        if (error) { toast("Erro: " + error.message); return; }
        gerenciarCamposDinamicos(widgetId);
      };
    });
}
async function delCampoDinamico(id, widgetId) {
  if (!(await confirmDialog("Excluir este campo dinâmico?"))) return;
  await sb.from("form_campos").delete().eq("id", id);
  gerenciarCamposDinamicos(widgetId);
}

function fMediaHtml(p) {
  if (!p.media_url) return "";
  if (p.media_tipo === "imagem") return '<div class="f-media"><img src="' + escAttr(p.media_url) + '" loading="lazy" alt=""></div>';
  if (p.media_tipo === "video") {
    const e = videoEmbedUrl(p.media_url);
    if (e.type === "iframe") return '<div class="f-media f-video"><iframe src="' + escAttr(e.url) + '" allowfullscreen></iframe></div>';
    if (e.type === "video") return '<div class="f-media f-video"><video src="' + escAttr(e.url) + '" controls></video></div>';
  }
  return "";
}

async function verRespostasFormulario(formId, widgetId) {
  const [{ data: pergs }, { data: resps }] = await Promise.all([
    sb.from("form_perguntas").select("*").eq("formulario_id", formId).order("ordem"),
    sb.from("form_respostas").select("respostas, updated_at, pessoa:pessoas!pessoa_id(nome,email)").eq("formulario_id", formId).order("updated_at", { ascending: false })
  ]);
  const lista = resps || [];
  // Dashboard por pergunta
  const dash = (pergs || []).map((p, i) => {
    const vals = lista.map(r => r.respostas && r.respostas[p.id]).filter(v => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));
    let body = '<p class="muted-note" style="font-size:12px">Sem respostas.</p>';
    if (vals.length) {
      if (p.tipo === "escala" || p.tipo === "nota") {
        const nums = vals.map(Number).filter(n => !isNaN(n));
        const avg = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
        body = '<div class="dash-avg"><span class="dash-avg-n">' + avg.toFixed(1) + '</span><span class="dash-avg-l">média · ' + nums.length + ' resp.</span></div>';
      } else if (p.tipo === "unica" || p.tipo === "multipla") {
        const counts = {}; vals.forEach(v => (Array.isArray(v) ? v : [v]).forEach(o => counts[o] = (counts[o] || 0) + 1));
        const tot = vals.length;
        body = Object.keys(counts).map(o => { const pct = Math.round(counts[o] / tot * 100); return '<div class="dash-opt"><div class="dash-opt-top"><span>' + esc(o) + '</span><span>' + counts[o] + ' · ' + pct + '%</span></div><div class="prog-bar"><i style="width:' + pct + '%"></i></div></div>'; }).join("");
      } else {
        body = '<div class="dash-texts">' + vals.map(v => '<div class="dash-text">' + esc(v) + '</div>').join("") + '</div>';
      }
    }
    return '<div class="dash-perg"><div class="dash-perg-q">' + (i + 1) + '. ' + esc(p.texto) + '</div>' + body + '</div>';
  }).join("");

  // Por pessoa
  const porPessoa = lista.map((r, idx) => {
    const who = (r.pessoa && (r.pessoa.nome || r.pessoa.email)) || "—";
    const ans = (pergs || []).map(p => {
      let v = r.respostas && r.respostas[p.id];
      if (Array.isArray(v)) v = v.join(", ");
      return (v === undefined || v === "") ? "" : '<div class="pp-a"><span class="pp-q">' + esc(p.texto) + '</span><span class="pp-v">' + esc(String(v)) + '</span></div>';
    }).join("");
    return '<details class="pp"><summary>' + esc(who) + '</summary>' + ans + '</details>';
  }).join("") || '<p class="muted-note">Ninguém respondeu ainda.</p>';

  openModal('<h3>📊 Respostas (' + lista.length + ')</h3>' +
    '<div class="rep-tabs"><button class="rep-tab on" data-rt="dash">Dashboard</button><button class="rep-tab" data-rt="pessoa">Por pessoa</button>' +
    '<button class="rep-tab" data-rt="ia">Resumo IA</button></div>' +
    '<div data-pane="dash">' + (dash || '<p class="muted-note">Sem perguntas.</p>') + '</div>' +
    '<div data-pane="pessoa" style="display:none">' + porPessoa + '</div>' +
    '<div data-pane="ia" style="display:none"><div class="ia-box" id="iaBox"><p class="muted-note" style="text-transform:none;letter-spacing:0;font-weight:600">A IA lê as respostas abertas e resume temas, sentimento e destaques.</p><button class="btn primary" onclick="gerarResumoIA(\'' + formId + '\')">✨ Gerar resumo</button></div></div>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Fechar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelectorAll(".rep-tab").forEach(b => b.onclick = () => {
        m.querySelectorAll(".rep-tab").forEach(x => x.classList.toggle("on", x === b));
        m.querySelectorAll("[data-pane]").forEach(pane => pane.style.display = pane.dataset.pane === b.dataset.rt ? "" : "none");
      });
    });
}

async function gerarResumoIA(formId) {
  const box = document.getElementById("iaBox"); if (!box) return;
  box.innerHTML = '<p class="muted-note">✨ Lendo as respostas e gerando o resumo…</p>';
  const { data, error } = await sb.functions.invoke("resumo-ia", { body: { formulario_id: formId } });
  let errMsg = null;
  if (error) { errMsg = error.message; try { const c = await error.context.json(); if (c && c.error) errMsg = c.error; } catch (e) {} }
  else if (data && data.error) errMsg = data.error;
  if (errMsg) {
    box.innerHTML = '<p class="muted-note" style="color:var(--danger)">' + esc(errMsg) + '</p>' +
      '<button class="btn" onclick="gerarResumoIA(\'' + formId + '\')">Tentar de novo</button>';
    return;
  }
  const resumo = (data && data.resumo) || "Sem conteúdo.";
  box.innerHTML = '<div class="ia-resumo">' + esc(resumo) + '</div>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-top:10px"><button class="btn sm" onclick="gerarResumoIA(\'' + formId + '\')">↻ Regenerar</button>' +
    '<span class="muted-note" style="font-size:11.5px">Gerado por IA a partir de ' + ((data && data.respostas) || 0) + ' respostas · revise antes de usar</span></div>';
}

async function loadChecklistProjeto(c) {
  if (!curProjeto) return;
  const { data } = await sb.from("checklists").select("titulo, checklist_itens(concluido)").eq("projeto_id", curProjeto.id).order("ordem");
  const body = c.querySelector(".w-body"); if (!body) return;
  const lists = data || [];
  if (!lists.length) { body.innerHTML = '<p class="muted-note">Nenhum checklist no projeto.</p>'; return; }
  let totDone = 0, tot = 0;
  const rows = lists.map(cl => {
    const items = cl.checklist_itens || [];
    const done = items.filter(i => i.concluido).length;
    totDone += done; tot += items.length;
    const pct = items.length ? Math.round(done / items.length * 100) : 0;
    return '<div class="cl-row"><div class="cl-top"><span>' + esc(cl.titulo) + '</span><span>' + done + '/' + items.length + '</span></div>' +
      '<div class="prog-bar"><i style="width:' + pct + '%"></i></div></div>';
  }).join("");
  const overall = tot ? Math.round(totDone / tot * 100) : 0;
  body.innerHTML = '<div class="cl-overall"><span class="cl-overall-pct">' + overall + '%</span><span class="cl-overall-lbl">concluído (' + totDone + '/' + tot + ')</span></div>' + rows;
}

async function loadResumoProjeto(c) {
  if (!curProjeto) return;
  const { count } = await sb.from("membros").select("*", { count: "exact", head: true }).eq("projeto_id", curProjeto.id);
  const body = c.querySelector(".w-body"); if (!body) return;
  const pr = curProjeto.progresso || 0, st = curProjeto.status || "ativo", n = count || 0;
  body.innerHTML = '<div class="resumo">' +
    '<div class="resumo-row"><span class="resumo-lbl">Progresso</span><span class="resumo-val">' + pr + '%</span></div>' +
    '<div class="prog-bar"><i style="width:' + pr + '%"></i></div>' +
    '<div class="resumo-chips"><span class="cli-status ' + (st === "ativo" ? "ativo" : "pausado") + '">' + esc(st) + '</span>' +
    '<span class="resumo-members">👥 ' + n + ' participante' + (n === 1 ? "" : "s") + '</span></div></div>';
}

async function loadDocumentosProjeto(c) {
  if (!curProjeto) return;
  const { data } = await sb.from("documentos").select("nome, storage_path, url").eq("projeto_id", curProjeto.id).order("created_at", { ascending: false }).limit(8);
  const body = c.querySelector(".w-body"); if (!body) return;
  const list = data || [];
  if (!list.length) { body.innerHTML = '<p class="muted-note">Nenhum documento.</p>'; return; }
  body.innerHTML = '<div class="doc-list">' + list.map(d =>
    '<div class="doc-row"><span class="doc-name">📄 ' + esc(d.nome) + '</span>' +
    (d.storage_path ? '<button class="lnk" onclick="baixarDoc(\'' + escAttr(d.storage_path) + '\')">baixar</button>'
      : (d.url ? '<a class="lnk" href="' + escAttr(d.url) + '" target="_blank" rel="noopener">abrir</a>' : '')) + '</div>'
  ).join("") + '</div>';
}

async function loadAtividadeRecente(c) {
  if (!curProjeto) return;
  const [msgs, docs] = await Promise.all([
    sb.from("mensagens").select("corpo, created_at, anexo_nome, autor:pessoas!autor_id(nome,email)").eq("projeto_id", curProjeto.id).order("created_at", { ascending: false }).limit(5),
    sb.from("documentos").select("nome, created_at").eq("projeto_id", curProjeto.id).order("created_at", { ascending: false }).limit(5)
  ]);
  const body = c.querySelector(".w-body"); if (!body) return;
  const ev = [];
  (msgs.data || []).forEach(m => ev.push({ when: m.created_at, ico: "💬", txt: ((m.autor && (m.autor.nome || m.autor.email)) || "Alguém") + ": " + (m.corpo ? m.corpo.slice(0, 42) : (m.anexo_nome ? "📎 " + m.anexo_nome : "")) }));
  (docs.data || []).forEach(d => ev.push({ when: d.created_at, ico: "📄", txt: "Documento: " + d.nome }));
  ev.sort((a, b) => (b.when || "").localeCompare(a.when || ""));
  if (!ev.length) { body.innerHTML = '<p class="muted-note">Sem atividade ainda.</p>'; return; }
  body.innerHTML = '<div class="acts">' + ev.slice(0, 6).map(e =>
    '<div class="act-row"><span class="act-ico">' + e.ico + '</span><div class="act-body"><div class="act-txt">' + esc(e.txt) + '</div><div class="act-when">' + fmtRel(e.when) + '</div></div></div>'
  ).join("") + '</div>';
}

async function loadQuestionariosPendentes(c) {
  if (!curProjeto) return;
  const { data: qs } = await sb.from("questionarios").select("id, titulo").eq("projeto_id", curProjeto.id).eq("status", "aberto").order("created_at", { ascending: false });
  const body = c.querySelector(".w-body"); if (!body) return;
  const list = qs || [];
  if (!list.length) { body.innerHTML = '<div class="ap-pend-empty">✓ Nada pendente</div>'; return; }
  if (isAdmin) {
    body.innerHTML = '<div class="ap-pend"><span class="ap-pend-count">' + list.length + '</span><span class="ap-pend-lbl">aberto' + (list.length === 1 ? "" : "s") + '</span></div>' +
      '<div class="ap-pend-list">' + list.slice(0, 5).map(q => '<div class="ap-pend-item">📝 ' + esc(q.titulo) + '</div>').join("") + '</div>';
    return;
  }
  const { data: rs } = await sb.from("respostas").select("questionario_id").eq("respondido_por", me.id).in("questionario_id", list.map(q => q.id));
  const answered = new Set((rs || []).map(r => r.questionario_id));
  const pend = list.filter(q => !answered.has(q.id));
  if (!pend.length) { body.innerHTML = '<div class="ap-pend-empty">✓ Tudo respondido</div>'; return; }
  body.innerHTML = '<div class="ap-pend"><span class="ap-pend-count">' + pend.length + '</span><span class="ap-pend-lbl">a responder</span></div>' +
    '<div class="ap-pend-list">' + pend.slice(0, 5).map(q => '<div class="ap-pend-item" style="cursor:pointer" onclick="responderQuestionario(\'' + q.id + '\')">📝 ' + esc(q.titulo) + '</div>').join("") + '</div>';
}

/* ===== 5) Roteamento de telas ===== */
function route() {
  applyBrand(); paintTools(); applyPrefs();
  const canvas = $("#canvas"), hint = $("#emptyHint");
  canvas.style.display = "none"; hint.style.display = "none";
  canvas.innerHTML = ""; hint.innerHTML = "";
  hint.style.background = ""; hint.className = "empty-hint"; // reset — project tabs adicionam proj-content
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
  $("#crumb").innerHTML = '<span class="cr-cur">' + (consoleTab === "meus-projetos" ? "Meus Projetos" : consoleTab === "uso" ? "Uso" : "Clientes") + '</span>';
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
    '<button class="console-tab' + (consoleTab === "uso" ? " on" : "") + '" onclick="switchConsoleTab(\'uso\')">📊 Uso</button>' +
    '</div>';

  if (consoleTab === "meus-projetos") {
    await renderMeusProjetos(hint, internoCliente, navHtml);
    return;
  }
  if (consoleTab === "uso") {
    await renderUso(hint, navHtml);
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
        '<button class="cli-card-menu" onclick="abrirMenuProjeto(event,\'' + p.id + '\')" title="Duplicar / Gerar modelo">⋯</button>' +
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
    '<button class="btn" onclick="abrirBibliotecaModelos()">📐 Modelos</button>' +
    '<button class="btn primary" onclick="novoMeuProjeto(' + (iid ? '\'' + iid + '\'' : 'null') + ')">＋ Novo projeto</button>' +
    '</div></div>' + projetosHtml + '</div>';
}

/* ===== Painel de Uso (métricas de acesso e engajamento) ===== */
function _statusUso(ultimo) {
  if (!ultimo) return { k: "nunca", t: "nunca acessou" };
  const dias = (Date.now() - new Date(ultimo).getTime()) / 86400000;
  if (dias < 7) return { k: "ativo", t: "ativo" };
  if (dias < 14) return { k: "esfriando", t: "esfriando" };
  return { k: "sumido", t: "sumido" };
}
function _fmtDur(seg) {
  if (!seg || seg < 1) return "—";
  const m = Math.round(seg / 60);
  if (m < 1) return "<1 min";
  if (m < 60) return m + " min";
  return (m / 60).toFixed(1) + " h";
}
async function renderUso(hint, navHtml) {
  hint.innerHTML = '<div class="page">' + navHtml + '<div class="page-head"><h2>📊 Uso por projeto</h2></div><p class="muted-note">Carregando métricas…</p></div>';
  const { data, error } = await sb.rpc("metricas_uso_resumo");
  const page = hint.querySelector(".page");
  const head = navHtml + '<div class="page-head"><h2>📊 Uso por projeto</h2><button class="btn sm" onclick="route()">↻ Atualizar</button></div>';
  if (error) { page.innerHTML = head + '<p class="muted-note">Erro: ' + esc(error.message) + '</p>'; return; }
  const rows = data || [];

  // resumo no topo
  const totPart = rows.reduce((s, r) => s + Number(r.n_participantes || 0), 0);
  const semAtivos = rows.filter(r => Number(r.n_participantes) > 0 && Number(r.n_ativos) === 0).length;
  const stats = '<div class="dash-stats">' +
    '<div class="dstat"><span class="dstat-n">' + rows.length + '</span><span class="dstat-l">projetos</span></div>' +
    '<div class="dstat"><span class="dstat-n">' + totPart + '</span><span class="dstat-l">participantes</span></div>' +
    '<div class="dstat' + (semAtivos ? " dstat-alert" : "") + '"><span class="dstat-n">' + semAtivos + '</span><span class="dstat-l">sem ativos</span></div>' +
    '</div>';

  let body;
  if (!rows.length) {
    body = '<p class="muted-note">Nenhum projeto ainda. Crie projetos e adicione participantes para acompanhar o uso de cada um.</p>';
  } else {
    const trs = rows.map(r => {
      const np = Number(r.n_participantes || 0), na = Number(r.n_ativos || 0), ns = Number(r.n_sumidos || 0);
      const alerta = np > 0 && na === 0;
      return '<tr class="uso-proj-row' + (alerta ? " alerta" : "") + '" onclick="abrirProjeto(\'' + r.projeto_id + '\')" title="Abrir projeto">' +
        '<td><div class="uso-nome">' + esc(r.projeto_nome || "—") + '</div><div class="uso-email">' + esc(r.cliente_nome || "") + '</div></td>' +
        '<td>' + np + '<span class="uso-sub"> part.</span></td>' +
        '<td>' + (np ? '<span class="uso-st ' + (na ? "ativo" : "sumido") + '">' + na + " ativo" + (na === 1 ? "" : "s") + '</span>' : "—") + '</td>' +
        '<td>' + (ns ? '<span class="uso-st sumido">' + ns + " sumido" + (ns === 1 ? "" : "s") + '</span>' : "—") + '</td>' +
        '<td>' + (r.ultimo_acesso ? fmtRel(r.ultimo_acesso) : '<span class="muted-note">nunca</span>') + '</td>' +
        '<td><div class="uso-contrib">' + Number(r.n_contrib || 0) + '</div></td>' +
        '</tr>';
    }).join("");
    body = '<div class="uso-table-wrap"><table class="data-table uso-table"><thead><tr>' +
      '<th>Projeto</th><th>Particip.</th><th>Ativos (7d)</th><th>Sumidos</th><th>Últ. acesso</th><th>Contrib.</th>' +
      '</tr></thead><tbody>' + trs + '</tbody></table></div>';
  }

  page.innerHTML = head + stats + body +
    '<p class="muted-note" style="margin-top:10px;font-size:11.5px;text-transform:none;letter-spacing:0">Clique num projeto para abrir. O detalhe por participante fica na aba <b>Participantes</b> do projeto.</p>';
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
        if (!empresa) { toast("Informe a empresa."); return; }
        const slug = await uniqueSlug("clientes", empresa);
        const { error } = await sb.from("clientes").insert({
          nome, empresa, slug, criado_por: me.id,
          marca: { titulo: empresa, cor, logoUrl: "" }
        });
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}

/* ===== 7) Detalhe do cliente: lista de projetos ===== */
/* ===== Item 1: links próprios (slugs) — dominio.com/cliente/projeto ===== */
function slugify(s) {
  return (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}
async function uniqueSlug(table, base, scopeCol, scopeVal) {
  base = slugify(base); let slug = base, n = 1;
  for (; ;) {
    let q = sb.from(table).select("id").eq("slug", slug);
    if (scopeCol) q = q.eq(scopeCol, scopeVal);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
    n++; slug = base + "-" + n;
  }
}
/* Igual ao uniqueSlug, mas ignora a própria linha (para renomear/editar o link) */
async function uniqueSlugExcept(table, base, scopeCol, scopeVal, exceptId) {
  base = slugify(base); let slug = base, n = 1;
  for (; ;) {
    let q = sb.from(table).select("id").eq("slug", slug);
    if (scopeCol) q = q.eq(scopeCol, scopeVal);
    const { data } = await q.maybeSingle();
    if (!data || data.id === exceptId) return slug;
    n++; slug = base + "-" + n;
  }
}
function setUrl(path) { if (location.pathname !== path) history.pushState(null, "", path); }
async function applyUrlRoute() {
  const parts = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return;
  const [cliSlug, projSlug] = parts;
  if (projSlug) {
    if (curProjeto && curProjeto.slug === projSlug && view === "painel") return;
    let projId = null;
    if (isAdmin && cliSlug) {
      // Admin: usa cliente para desambiguar projetos com slug igual em clientes distintos
      const { data: cli } = await sb.from("clientes").select("id").eq("slug", cliSlug).maybeSingle();
      if (cli) {
        const { data: proj } = await sb.from("projetos").select("id").eq("slug", projSlug).eq("cliente_id", cli.id).maybeSingle();
        if (proj) projId = proj.id;
      }
    }
    if (!projId) {
      // Fallback: só por slug (RLS limita ao acessível para não-admins)
      const { data: proj } = await sb.from("projetos").select("id").eq("slug", projSlug).maybeSingle();
      if (proj) projId = proj.id;
    }
    if (projId) { await abrirProjeto(projId); return; }
  }
  if (cliSlug && isAdmin) {
    if (curCliente && curCliente.slug === cliSlug && view === "cliente") return;
    const { data } = await sb.from("clientes").select("id").eq("slug", cliSlug).maybeSingle();
    if (data) { await abrirCliente(data.id); return; }
  }
}
window.addEventListener("popstate", () => {
  const parts = location.pathname.split("/").filter(Boolean);
  if (!parts.length) { if (isAdmin) irConsole(); else if (me) rotaCliente(); }
  else applyUrlRoute();
});

async function abrirCliente(id) {
  const { data, error } = await sb.from("clientes").select("*").eq("id", id).single();
  if (error) { toast("Erro ao abrir cliente."); return; }
  curCliente = data; view = "cliente";
  if (data.slug) setUrl("/" + data.slug);
  route();
}

async function renderClienteDetail(canvas, hint) {
  const c = curCliente;
  $("#crumb").innerHTML = '<a class="cr-link" onclick="irConsole()">Clientes</a><span class="cr-sep">›</span><span class="cr-cur">' + esc(c.empresa || c.nome) + '</span>';
  const { data: projetos } = await sb.from("projetos").select("*").eq("cliente_id", c.id).order("created_at");
  hint.style.display = "block";
  const d = c.dados || {};
  const logo = c.marca && c.marca.logoUrl;
  const info = [["✉️", d.email], ["📞", d.telefone], ["🌐", d.site], ["📍", d.endereco], ["🏷", d.segmento], ["📅", d.inicio]]
    .filter(r => r[1]).map(r => '<span class="cli-info-item">' + r[0] + ' ' + esc(r[1]) + '</span>').join("");
  const temPerfil = logo || info || d.observacoes;
  const perfil = temPerfil ? '<div class="cli-perfil">' +
    (logo ? '<div class="cli-perfil-logo"><img src="' + escAttr(logo) + '" alt=""></div>' : '') +
    '<div class="cli-perfil-body">' +
    (info ? '<div class="cli-info">' + info + '</div>' : '') +
    (d.observacoes ? '<div class="cli-obs">' + esc(d.observacoes) + '</div>' : '') +
    '</div></div>' : '';
  hint.innerHTML = '<div class="page">' +
    '<div class="page-head"><h2>' + esc(c.empresa || c.nome) + ' <span class="cli-status ' + (c.status === "ativo" ? "ativo" : "pausado") + '" style="vertical-align:middle">' + esc(c.status) + '</span></h2><div style="display:flex;gap:8px">' +
    '<button class="btn danger" onclick="excluirCliente()">🗑 Excluir</button>' +
    '<button class="btn" onclick="editarCliente()">⚙ Configurar cliente</button>' +
    '<button class="btn" onclick="abrirBibliotecaModelos()">📐 Modelos</button>' +
    '<button class="btn primary" onclick="novoProjeto()">＋ Novo projeto</button></div></div>' +
    perfil +
    ((projetos && projetos.length) ? '<div class="cli-grid">' + projetos.map(p =>
      '<div class="cli-card" onclick="abrirProjeto(\'' + p.id + '\')">' +
      '<button class="cli-card-menu" onclick="abrirMenuProjeto(event,\'' + p.id + '\')" title="Duplicar / Gerar modelo">⋯</button>' +
      '<div class="cli-name">' + esc(p.nome) + '</div>' +
      '<div class="cli-sub">' + esc(p.descricao || "") + '</div>' +
      '<div class="cli-meta"><span class="cli-status ' + (p.status === "ativo" ? "ativo" : "pausado") + '">' + esc(p.status) + '</span>' +
      '<span>' + p.progresso + '%</span></div></div>'
    ).join("") + '</div>'
      : '<p class="muted-note">Sem projetos. Crie o primeiro com <b>＋ Novo projeto</b>.</p>') +
    '</div>';
}

function novoMeuProjeto(internoClienteId) {
  if (!internoClienteId) { toast("Erro: cliente interno não encontrado."); return; }
  criarProjetoFlow(internoClienteId);
}

function editarClienteInterno() {
  sb.from("clientes").select("*").eq("is_interno", true).single().then(({ data }) => {
    if (!data) { toast("Cliente interno não encontrado."); return; }
    curCliente = data;
    openModal('<h3>Renomear empresa</h3>' +
      field("Nome da empresa", "empresa", data.empresa || "") +
      '<label>Cor</label><input type="color" data-k="cor" value="' + escAttr((data.marca && data.marca.cor) || "#5b8def") + '" style="height:40px;padding:4px">' +
      actions("Salvar"),
      m => {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-ok]").onclick = async () => {
          const empresa = m.querySelector('[data-k="empresa"]').value.trim();
          if (!empresa) { toast("Informe o nome."); return; }
          const cor = m.querySelector('[data-k="cor"]').value;
          const marca = Object.assign({}, data.marca || {}, { cor, titulo: empresa });
          const { error } = await sb.from("clientes").update({ empresa, nome: empresa, marca }).eq("id", data.id);
          if (error) { toast("Erro: " + error.message); return; }
          closeModal(); route();
        };
      });
  });
}

function novoProjeto() {
  criarProjetoFlow(curCliente && curCliente.id);
}

/* ===== Criar projeto (em branco ou a partir de modelo) ===== */
async function criarProjetoFlow(clienteId) {
  if (!clienteId) { toast("Cliente não encontrado."); return; }
  const { data: tpls } = await sb.from("modelos").select("id,titulo").eq("tipo", "painel").order("created_at", { ascending: false });
  const temTpl = tpls && tpls.length;
  const tplOptions = '<option value="">Em branco</option>' +
    (temTpl ? tpls.map(t => '<option value="' + t.id + '">' + esc(t.titulo) + '</option>').join("") : "");
  openModal('<h3>Novo projeto</h3>' + field("Nome", "nome", "") +
    '<label>Descrição</label><textarea data-k="descricao"></textarea>' +
    '<label>Começar com</label><select data-k="modelo">' + tplOptions + '</select>' +
    (temTpl ? '<p class="muted-note" style="font-size:11px;margin-top:4px">Um modelo recria a organização dos widgets, em branco.</p>'
            : '<p class="muted-note" style="font-size:11px;margin-top:4px">Nenhum modelo salvo. Gere um a partir de um projeto pelo menu ⋯.</p>') +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Criar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        const descricao = m.querySelector('[data-k="descricao"]').value.trim();
        if (!nome) { toast("Informe o nome."); return; }
        const modeloId = m.querySelector('[data-k="modelo"]').value;
        const slug = await uniqueSlug("projetos", nome, "cliente_id", clienteId);
        const { data: novo, error } = await sb.from("projetos").insert({ cliente_id: clienteId, nome, descricao, slug }).select("id").single();
        if (error || !novo) { toast("Erro: " + (error && error.message || "ao criar")); return; }
        if (modeloId) {
          const { data: tpl } = await sb.from("modelos").select("layout").eq("id", modeloId).maybeSingle();
          if (tpl && tpl.layout) await sb.from("paineis").insert({ projeto_id: novo.id, layout: tpl.layout });
        }
        closeModal(); toast("Projeto criado."); route();
      };
    });
}

/* ===== Nome incremental para duplicatas: "Projeto (1)", "(2)"… ===== */
async function nextProjectName(clienteId, base) {
  const { data } = await sb.from("projetos").select("nome").eq("cliente_id", clienteId);
  const names = new Set((data || []).map(p => p.nome));
  if (!names.has(base)) return base;
  let n = 1;
  while (names.has(base + " (" + n + ")")) n++;
  return base + " (" + n + ")";
}

/* ===== Esqueleto do painel: mantém widgets e posições, zera o conteúdo ===== */
function skeletonLayout(layout) {
  const L = JSON.parse(JSON.stringify(layout || defaultState()));
  (L.spaces || []).forEach(s => (s.tiles || []).forEach(t => {
    const W = WIDGETS[t.type];
    t.props = (W && W.defaults) ? JSON.parse(JSON.stringify(W.defaults)) : {};
  }));
  return L;
}

/* ===== Duplicar projeto (versões / testes) ===== */
async function duplicarProjeto(projetoId) {
  const { data: orig, error } = await sb.from("projetos").select("*").eq("id", projetoId).single();
  if (error || !orig) { toast("Erro ao carregar projeto."); return; }
  const nome = await nextProjectName(orig.cliente_id, orig.nome);
  const slug = await uniqueSlug("projetos", nome, "cliente_id", orig.cliente_id);
  const { data: novo, error: e2 } = await sb.from("projetos")
    .insert({ cliente_id: orig.cliente_id, nome, descricao: orig.descricao, status: orig.status, dados: orig.dados, slug })
    .select("id").single();
  if (e2 || !novo) { toast("Erro ao duplicar: " + (e2 && e2.message || "")); return; }
  const { data: pan } = await sb.from("paineis").select("layout").eq("projeto_id", projetoId).maybeSingle();
  if (pan && pan.layout) await sb.from("paineis").insert({ projeto_id: novo.id, layout: pan.layout });
  const { data: priv } = await sb.from("projetos_privado").select("proposta_url,valor,notas").eq("projeto_id", projetoId).maybeSingle();
  if (priv) await sb.from("projetos_privado").insert({ projeto_id: novo.id, proposta_url: priv.proposta_url, valor: priv.valor, notas: priv.notas });
  toast("Projeto duplicado: " + nome);
  route();
}

/* ===== Gerar modelo a partir de um projeto ===== */
async function gerarModeloDeProjeto(projetoId) {
  const { data: proj } = await sb.from("projetos").select("nome").eq("id", projetoId).maybeSingle();
  const { data: pan } = await sb.from("paineis").select("layout").eq("projeto_id", projetoId).maybeSingle();
  if (!pan || !pan.layout || !(pan.layout.spaces || []).some(s => (s.tiles || []).length)) {
    toast("Este projeto ainda não tem widgets para virar modelo."); return;
  }
  const skel = skeletonLayout(pan.layout);
  const defTitulo = (proj && proj.nome ? proj.nome : "Painel") + " — modelo";
  openModal('<h3>Gerar modelo a partir do projeto</h3>' +
    '<p class="muted-note" style="font-size:11.5px;margin:2px 0 10px;text-transform:none;letter-spacing:0;font-weight:600">Salva a organização dos widgets, sem os dados preenchidos. Fica na biblioteca de modelos.</p>' +
    field("Nome do modelo", "titulo", defTitulo) +
    '<label>Descrição (opcional)</label><textarea data-k="descricao"></textarea>' +
    actions("Salvar modelo"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const titulo = m.querySelector('[data-k="titulo"]').value.trim();
        if (!titulo) { toast("Informe o nome do modelo."); return; }
        const descricao = m.querySelector('[data-k="descricao"]').value.trim() || null;
        const { error } = await sb.from("modelos").insert({ tipo: "painel", titulo, descricao, layout: skel, criado_por: me.id });
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); toast("Modelo salvo na biblioteca.");
      };
    });
}

/* ===== Menu de contexto do card de projeto (⋯) ===== */
function abrirMenuProjeto(ev, projetoId) {
  ev.stopPropagation(); ev.preventDefault();
  const ex = document.getElementById("projMenu"); if (ex) ex.remove();
  const html = '<button class="ctx-it" data-a="edit">✏ Editar projeto</button>' +
    '<button class="ctx-it" data-a="dup">⧉ Duplicar projeto</button>' +
    '<button class="ctx-it" data-a="modelo">📐 Gerar modelo</button>';
  const menu = document.createElement("div"); menu.id = "projMenu"; menu.className = "ctx-menu"; menu.innerHTML = html;
  document.body.appendChild(menu);
  menu.style.left = Math.min(ev.clientX, window.innerWidth - menu.offsetWidth - 8) + "px";
  menu.style.top = Math.min(ev.clientY, window.innerHeight - menu.offsetHeight - 8) + "px";
  const close = () => { menu.remove(); document.removeEventListener("click", close, true); document.removeEventListener("contextmenu", close, true); };
  menu.querySelectorAll(".ctx-it").forEach(b => b.onclick = e => {
    e.stopPropagation(); const a = b.dataset.a; close();
    if (a === "edit") editarMetadataProjeto(projetoId);
    else if (a === "dup") duplicarProjeto(projetoId);
    else if (a === "modelo") gerarModeloDeProjeto(projetoId);
  });
  setTimeout(() => { document.addEventListener("click", close, true); document.addEventListener("contextmenu", close, true); }, 0);
}

async function editarMetadataProjeto(projetoId) {
  const { data: p, error } = await sb.from("projetos").select("*, clientes(slug)").eq("id", projetoId).single();
  if (error || !p) { toast("Erro ao carregar projeto."); return; }
  const { data: priv } = await sb.from("projetos_privado").select("*").eq("projeto_id", projetoId).maybeSingle();
  const pr = priv || {};
  const cliSlug = (p.clientes && p.clientes.slug) || (curCliente && curCliente.slug) || "";
  openModal(
    '<h3>Editar projeto</h3>' +
    field("Nome", "nome", p.nome || "") +
    '<label>Link permanente</label>' +
    '<div class="permalink-row"><span class="permalink-base">/' + esc(cliSlug) + '/</span>' +
    '<input data-k="slug" class="permalink-inp" value="' + escAttr(p.slug || "") + '" spellcheck="false"></div>' +
    '<label>Descrição</label><textarea data-k="descricao" style="min-height:56px">' + esc(p.descricao || "") + '</textarea>' +
    '<label>Status</label><select data-k="status">' +
      '<option value="ativo"' + (p.status === "ativo" ? " selected" : "") + '>Ativo</option>' +
      '<option value="pausado"' + (p.status === "pausado" ? " selected" : "") + '>Pausado</option>' +
      '<option value="concluido"' + (p.status === "concluido" ? " selected" : "") + '>Concluído</option>' +
    '</select>' +
    '<div class="pz-sec-tit" style="margin-top:16px">🔒 Só você (privado)</div>' +
    field("Link da proposta", "proposta_url", pr.proposta_url || "") +
    field("Valor do projeto (R$)", "valor", pr.valor != null ? pr.valor : "") +
    '<label>Notas privadas</label><textarea data-k="notas" style="min-height:60px">' + esc(pr.notas || "") + '</textarea>' +
    actions("Salvar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      const nomeInp = m.querySelector('[data-k="nome"]'), slugInp = m.querySelector('[data-k="slug"]');
      let slugEdited = false;
      slugInp.addEventListener("input", () => { slugEdited = true; });
      slugInp.addEventListener("blur", () => { slugInp.value = slugify(slugInp.value); });
      nomeInp.addEventListener("input", () => { if (!slugEdited) slugInp.value = slugify(nomeInp.value); });
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => (m.querySelector('[data-k="' + k + '"]') || {}).value;
        const nome = get("nome").trim() || p.nome;
        const slugBase = (get("slug") || "").trim() || nome;
        const novoSlug = await uniqueSlugExcept("projetos", slugBase, "cliente_id", p.cliente_id, p.id);
        const upd = { nome, descricao: get("descricao").trim() || null, status: get("status"), slug: novoSlug };
        const { error: ue } = await sb.from("projetos").update(upd).eq("id", p.id);
        if (ue) { toast("Erro: " + ue.message); return; }
        const valorNum = parseFloat(String(get("valor")).replace(/[^\d.,]/g, "").replace(".", "").replace(",", ".")) || null;
        await sb.from("projetos_privado").upsert({ projeto_id: p.id, proposta_url: get("proposta_url").trim() || null, valor: valorNum, notas: get("notas").trim() || null, updated_at: new Date().toISOString() });
        if (curProjeto && curProjeto.id === p.id) {
          curProjeto = Object.assign({}, curProjeto, upd);
          if (curCliente && curCliente.slug && novoSlug) setUrl("/" + curCliente.slug + "/" + novoSlug);
        }
        closeModal();
        toast(novoSlug !== p.slug ? "Projeto e link atualizados." : "Projeto atualizado.");
        route();
      };
    }
  );
}

/* ===== Biblioteca de modelos ===== */
async function abrirBibliotecaModelos() {
  const { data: tpls } = await sb.from("modelos").select("id,titulo,descricao,created_at").eq("tipo", "painel").order("created_at", { ascending: false });
  const lista = (tpls && tpls.length)
    ? tpls.map(t => '<div class="modelo-row" data-id="' + t.id + '">' +
        '<div class="modelo-info"><div class="modelo-nome">📐 ' + esc(t.titulo) + '</div>' +
        (t.descricao ? '<div class="modelo-desc">' + esc(t.descricao) + '</div>' : '') + '</div>' +
        '<button class="lnk del" data-del="' + t.id + '" title="Excluir modelo">🗑</button></div>').join("")
    : '<p class="muted-note">Nenhum modelo salvo. Abra um projeto pelo menu ⋯ e escolha “Gerar modelo”.</p>';
  openModal('<div class="kbm-head"><h3>Biblioteca de modelos</h3><button class="modal-x" onclick="closeModal()">✕</button></div>' +
    '<p class="muted-note" style="font-size:11.5px;margin:0 0 12px;text-transform:none;letter-spacing:0;font-weight:600">Modelos são usados ao criar um novo projeto (campo “Começar com”).</p>' +
    '<div class="modelo-lista">' + lista + '</div>',
    m => {
      m.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
        if (!confirm("Excluir este modelo? Projetos já criados a partir dele não são afetados.")) return;
        const { error } = await sb.from("modelos").delete().eq("id", b.dataset.del);
        if (error) { toast("Erro: " + error.message); return; }
        toast("Modelo excluído."); abrirBibliotecaModelos();
      });
    });
}

/* ===== 8) Abrir um projeto → carregar painel ===== */
async function abrirProjeto(id) {
  const { data, error } = await sb.from("projetos").select("*, clientes(*)").eq("id", id).single();
  if (error) { toast("Erro ao abrir projeto."); return; }
  curProjeto = data;
  curCliente = data.clientes || curCliente;
  if (curCliente && curCliente.slug && data.slug) setUrl("/" + curCliente.slug + "/" + data.slug);
  previewCliente = false; // sempre abre no modo real
  if (isAdmin) {
    canEditReal = true; myMembro = null;
  } else {
    const { data: mb } = await sb.from("membros").select("*").eq("projeto_id", id).eq("pessoa_id", me.id).maybeSingle();
    myMembro = mb || null;
    canEditReal = !!(mb && mb.papel === "gestor");
  }
  canEdit = canEditReal;
  await loadPainel(id);
  histReset(); deviceView = window.innerWidth <= 768 ? "mobile" : "desktop";
  const vis = visibleSpaces();
  curSpaceId = vis.length ? vis[0].id : (state.spaces[0] && state.spaces[0].id) || null;
  subscribeRealtime(id);
  view = "painel"; projTab = "painel"; editMode = false; route();
  recomputeEvolucaoSeAuto();
}

async function loadPainel(projetoId) {
  const { data } = await sb.from("paineis").select("layout").eq("projeto_id", projetoId).maybeSingle();
  state = (data && data.layout && data.layout.spaces) ? data.layout : defaultState();
  migrarResolucao();
}
/* Migra layouts antigos (12 col) para a nova resolução (24 col) — dobra x/y/w/h uma vez */
function migrarResolucao() {
  if (!state || state._res2) return;
  (state.spaces || []).forEach(s => (s.tiles || []).forEach(t => { t.x *= RES; t.y *= RES; t.w *= RES; t.h *= RES; }));
  state._res2 = true;
  if (canEdit) save();
}

function save() {
  if (!canEdit || !curProjeto) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    await sb.from("paineis").upsert({ projeto_id: curProjeto.id, layout: state, updated_at: new Date().toISOString() });
    autoBackup();
  }, 600);
}

/* ===== Histórico (desfazer/refazer), lixeira e backups — Fase C ===== */
let histStack = [], histIdx = -1, _histLock = false, _lastBackup = 0;
function _snap() { return JSON.parse(JSON.stringify(state)); }
function histReset() { histStack = [{ s: _snap(), label: "Estado ao abrir", ts: Date.now() }]; histIdx = 0; updateHistButtons(); }
function pushHist(label) {
  if (_histLock || !canEdit) return;
  histStack = histStack.slice(0, histIdx + 1);
  histStack.push({ s: _snap(), label: label || "Alteração", ts: Date.now() });
  if (histStack.length > 60) histStack.shift();
  histIdx = histStack.length - 1;
  updateHistButtons();
}
function _restoreHist(i) {
  if (i < 0 || i >= histStack.length) return;
  _histLock = true;
  histIdx = i;
  state = JSON.parse(JSON.stringify(histStack[i].s));
  const vis = visibleSpaces(); if (!vis.find(s => s.id === curSpaceId)) curSpaceId = vis[0] && vis[0].id;
  save(); route(); _histLock = false; updateHistButtons();
}
function undo() { if (histIdx > 0) _restoreHist(histIdx - 1); }
function redo() { if (histIdx < histStack.length - 1) _restoreHist(histIdx + 1); }
function updateHistButtons() {
  const u = $("#undoBtn"), r = $("#redoBtn");
  if (u) u.disabled = histIdx <= 0;
  if (r) r.disabled = histIdx >= histStack.length - 1;
}

async function autoBackup() {
  if (!canEdit || !curProjeto) return;
  if (Date.now() - _lastBackup < 180000) return; // no máx 1 backup automático a cada 3 min
  _lastBackup = Date.now();
  try { await sb.from("paineis_backups").insert({ projeto_id: curProjeto.id, layout: state, label: "auto", criado_por: me.id }); } catch (e) { }
}
async function backupManual() {
  if (!curProjeto) return;
  try { await sb.from("paineis_backups").insert({ projeto_id: curProjeto.id, layout: state, label: "manual", criado_por: me.id }); _lastBackup = Date.now(); toast("✓ Backup criado."); abrirHistorico("backups"); }
  catch (e) { toast("Erro ao criar backup."); }
}

/* Modal Histórico · Lixeira · Backups */
async function abrirHistorico(aba) {
  aba = aba || "hist";
  openModal('<h3>🕘 Histórico</h3>' +
    '<div class="hist-undo"><button class="btn sm" id="hUndo" ' + (histIdx <= 0 ? "disabled" : "") + '>↶ Desfazer</button>' +
    '<button class="btn sm" id="hRedo" ' + (histIdx >= histStack.length - 1 ? "disabled" : "") + '>Refazer ↷</button></div>' +
    '<div class="rep-tabs"><button class="rep-tab" data-h="hist">Alterações</button><button class="rep-tab" data-h="lixeira">🗑 Lixeira</button><button class="rep-tab" data-h="backups">💾 Backups</button></div>' +
    '<div id="histBody"></div>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn primary" data-x>Fechar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("#hUndo").onclick = () => { undo(); abrirHistorico("hist"); };
      m.querySelector("#hRedo").onclick = () => { redo(); abrirHistorico("hist"); };
      const setAba = a => { m.querySelectorAll(".rep-tab").forEach(b => b.classList.toggle("on", b.dataset.h === a)); renderHistBody(a, m.querySelector("#histBody")); };
      m.querySelectorAll(".rep-tab").forEach(b => b.onclick = () => setAba(b.dataset.h));
      setAba(aba);
    });
}
function renderHistBody(aba, box) {
  if (aba === "hist") {
    const items = histStack.map((h, i) => '<div class="hist-item' + (i === histIdx ? " on" : "") + '" onclick="_restoreHist(' + i + ');abrirHistorico(\'hist\')"><span class="hist-dot"></span><div class="hist-b"><div class="hist-l">' + esc(h.label) + '</div><div class="hist-t">' + fmtRel(h.ts) + (i === histIdx ? ' · atual' : '') + '</div></div></div>').reverse().join("");
    box.innerHTML = '<div class="hist-list">' + (items || '<p class="muted-note">Sem alterações nesta sessão.</p>') + '</div>';
  } else if (aba === "lixeira") {
    const tr = state.trash || [];
    box.innerHTML = '<div class="hist-list">' + (tr.length ? tr.map((d, i) => {
      const w = WIDGETS[d.tile && d.tile.type]; const nome = (w ? w.emoji + " " + w.name : "Widget");
      return '<div class="hist-item"><div class="hist-b"><div class="hist-l">' + esc(nome) + '</div><div class="hist-t">de "' + esc(d.space || "") + '" · ' + fmtRel(d.at) + '</div></div><div class="lix-acts"><button class="lnk" onclick="recuperarLixo(' + i + ')">recuperar</button><button class="lnk del" onclick="apagarLixo(' + i + ')">apagar</button></div></div>';
    }).join("") : '<p class="muted-note">Lixeira vazia. Widgets que você excluir aparecem aqui pra recuperar.</p>') + '</div>';
  } else {
    box.innerHTML = '<div class="hist-undo" style="margin-bottom:10px"><button class="btn sm primary" onclick="backupManual()">💾 Criar backup agora</button></div><div class="hist-list"><p class="muted-note">Carregando…</p></div>';
    sb.from("paineis_backups").select("id,label,created_at,criado_por,pessoas:pessoas!criado_por(nome)").eq("projeto_id", curProjeto.id).order("created_at", { ascending: false }).then(({ data }) => {
      const list = data || [];
      const html = list.length ? list.map(b => '<div class="hist-item"><div class="hist-b"><div class="hist-l">' + (b.label === "manual" ? "💾 Manual" : "🔄 Automático") + '</div><div class="hist-t">' + fmtRel(b.created_at) + (b.pessoas && b.pessoas.nome ? ' · ' + esc(b.pessoas.nome) : '') + '</div></div><button class="btn sm" onclick="restaurarBackup(\'' + b.id + '\')">restaurar</button></div>').join("") : '<p class="muted-note">Nenhum backup ainda. Eles são criados automaticamente conforme você edita.</p>';
      const lb = box.querySelector(".hist-list"); if (lb) lb.innerHTML = html;
    });
  }
}
function recuperarLixo(i) {
  const tr = state.trash || []; const d = tr[i]; if (!d) return;
  const sp = space(); const t = d.tile; t.id = uid(); t.x = 0; t.y = bottomRow();
  sp.tiles.push(t); tr.splice(i, 1);
  save(); pushHist("Recuperou widget"); route(); closeModal();
  toast("Widget recuperado.");
}
async function apagarLixo(i) {
  if (!(await confirmDialog("Apagar definitivamente este item da lixeira?"))) return;
  (state.trash || []).splice(i, 1); save(); abrirHistorico("lixeira");
}
async function restaurarBackup(id) {
  if (!(await confirmDialog("Restaurar este backup? O painel atual será substituído (mas vira um novo ponto no histórico)."))) return;
  const { data } = await sb.from("paineis_backups").select("layout").eq("id", id).single();
  if (!data) { toast("Backup não encontrado."); return; }
  state = data.layout; const vis = visibleSpaces(); curSpaceId = vis[0] && vis[0].id;
  save(); pushHist("Restaurou backup"); route(); closeModal(); toast("✓ Backup restaurado.");
}

/* Dropdown para trocar de projeto (admin: do cliente atual; cliente: seus projetos) — itens 6 */
async function abrirSwitchProjeto(ev) {
  if (ev) ev.stopPropagation();
  const existing = document.getElementById("projSwitch");
  if (existing) { existing.remove(); document.removeEventListener("click", _closeSwitchOutside, true); return; }
  let projetos = [];
  if (isAdmin && !previewCliente && curCliente) {
    const { data } = await sb.from("projetos").select("id,nome,status").eq("cliente_id", curCliente.id).order("created_at");
    projetos = data || [];
  } else {
    const { data } = await sb.from("membros").select("projetos(id,nome,status,cliente_id)").eq("pessoa_id", me.id);
    projetos = (data || []).map(m => m.projetos).filter(Boolean);
  }
  const ativos = projetos.filter(p => p.status === "ativo");
  const outros = projetos.filter(p => p.status !== "ativo");
  const item = p => '<div class="ps-item' + (curProjeto && p.id === curProjeto.id ? " on" : "") + '" onclick="abrirProjeto(\'' + p.id + '\')"><span class="ps-dot ' + (p.status === "ativo" ? "ativo" : "pausado") + '"></span><span class="ps-nome">' + esc(p.nome) + '</span><span class="ps-st">' + esc(p.status) + '</span></div>';
  let html = "";
  if (ativos.length) html += '<div class="ps-head">Ativos</div>' + ativos.map(item).join("");
  if (outros.length) html += '<div class="ps-head">Concluídos / pausados</div>' + outros.map(item).join("");
  if (!projetos.length) html = '<p class="muted-note" style="padding:12px">Nenhum outro projeto.</p>';
  const panel = document.createElement("div");
  panel.id = "projSwitch"; panel.className = "proj-switch";
  panel.innerHTML = html;
  document.body.appendChild(panel);
  const cr = $("#crumb").getBoundingClientRect();
  panel.style.top = (cr.bottom + 8) + "px";
  panel.style.left = Math.min(cr.left, window.innerWidth - 280) + "px";
  setTimeout(() => document.addEventListener("click", _closeSwitchOutside, true), 0);
}
function _closeSwitchOutside(e) {
  const panel = document.getElementById("projSwitch");
  if (panel && !panel.contains(e.target) && !e.target.closest(".cr-switch")) {
    panel.remove(); document.removeEventListener("click", _closeSwitchOutside, true);
  }
}

/* Editar projeto (nome, status, evolução) — canEdit */
async function editarProjeto() {
  if (!curProjeto || !canEdit) return;
  const p = curProjeto;
  const { data: priv } = await sb.from("projetos_privado").select("*").eq("projeto_id", p.id).maybeSingle();
  const pr = priv || {};
  const entregas = (p.dados && p.dados.entregas) || [];
  const entregasTxt = entregas.map(e => (e.nome || "") + " | " + (e.data || "")).join("\n");
  const entreguesHtml = entregas.length ? '<label style="margin-top:8px;font-size:11.5px">Marcar entregue ✓ (conta na evolução)</label><div id="entregasChk" class="entregas-chk">' +
    entregas.map(e => '<label class="ent-row"><input type="checkbox" data-ent="' + escAttr((e.nome || "").toLowerCase()) + '"' + (e.entregue ? " checked" : "") + '> ' + esc(e.nome || "") + '</label>').join("") + '</div>' : '';
  const baseUrl = (curCliente && curCliente.slug) ? curCliente.slug : "";
  openModal('<h3>Editar projeto</h3>' +
    field("Nome", "nome", p.nome || "") +
    '<label>Link permanente</label>' +
    '<div class="permalink-row"><span class="permalink-base">/' + esc(baseUrl) + '/</span>' +
    '<input data-k="slug" class="permalink-inp" value="' + escAttr(p.slug || "") + '" spellcheck="false"></div>' +
    '<p class="muted-note" style="font-size:11px;margin:3px 0 8px;text-transform:none;letter-spacing:0;font-weight:600">Sincroniza com o nome enquanto você não editar o link manualmente. Ao salvar, o endereço do projeto muda — links antigos deixam de funcionar.</p>' +
    '<label>Descrição</label><textarea data-k="descricao">' + esc(p.descricao || "") + '</textarea>' +
    '<label>Status</label><select data-k="status"><option value="ativo"' + (p.status === "ativo" ? " selected" : "") + '>Ativo</option><option value="pausado"' + (p.status === "pausado" ? " selected" : "") + '>Pausado</option><option value="concluido"' + (p.status === "concluido" ? " selected" : "") + '>Concluído</option></select>' +
    '<label>Evolução: <b id="evoLbl">' + (p.progresso || 0) + '%</b></label><input type="range" min="0" max="100" step="5" data-k="progresso" id="evoSlider" value="' + (p.progresso || 0) + '" style="width:100%" oninput="document.getElementById(\'evoLbl\').textContent=this.value+\'%\'">' +
    '<label class="pz-toggle" style="margin-top:6px"><input type="checkbox" id="autoEvo"' + ((p.dados && p.dados.auto_evolucao) ? " checked" : "") + '> Calcular automaticamente pelas tarefas concluídas (checklists, Kanban, marcos, próximos passos, aprovações, questionários, entregas e metas)</label>' +
    '<div class="pz-sec-tit" style="margin-top:16px">Tarefas <span class="muted-note" style="text-transform:none;letter-spacing:0;font-weight:600;font-size:11px">(o cliente vê)</span></div>' +
    '<p class="muted-note" style="font-size:11.5px;margin:2px 0 6px;text-transform:none;letter-spacing:0;font-weight:600">Uma por linha: <b>nome | AAAA-MM-DD</b></p>' +
    '<textarea data-k="entregas" placeholder="Logo final | 2026-07-10\nSite no ar | 2026-08-01" style="min-height:70px;font-family:var(--font-mono);font-size:12.5px">' + esc(entregasTxt) + '</textarea>' +
    entreguesHtml +
    '<div class="pz-sec-tit" style="margin-top:16px">🔒 Só você (privado)</div>' +
    field("Link da proposta", "proposta_url", pr.proposta_url || "") +
    field("Valor do projeto (R$)", "valor", pr.valor != null ? pr.valor : "") +
    '<label>Notas privadas</label><textarea data-k="notas" style="min-height:60px">' + esc(pr.notas || "") + '</textarea>' +
    actions("Salvar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      const autoChk = m.querySelector("#autoEvo"), slider = m.querySelector("#evoSlider");
      const applyAuto = () => { slider.disabled = autoChk.checked; slider.style.opacity = autoChk.checked ? ".4" : "1"; };
      autoChk.onchange = applyAuto; applyAuto();
      // Permalink estilo WordPress: segue o nome até o usuário editar o link manualmente
      const nomeInp = m.querySelector('[data-k="nome"]'), slugInp = m.querySelector('[data-k="slug"]');
      let slugEdited = false;
      slugInp.addEventListener("input", () => { slugEdited = true; });
      slugInp.addEventListener("blur", () => { slugInp.value = slugify(slugInp.value); });
      nomeInp.addEventListener("input", () => { if (!slugEdited) slugInp.value = slugify(nomeInp.value); });
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => (m.querySelector('[data-k="' + k + '"]') || {}).value;
        const entregueSet = new Set(Array.from(m.querySelectorAll("#entregasChk [data-ent]")).filter(x => x.checked).map(x => x.dataset.ent));
        const ents = (get("entregas") || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]).map(a => ({ nome: a[0], data: a[1] || "", entregue: entregueSet.has(a[0].toLowerCase()) }));
        const auto = autoChk.checked;
        const dados = Object.assign({}, p.dados || {}, { entregas: ents, auto_evolucao: auto });
        // se auto, recalcula já; senão usa o slider
        curProjeto.dados = dados;
        const progresso = auto ? await computeAutoEvolucao() : (parseInt(get("progresso")) || 0);
        const nome = get("nome").trim() || p.nome;
        const slugBase = (get("slug") || "").trim() || nome;
        const novoSlug = await uniqueSlugExcept("projetos", slugBase, "cliente_id", p.cliente_id, p.id);
        const upd = { nome, descricao: get("descricao").trim() || null, status: get("status"), progresso, dados, slug: novoSlug };
        const { error } = await sb.from("projetos").update(upd).eq("id", p.id);
        if (error) { toast("Erro: " + error.message); return; }
        const valorNum = parseFloat(String(get("valor")).replace(/[^\d.,]/g, "").replace(".", "").replace(",", ".")) || null;
        await sb.from("projetos_privado").upsert({ projeto_id: p.id, proposta_url: get("proposta_url").trim() || null, valor: valorNum, notas: get("notas").trim() || null, updated_at: new Date().toISOString() });
        curProjeto = Object.assign({}, curProjeto, upd);
        if (curCliente && curCliente.slug && novoSlug) setUrl("/" + curCliente.slug + "/" + novoSlug);
        closeModal();
        if (novoSlug !== p.slug) toast("Projeto e link atualizados.");
        route();
      };
    });
}

/* ===== 9) Projeto: sub-nav (Painel · Gestão · Mensagens) ===== */
function renderProjeto(canvas, hint) {
  const c = curCliente;
  const fromInterno = c && c.is_interno;
  if (isAdmin) {
    if (fromInterno) {
      $("#crumb").innerHTML =
        '<a class="cr-link" onclick="irMeusProjetos()">Meus Projetos</a><span class="cr-sep">›</span>' +
        '<span class="cr-cur cr-switch" onclick="abrirSwitchProjeto(event)">' + esc(curProjeto.nome) + ' ▾</span>';
    } else {
      $("#crumb").innerHTML =
        '<a class="cr-link" onclick="irConsole()">Clientes</a><span class="cr-sep">›</span>' +
        '<a class="cr-link" onclick="abrirCliente(\'' + c.id + '\')">' + esc(c.empresa || c.nome) + '</a><span class="cr-sep">›</span>' +
        '<span class="cr-cur cr-switch" onclick="abrirSwitchProjeto(event)">' + esc(curProjeto.nome) + ' ▾</span>';
    }
  } else {
    // cliente: nome do cliente > projeto (com troca de projetos) — item 6
    $("#crumb").innerHTML = (c ? '<span class="cr-link" style="cursor:default">' + esc(c.empresa || c.nome) + '</span><span class="cr-sep">›</span>' : '') +
      '<span class="cr-cur cr-switch" onclick="abrirSwitchProjeto(event)">' + esc(curProjeto.nome) + ' ▾</span>';
  }

  const tabs = [];
  if (canEdit) tabs.push(["admin", menuLabel("admin")]);
  tabs.push(["painel", menuLabel("painel")]);
  tabs.push([canEdit ? "gestao" : "materiais", menuLabel("materiais")]);
  tabs.push(["aprovacoes", menuLabel("aprovacoes")], ["questionarios", menuLabel("questionarios")],
    ["reunioes", menuLabel("reunioes")], ["mensagens", menuLabel("mensagens")]);
  tabs.push(["participantes", menuLabel("participantes")]);
  const sn = $("#subnav"); sn.style.display = "flex";
  sn.innerHTML = tabs.map(([k, l]) =>
    '<button class="sntab' + (projTab === k ? " on" : "") + '" onclick="setProjTab(\'' + k + '\')">' + l + '</button>').join("") +
    (canEdit ? '<button class="sntab sn-edit" title="Renomear menus deste cliente" onclick="renomearMenus()">🏷</button>' : "");

  // Abas de conteúdo: card flutuante com cantos arredondados sobre o fundo do projeto
  if (projTab !== "painel" && projTab !== "admin") hint.className = "empty-hint proj-content";

  if (projTab === "gestao" && canEdit) return renderGestao(canvas, hint);
  if (projTab === "materiais") return renderMateriais(canvas, hint);
  if (projTab === "aprovacoes") return renderAprovacoes(canvas, hint);
  if (projTab === "questionarios") return renderQuestionarios(canvas, hint);
  if (projTab === "reunioes") return renderReunioes(canvas, hint);
  if (projTab === "mensagens") return renderMensagens(canvas, hint);
  if (projTab === "participantes") return renderParticipantes(canvas, hint);
  if (projTab === "admin" && !canEdit) { projTab = "painel"; } // cliente nunca acessa Admin
  return renderPainel(canvas, hint);
}
function setProjTab(t) {
  projTab = t;
  if (t === "painel" || t === "admin") {
    const list = spacesFor(t === "admin" ? "interno" : "shared");
    curSpaceId = list.length ? list[0].id : null;
  }
  route();
}

/* Admin alterna entre o modo real e a prévia "como o cliente vê" */
function setPreviewCliente(on) {
  previewCliente = !!on;
  canEdit = canEditReal && !previewCliente;
  editMode = false;
  if (previewCliente && projTab === "admin") projTab = "painel"; // cliente não tem aba Admin
  if (projTab === "painel" || projTab === "admin") {
    const list = spacesFor(projTab === "admin" ? "interno" : "shared");
    curSpaceId = list.length ? list[0].id : null;
  }
  route();
}

/* ===== 9b) Render do painel (grid de widgets) ===== */
function renderPainel(canvas, hint) {
  const ctx = panelCtx();
  let list = spacesFor(ctx);
  /* Garante ao menos uma aba no contexto atual */
  if (!list.length && canEdit) {
    const ns = ctx === "interno"
      ? { id: uid(), name: "Admin", visibility: "interno", tiles: [] }
      : { id: uid(), name: "Painel", visibility: "compartilhado", tiles: [] };
    state.spaces.push(ns); save(); list = [ns];
  }
  let cur = list.find(s => s.id === curSpaceId) || list[0] || null;
  curSpaceId = cur ? cur.id : null;

  const spTabs = $("#spaceTabs");
  /* Mostra a barra de abas se há mais de uma no contexto OU se admin pode gerenciar */
  if (list.length > 1 || canEdit) {
    spTabs.style.display = "block";
    const tabsHtml = '<div class="space-tabs">' +
      list.map(s =>
        '<button class="space-tab' + (cur && s.id === cur.id ? " on" : "") + '"' + (canEdit ? ' data-sid="' + s.id + '"' : '') + ' onclick="setSpace(\'' + s.id + '\')">' + esc(s.name) + '</button>'
      ).join("") +
      (canEdit ? '<button class="space-tab sp-add" title="Adicionar aba" onclick="addSpace()">＋ Aba</button>' : '') +
      '</div>';
    const ctrlHtml = canEdit && cur
      ? '<div class="space-ctrl"><span class="space-ctrl-label">' +
        (ctx === "interno" ? "🔒 só você · " : "👁 cliente vê · ") + esc(cur.name) + '</span>' +
        '<button class="lnk" onclick="editarSpace(\'' + cur.id + '\')">✏ renomear</button>' +
        '<button class="lnk" onclick="duplicarSpace(\'' + cur.id + '\')">⧉ duplicar</button>' +
        (list.length > 1 ? '<button class="lnk del" onclick="deletarSpace(\'' + cur.id + '\')">excluir aba</button>' : '') +
        '</div>'
      : '';
    spTabs.innerHTML = tabsHtml + ctrlHtml;
    if (canEdit) attachTabReorder();
  }

  canvas.style.display = "grid";
  const tiles = cur ? cur.tiles : [];
  if (!tiles.length) {
    hint.style.display = "block";
    hint.textContent = canEdit ? "Aba vazia — clique em ＋ Adicionar." : "Nada por aqui ainda.";
  } else hint.style.display = "none";

  // Em mobile: renderiza na ordem vertical correta (DOM order = visual order na coluna única)
  const renderTiles = isMobileCanvas()
    ? [...tiles].sort((a, b) => { const pa = tilePos(a), pb = tilePos(b); return (pa.y * 1000 + pa.x) - (pb.y * 1000 + pb.x); })
    : tiles;

  renderTiles.forEach(t => {
    const W = WIDGETS[t.type]; if (!W) return;
    const tile = document.createElement("div"); tile.className = "tile"; tile.dataset.id = t.id;
    const tl = tilePos(t);
    tile.style.setProperty("--gc", (tl.x * SUB + 1) + " / span " + (tl.w * SUB));
    tile.style.setProperty("--gr", (tl.y * SUB + 1) + " / span " + (tl.h * SUB));
    tile.style.setProperty("--gh", tl.h * SUB);
    const card = document.createElement("div"); card.className = "card";
    const content = document.createElement("div"); content.className = "content";
    try { W.render(t, content); } catch (e) { content.textContent = "Erro no widget."; }
    card.appendChild(content);
    if (editMode) {
      const bar = document.createElement("div"); bar.className = "tbar";
      bar.innerHTML = '<span class="tgrip" title="Arrastar para mover">⠿</span><button title="Configurar">⚙</button><button title="Duplicar / Mover para aba">⧉</button><button title="Excluir">✕</button>';
      bar.children[1].onclick = e => { e.stopPropagation(); widgetSettings(t); };
      bar.children[2].onclick = e => { e.stopPropagation(); abrirMenuWidget(e, t); };
      bar.children[3].onclick = e => { e.stopPropagation(); removeTile(t.id); };
      card.appendChild(bar);
      const h = document.createElement("div"); h.className = "thandle"; card.appendChild(h);
      enableDrag(tile, card, t); enableResize(tile, h, t);
    } else {
      if (!W.noComment) {
        const cbtn = document.createElement("button");
        cbtn.className = "cmt-btn"; cbtn.dataset.wid = t.id; cbtn.title = "Comentários";
        cbtn.innerHTML = '💬<span class="cmt-badge" style="display:none"></span>';
        cbtn.onclick = e => { e.stopPropagation(); abrirComentariosPainel(t.id); };
        card.appendChild(cbtn);
      }
    }
    if (canEdit) tile.oncontextmenu = e => { e.preventDefault(); abrirMenuWidget(e, t); };
    tile.appendChild(card); canvas.appendChild(tile);
  });
  if (!editMode) { decorateItemComments(); refreshComentarioMarcadores(tiles.map(t => t.id)); }
  setupCanvasPan();
  updateEntregasMeter();
}

/* ===== 10) Edição de widgets (admin/gestor) ===== */
function addWidget(type) {
  const W = WIDGETS[type]; if (!W) return;
  const sp = space();
  const dbottom = sp.tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0); // fundo desktop sempre
  const t = { id: uid(), type, x: 0, y: dbottom, w: W.w * RES, h: W.h * RES, props: JSON.parse(JSON.stringify(W.defaults || {})) };
  if (deviceView !== "desktop") {
    // Também cria posição inicial para o device atual
    if (!sp._layouts) sp._layouts = {};
    if (!sp._layouts[deviceView]) sp._layouts[deviceView] = {};
    sp._layouts[deviceView][t.id] = { x: 0, y: bottomRow(), w: W.w * RES, h: W.h * RES };
  }
  sp.tiles.push(t); save(); pushHist("Adicionou " + (W.name || "widget")); route();
}
function bottomRow() { return space().tiles.reduce((m, t) => { const p = tilePos(t); return Math.max(m, p.y + p.h); }, 0); }
async function removeTile(id) {
  if (!(await confirmDialog("Excluir este widget?"))) return;
  const sp = space(); const t = sp.tiles.find(x => x.id === id);
  if (t) { state.trash = state.trash || []; state.trash.unshift({ tile: JSON.parse(JSON.stringify(t)), space: sp.name, at: Date.now() }); if (state.trash.length > 40) state.trash.pop(); }
  sp.tiles = sp.tiles.filter(x => x.id !== id);
  if (sp._layouts) { ["mobile","tablet"].forEach(lk => { if (sp._layouts[lk]) delete sp._layouts[lk][id]; }); }
  save(); pushHist("Removeu widget"); route();
}

function isMobileCanvas() {
  return deviceView === "mobile" || window.innerWidth <= 768;
}
// Retorna o tamanho da SUB-célula (1/SUB de célula lógica) para snap fino de 0,5
function cellSize() { const c = $("#canvas"); const gap = 14; const N = COLS * SUB; const w = (c.clientWidth - gap * (N - 1)) / N; return { w, h: 17, gap }; }
// Arredonda para o múltiplo de 0,5 lógico mais próximo a partir de um deslocamento em px
function snapSteps(deltaPx, cellPx, gap) { return Math.round(deltaPx / (cellPx + gap)) / SUB; }
/* Reflow com posMap (device-aware): empurra tiles para baixo para não sobrepor o fixed */
function reflowPushMap(tiles, fixed, posMap) {
  const others = tiles.filter(t => t !== fixed).sort((a, b) => posMap[a.id].y - posMap[b.id].y || posMap[a.id].x - posMap[b.id].x);
  const placed = [fixed];
  for (const t of others) {
    const { x: tx, w: tw, h: th } = posMap[t.id];
    let y = posMap[t.id].y, moved = true, guard = 0;
    while (moved && guard++ < 120) {
      moved = false;
      for (const q of placed) {
        const qp = posMap[q.id];
        if (tx < qp.x + qp.w && tx + tw > qp.x && y < qp.y + qp.h && y + th > qp.y) { y = qp.y + qp.h; moved = true; }
      }
    }
    posMap[t.id] = { ...posMap[t.id], y }; placed.push(t);
  }
}
/* Reflow tratando um GRUPO de tiles como fixo (movem juntos); empurra os demais para baixo */
function reflowPushGroup(tiles, fixedIds, posMap) {
  const others = tiles.filter(t => !fixedIds.has(t.id)).sort((a, b) => posMap[a.id].y - posMap[b.id].y || posMap[a.id].x - posMap[b.id].x);
  const placed = tiles.filter(t => fixedIds.has(t.id));
  for (const t of others) {
    const { x: tx, w: tw, h: th } = posMap[t.id];
    let y = posMap[t.id].y, moved = true, guard = 0;
    while (moved && guard++ < 200) {
      moved = false;
      for (const q of placed) {
        const qp = posMap[q.id];
        if (tx < qp.x + qp.w && tx + tw > qp.x && y < qp.y + qp.h && y + th > qp.y) { y = qp.y + qp.h; moved = true; }
      }
    }
    posMap[t.id] = { ...posMap[t.id], y }; placed.push(t);
  }
}
/* Reaplica o destaque visual da seleção após um route() */
function applySelectionHighlight() {
  if (!_selectedTiles || _selectedTiles.size < 2) return;
  document.querySelectorAll("#canvas .tile").forEach(el => el.classList.toggle("selected", _selectedTiles.has(el.dataset.id)));
}
function enableDrag(tile, card, t) {
  card.addEventListener("pointerdown", e => {
    if (!editMode) return;
    const onGrip = !!e.target.closest(".tgrip");
    const partOfSelection = _selectedTiles.size > 1 && _selectedTiles.has(t.id);
    const onInteractive = !!e.target.closest("input,textarea,select,button,a,[contenteditable],.kb-card,.lnk,.poll-opt");
    // Arrasta se: pegou o grip ⠿, OU é parte de uma seleção múltipla e não clicou num elemento interativo
    if (!onGrip && !(partOfSelection && !onInteractive)) return;
    e.preventDefault();
    const tiles = space().tiles;
    const els = {}; document.querySelectorAll("#canvas .tile").forEach(el => els[el.dataset.id] = el);
    const cvs = document.getElementById("canvas");
    // Grupo: se o tile arrastado faz parte de uma multi-seleção, movem todos juntos.
    // Caso contrário, limpa a seleção e arrasta só este.
    const isGroup = _selectedTiles.size > 1 && _selectedTiles.has(t.id);
    if (!isGroup) {
      _selectedTiles.clear();
      document.querySelectorAll("#canvas .tile.selected").forEach(el => el.classList.remove("selected"));
    }
    const groupIds = isGroup
      ? new Set([..._selectedTiles].filter(id => tiles.some(x => x.id === id)))
      : new Set([t.id]);
    tile.classList.add("dragging"); card.setPointerCapture(e.pointerId);
    if (isGroup) groupIds.forEach(id => { const el = els[id]; if (el) el.classList.add("dragging"); });

    // Modo mobile (frame dev-mobile no desktop OU tela real ≤768px)
    const mobileMode = isMobileCanvas();
    if (mobileMode) {
      const sorted = [...tiles].sort((a, b) => { const pa = tilePos(a), pb = tilePos(b); return (pa.y * 1000 + pa.x) - (pb.y * 1000 + pb.x); });
      let newOrder = [...sorted];
      const dropLine = document.createElement("div"); dropLine.className = "drop-line"; cvs.appendChild(dropLine);
      const mv = ev => {
        const oth = sorted.filter(x => x.id !== t.id);
        let ins = oth.length;
        for (let i = 0; i < oth.length; i++) {
          const el = els[oth[i].id]; if (!el) continue;
          const r = el.getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { ins = i; break; }
        }
        const ord = [...oth]; ord.splice(ins, 0, t); newOrder = ord;
        newOrder.forEach((x, i) => { const el = els[x.id]; if (el) el.style.order = i; });
        const cr = cvs.getBoundingClientRect();
        if (ins < oth.length) {
          const el = els[oth[ins].id];
          if (el) { const r = el.getBoundingClientRect(); dropLine.style.top = (r.top - cr.top) + "px"; dropLine.style.display = "block"; }
        } else if (oth.length > 0) {
          const el = els[oth[oth.length - 1].id];
          if (el) { const r = el.getBoundingClientRect(); dropLine.style.top = (r.bottom - cr.top) + "px"; dropLine.style.display = "block"; }
        }
      };
      const up = () => {
        card.removeEventListener("pointermove", mv); card.removeEventListener("pointerup", up);
        tile.classList.remove("dragging"); dropLine.remove();
        let y = 0; newOrder.forEach(x => { const pos = tilePos(x); saveTilePos(x, { x: 0, y, w: pos.w, h: pos.h }); y += pos.h + 1; });
        save(); pushHist("Moveu widget"); route();
      };
      card.addEventListener("pointermove", mv); card.addEventListener("pointerup", up);
      return;
    }

    // Modo desktop/tablet: reflow com posMap
    const cs = cellSize(); const sx = e.clientX, sy = e.clientY;
    const posMap = {}; tiles.forEach(x => { posMap[x.id] = { ...tilePos(x) }; });
    const origMap = {}; tiles.forEach(x => { origMap[x.id] = { ...posMap[x.id] }; });
    // Limites coletivos do grupo (para clamp ao mover junto)
    const grp = tiles.filter(x => groupIds.has(x.id));
    const gMinX = Math.min(...grp.map(x => origMap[x.id].x));
    const gMaxXe = Math.max(...grp.map(x => origMap[x.id].x + origMap[x.id].w));
    const gMinY = Math.min(...grp.map(x => origMap[x.id].y));
    const applyAll = () => tiles.forEach(x => { const el = els[x.id]; const p = posMap[x.id]; if (el) { el.style.setProperty("--gc", (p.x * SUB + 1) + " / span " + (p.w * SUB)); el.style.setProperty("--gr", (p.y * SUB + 1) + " / span " + (p.h * SUB)); } });
    const mv = ev => {
      let dx = snapSteps(ev.clientX - sx, cs.w, cs.gap);
      let dy = snapSteps(ev.clientY - sy, cs.h, cs.gap);
      dx = clamp(dx, -gMinX, COLS - gMaxXe);
      dy = Math.max(dy, -gMinY);
      tiles.forEach(x => { posMap[x.id] = { ...origMap[x.id] }; });
      grp.forEach(x => { posMap[x.id].x = origMap[x.id].x + dx; posMap[x.id].y = origMap[x.id].y + dy; });
      reflowPushGroup(tiles, groupIds, posMap);
      applyAll();
    };
    const up = () => {
      card.removeEventListener("pointermove", mv); card.removeEventListener("pointerup", up);
      tile.classList.remove("dragging");
      groupIds.forEach(id => { const el = els[id]; if (el) el.classList.remove("dragging"); });
      tiles.forEach(x => saveTilePos(x, posMap[x.id]));
      save(); pushHist(groupIds.size > 1 ? "Moveu " + groupIds.size + " widgets" : "Moveu widget"); route();
      applySelectionHighlight();
    };
    card.addEventListener("pointermove", mv); card.addEventListener("pointerup", up);
  });
}
function enableResize(tile, handle, t) {
  handle.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    const cs = cellSize(); const sx = e.clientX, sy = e.clientY;
    const initPos = { ...tilePos(t) }; // snapshot da posição do device atual
    const ow = initPos.w, oh = initPos.h;
    tile.classList.add("resizing"); handle.setPointerCapture(e.pointerId);
    const mv = ev => {
      const nw = clamp(ow + snapSteps(ev.clientX - sx, cs.w, cs.gap), 0.5, COLS - initPos.x);
      const nh = Math.max(0.5, oh + snapSteps(ev.clientY - sy, cs.h, cs.gap));
      saveTilePos(t, { ...initPos, w: nw, h: nh });
      tile.style.setProperty("--gc", (initPos.x * SUB + 1) + " / span " + (nw * SUB));
      tile.style.setProperty("--gr", (initPos.y * SUB + 1) + " / span " + (nh * SUB));
      tile.style.setProperty("--gh", nh * SUB);
    };
    const up = () => { handle.removeEventListener("pointermove", mv); handle.removeEventListener("pointerup", up); tile.classList.remove("resizing"); save(); pushHist("Redimensionou widget"); };
    handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", up);
  });
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* Menu de contexto (botão direito) nos widgets — item 5 */
function abrirMenuWidget(e, t) {
  const ex = document.getElementById("widgetMenu"); if (ex) ex.remove();
  const spaces = spacesFor(panelCtx()).filter(s => s.id !== curSpaceId);
  let html = '<button class="ctx-it" data-a="editar">✏ Editar</button>' +
    '<button class="ctx-it" data-a="duplicar">⧉ Duplicar</button>';
  if (spaces.length) html += '<div class="ctx-sub-h">Mover para aba</div>' + spaces.map(s => '<button class="ctx-it ctx-mv" data-mv="' + s.id + '">➡ ' + esc(s.name) + '</button>').join("");
  html += '<button class="ctx-it ctx-del" data-a="excluir">🗑 Excluir</button>';
  const menu = document.createElement("div"); menu.id = "widgetMenu"; menu.className = "ctx-menu"; menu.innerHTML = html;
  document.body.appendChild(menu);
  menu.style.left = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8) + "px";
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8) + "px";
  const close = () => { menu.remove(); document.removeEventListener("click", close, true); document.removeEventListener("contextmenu", close, true); };
  menu.querySelectorAll(".ctx-it").forEach(b => b.onclick = () => {
    const a = b.dataset.a, mv = b.dataset.mv; close();
    if (a === "editar") widgetSettings(t);
    else if (a === "duplicar") duplicarTile(t);
    else if (a === "excluir") removeTile(t.id);
    else if (mv) moverTile(t, mv);
  });
  setTimeout(() => { document.addEventListener("click", close, true); document.addEventListener("contextmenu", close, true); }, 0);
}
function duplicarTile(t) {
  const sp = space();
  const nt = JSON.parse(JSON.stringify(t)); nt.id = uid();
  const dbottom = sp.tiles.reduce((m, x) => Math.max(m, x.y + x.h), 0);
  nt.x = 0; nt.y = dbottom;
  if (deviceView !== "desktop") {
    if (!sp._layouts) sp._layouts = {};
    if (!sp._layouts[deviceView]) sp._layouts[deviceView] = {};
    sp._layouts[deviceView][nt.id] = { x: 0, y: bottomRow(), w: tilePos(t).w, h: tilePos(t).h };
  }
  sp.tiles.push(nt); save(); pushHist("Duplicou widget"); route();
}
function moverTile(t, spaceId) {
  const dest = state.spaces.find(s => s.id === spaceId); if (!dest) return;
  space().tiles = space().tiles.filter(x => x.id !== t.id);
  const nt = JSON.parse(JSON.stringify(t)); nt.x = 0; nt.y = (dest.tiles || []).reduce((m, x) => Math.max(m, x.y + x.h), 0);
  dest.tiles = dest.tiles || []; dest.tiles.push(nt);
  save(); pushHist("Moveu para outra aba"); route(); toast('Movido para "' + dest.name + '".');
}

/* Item 4: tarefas concluídas → evolução automática */
function togglePasso(widgetId, key) {
  const t = space().tiles.find(x => x.id === widgetId); if (!t || !canEdit) return;
  const done = new Set(t.props.done || []);
  if (done.has(key)) done.delete(key); else done.add(key);
  t.props.done = [...done];
  save(); recomputeEvolucaoSeAuto(); route();
}
async function computeAutoEvolucao() {
  let done = 0, total = 0;
  // Fontes do banco: checklists (itens), aprovações (aprovado), questionários (fechado)
  const [chs, aps, qz] = await Promise.all([
    sb.from("checklists").select("checklist_itens(concluido)").eq("projeto_id", curProjeto.id),
    sb.from("aprovacoes").select("status").eq("projeto_id", curProjeto.id),
    sb.from("questionarios").select("status").eq("projeto_id", curProjeto.id),
  ]);
  (chs.data || []).forEach(c => (c.checklist_itens || []).forEach(i => { total++; if (i.concluido) done++; }));
  (aps.data || []).forEach(a => { total++; if (a.status === "aprovado") done++; });
  (qz.data || []).forEach(q => { total++; if (q.status && q.status !== "aberto") done++; });
  // Entregas (projetos.dados.entregas): marcadas como entregue
  ((curProjeto.dados && curProjeto.dados.entregas) || []).forEach(e => { total++; if (e.entregue) done++; });
  // Fontes nos widgets do layout
  (state.spaces || []).forEach(s => (s.tiles || []).forEach(t => {
    if (t.type === "kanban") {
      if (t.props.columns) {
        t.props.columns.forEach(col => { const dcol = /feito|conclu|done|pronto/i.test(col.nome || ""); (col.cards || []).forEach(() => { total++; if (dcol) done++; }); });
      } else {
        parseKanban(t.props.raw).forEach(col => { const dcol = /feito|conclu|done|pronto/i.test(col.title); col.cards.forEach(() => { total++; if (dcol) done++; }); });
      }
    } else if (t.type === "marcos") {
      (t.props.raw || "").split("\n").map(l => l.split("|").map(x => x.trim())).filter(a => a.some(x => x)).forEach(a => { total++; if ((a[0] || "").toLowerCase() === "feito") done++; });
    } else if (t.type === "proximos_passos") {
      if (t.props.items) {
        (t.props.items || []).forEach(it => { total++; if (it.done) done++; });
      } else {
        const items = (t.props.raw || "").split("\n").map(l => l.split("|").map(x => x.trim())).filter(a => a[0]);
        const ds = new Set(t.props.done || []);
        items.forEach(a => { total++; if (ds.has(itemKey(a[0]))) done++; });
      }
    } else if (t.type === "progresso") {
      // Metas: cada uma entra como progresso parcial (%/100)
      (t.props.raw || "").split("\n").map(l => l.split("|").map(x => x.trim())).filter(a => a[0]).forEach(a => {
        const pct = Math.max(0, Math.min(100, parseFloat(a[1]) || 0)); total++; done += pct / 100;
      });
    }
  }));
  return total ? Math.round(done / total * 100) : 0;
}
let _evoTimer = null;
function recomputeEvolucaoSeAuto() {
  if (!canEdit || !curProjeto || !(curProjeto.dados && curProjeto.dados.auto_evolucao)) return;
  clearTimeout(_evoTimer);
  _evoTimer = setTimeout(async () => {
    const pct = await computeAutoEvolucao();
    if (pct !== (curProjeto.progresso || 0)) {
      await sb.from("projetos").update({ progresso: pct }).eq("id", curProjeto.id);
      curProjeto.progresso = pct; applyBrand();
    }
  }, 500);
}

/* Arrastar abas para reordenar — item 5 */
function attachTabReorder() {
  let dragId = null;
  document.querySelectorAll('#spaceTabs .space-tab[data-sid]').forEach(el => {
    el.draggable = true;
    el.ondragstart = e => { dragId = el.dataset.sid; el.classList.add("sp-dragging"); e.dataTransfer.effectAllowed = "move"; };
    el.ondragend = () => { dragId = null; el.classList.remove("sp-dragging"); };
    el.ondragover = e => { e.preventDefault(); el.classList.add("sp-over"); };
    el.ondragleave = () => el.classList.remove("sp-over");
    el.ondrop = e => {
      e.preventDefault(); el.classList.remove("sp-over");
      const targetId = el.dataset.sid;
      if (!dragId || dragId === targetId) return;
      const arr = state.spaces;
      const from = arr.findIndex(s => s.id === dragId), to = arr.findIndex(s => s.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = arr.splice(from, 1); arr.splice(to, 0, moved);
      save(); pushHist("Reordenou abas"); route();
    };
  });
}

function widgetSettings(t) {
  const W = WIDGETS[t.type];
  openModal('<h3>' + W.emoji + ' ' + esc(W.name) + '</h3>' + W.form(t.props) +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = () => {
        m.querySelectorAll("[data-k]").forEach(el => { t.props[el.dataset.k] = el.value; });
        save(); pushHist("Editou widget"); recomputeEvolucaoSeAuto(); route(); closeModal();
      };
    });
}
function openPicker() {
  openModal('<h3>Adicionar widget</h3><div class="pick-grid">' +
    Object.keys(WIDGETS).filter(k => !WIDGETS[k].hidden).map(k => { const W = WIDGETS[k]; return '<div class="pick-card" data-t="' + k + '"><div class="pick-emoji">' + W.emoji + '</div><div class="pick-name">' + esc(W.name) + '</div><div class="pick-desc">' + esc(W.desc) + '</div></div>'; }).join("") +
    '</div>', m => { m.querySelectorAll(".pick-card").forEach(el => el.onclick = () => { addWidget(el.dataset.t); closeModal(); }); });
}

/* ===== 10b) Gestão de espaços (abas de painel) ===== */
function setSpace(id) { curSpaceId = id; route(); }

function addSpace() {
  const ctx = panelCtx();
  openModal('<h3>Nova aba</h3>' + field("Nome", "nome", "") +
    '<p class="muted-note" style="font-size:12px;margin-top:8px">' +
    (ctx === "interno" ? "🔒 Aba privada — só você vê." : "👁 Aba compartilhada — o cliente vê.") + '</p>' + actions("Criar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        if (!nome) { toast("Informe o nome."); return; }
        const ns = { id: uid(), name: nome, visibility: ctx === "interno" ? "interno" : "compartilhado", tiles: [] };
        state.spaces.push(ns); curSpaceId = ns.id;
        save(); pushHist("Nova aba: " + nome); closeModal(); route();
      };
    });
}

function editarSpace(id) {
  const s = (state.spaces || []).find(x => x.id === id); if (!s) return;
  openModal('<h3>Renomear aba</h3>' + field("Nome", "nome", s.name) + actions("Salvar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = () => {
        const nome = m.querySelector('[data-k="nome"]').value.trim();
        if (!nome) { toast("Informe o nome."); return; }
        s.name = nome; save(); pushHist("Renomeou aba"); closeModal(); route();
      };
    });
}

async function deletarSpace(id) {
  if (!(await confirmDialog("Excluir esta aba e todos os widgets nela?"))) return;
  const s = (state.spaces || []).find(x => x.id === id);
  const ctx = s && s.visibility === "interno" ? "interno" : "shared";
  state.spaces = state.spaces.filter(x => x.id !== id);
  const list = spacesFor(ctx);
  curSpaceId = list.length ? list[0].id : null;
  save(); pushHist("Excluiu aba"); route();
}

function duplicarSpace(id) {
  const s = (state.spaces || []).find(x => x.id === id); if (!s) return;
  const ns = JSON.parse(JSON.stringify(s));
  ns.id = uid();
  ns.name = s.name + " (cópia)";
  const idMap = {};
  ns.tiles.forEach(t => { const oldId = t.id; t.id = uid(); idMap[oldId] = t.id; });
  if (ns._layouts) {
    ["mobile","tablet"].forEach(lk => {
      if (!ns._layouts[lk]) return;
      const newLayout = {};
      Object.entries(ns._layouts[lk]).forEach(([oldId, pos]) => { const newId = idMap[oldId]; if (newId) newLayout[newId] = pos; });
      ns._layouts[lk] = newLayout;
    });
  }
  const idx = state.spaces.findIndex(x => x.id === id);
  state.spaces.splice(idx + 1, 0, ns);
  curSpaceId = ns.id;
  save(); pushHist("Duplicou aba: " + s.name); route();
  toast('Aba "' + ns.name + '" criada.');
}

/* ===== 11) Modal helpers ===== */
function openModal(html, after) {
  const m = $("#modal"), s = $("#scrim");
  m.innerHTML = html;
  m.style.display = "block"; s.style.display = "block"; s.onclick = closeModal;
  if (!m.querySelector(".modal-x")) {
    const x = document.createElement("button");
    x.className = "modal-auto-x"; x.textContent = "✕"; x.title = "Fechar";
    x.onclick = closeModal; m.prepend(x);
  }
  if (after) after(m);
}
function closeModal() { $("#modal").style.display = "none"; $("#scrim").style.display = "none"; $("#modal").innerHTML = ""; }

/* Diálogo de confirmação tematizado (substitui confirm()). Camada própria — empilha sobre modais. */
function confirmDialog(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const scrim = document.createElement("div"); scrim.className = "dlg-scrim";
    const box = document.createElement("div"); box.className = "dlg-box";
    box.innerHTML = '<div class="dlg-title">' + esc(opts.title || "Confirmar") + '</div>' +
      '<div class="dlg-msg">' + esc(message) + '</div>' +
      '<div class="dlg-actions"><button class="btn" data-x>' + esc(opts.cancel || "Cancelar") + '</button>' +
      '<button class="btn ' + (opts.danger === false ? "primary" : "danger") + '" data-ok>' + esc(opts.ok || "Confirmar") + '</button></div>';
    document.body.appendChild(scrim); document.body.appendChild(box);
    const done = v => { scrim.remove(); box.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = e => { if (e.key === "Escape") done(false); if (e.key === "Enter") done(true); };
    document.addEventListener("keydown", onKey);
    scrim.onclick = () => done(false);
    box.querySelector("[data-x]").onclick = () => done(false);
    box.querySelector("[data-ok]").onclick = () => done(true);
    box.querySelector("[data-ok]").focus();
  });
}
/* Aviso/erro tematizado não-bloqueante (substitui toast()). */
function toast(message, kind) {
  if (!kind && /^erro/i.test(String(message))) kind = "err";
  let host = document.getElementById("toastHost");
  if (!host) { host = document.createElement("div"); host.id = "toastHost"; document.body.appendChild(host); }
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3400);
}

/* ===== 12) Marca / topo / navegação ===== */
function applyBrand() {
  // Marca do Dojo fixa (a cor agora vem do tema do usuário, não do cliente)
  $("#brandMark").textContent = "◯";
  $("#brandTitle").innerHTML = 'Dojo <span class="brand-thin">Akira</span>';
  $("#roleBadge").textContent = me ? (previewCliente ? "PRÉVIA CLIENTE" : (isAdmin ? "ADMIN" : "CLIENTE")) : "";
  $("#roleBadge").classList.toggle("preview", previewCliente);

  // Identidade do cliente (logo ou nome) — item 5/7
  const cb = $("#clientBrand"), c = curCliente;
  if (c && (view === "cliente" || view === "painel") && !(c.is_interno)) {
    const logo = c.marca && c.marca.logoUrl;
    cb.style.display = "";
    cb.innerHTML = logo
      ? '<img src="' + escAttr(logo) + '" alt="' + escAttr(c.empresa || c.nome) + '">'
      : '<span class="cb-name">' + esc(c.empresa || c.nome) + '</span>';
  } else if (c && c.is_interno && (view === "painel")) {
    cb.style.display = ""; cb.innerHTML = '<span class="cb-name">' + esc(c.empresa || "Meus Projetos") + '</span>';
  } else { cb.style.display = "none"; cb.innerHTML = ""; }

  // Evolução do projeto (% + barra) — item 7
  const pe = $("#projEvo");
  if (view === "painel" && curProjeto) {
    const pr = Math.max(0, Math.min(100, curProjeto.progresso || 0));
    pe.style.display = "";
    pe.innerHTML = '<div class="evo' + (canEdit ? " evo-edit" : "") + '"' + (canEdit ? ' onclick="editarProjeto()" title="Editar evolução"' : ' title="Evolução do projeto"') + '>' +
      '<div class="evo-bar"><i style="width:' + pr + '%"></i></div>' +
      '<div class="evo-meta"><span class="evo-lbl">Tarefas</span><span class="evo-val">' + pr + '%</span></div></div>';
    updateEntregasMeter();
  } else {
    pe.style.display = "none"; pe.innerHTML = "";
    const em = $("#entregasMeter"); if (em) { em.style.display = "none"; em.innerHTML = ""; }
  }
}
function paintTools() {
  const inPainel = view === "painel" && (projTab === "painel" || projTab === "admin");
  $("#adminBtn").style.display = isAdmin ? "" : "none";
  $("#adminBtn").classList.toggle("on", view === "console" && consoleTab === "clientes");
  $("#meusBtn").style.display = isAdmin ? "" : "none";
  $("#meusBtn").classList.toggle("on", view === "console" && consoleTab === "meus-projetos");
  $("#bellBtn").style.display = me ? "" : "none";
  const pv = $("#previewBtn");
  if (pv) {
    pv.style.display = (canEditReal && view === "painel") ? "" : "none";
    pv.classList.toggle("on", previewCliente);
    pv.textContent = previewCliente ? "✕" : "👁";
    pv.title = previewCliente ? "Sair da prévia do cliente" : "Ver como o cliente vê";
  }
  $("#editBtn").style.display = (inPainel && canEdit) ? "" : "none";
  const histOn = inPainel && canEdit;
  $("#histGroup").style.display = histOn ? "" : "none";
  $("#deviceBtn").style.display = (isAdmin && inPainel && window.innerWidth > 900) ? "" : "none";
  applyDevice();
  if (histOn) updateHistButtons();
  $("#addBtn").style.display = (inPainel && canEdit && editMode) ? "" : "none";
  $("#editBtn").classList.toggle("on", editMode);
  $("#editBtn").textContent = editMode ? "✓ Concluir" : "✏ Editar";
  const _ab = $("#authBtn"), _av = me && me.perfil && me.perfil.avatar;
  if (me) _ab.innerHTML = (_av ? '<img class="ab-av" src="' + escAttr(_av) + '">' : '') + esc(me.nome || me.email || "Conta");
  else _ab.textContent = "Entrar";
  document.body.classList.toggle("edit", editMode && inPainel);
}
function irConsole() { unsubscribeRealtime(); previewCliente = false; consoleTab = "clientes"; view = "console"; setUrl("/"); route(); }
function irMeusProjetos() { unsubscribeRealtime(); previewCliente = false; consoleTab = "meus-projetos"; view = "console"; route(); }
function switchConsoleTab(tab) { consoleTab = tab; route(); }

/* ===== Realtime: mensagens, aprovações e comentários ao vivo ===== */
let _rtChannel = null, _rtTimer = null;
function subscribeRealtime(projetoId) {
  unsubscribeRealtime();
  if (!projetoId) return;
  _rtChannel = sb.channel("proj-" + projetoId)
    .on("postgres_changes", { event: "*", schema: "public", table: "mensagens", filter: "projeto_id=eq." + projetoId }, onRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "aprovacoes", filter: "projeto_id=eq." + projetoId }, onRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "comentarios" }, onRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "mural_notas", filter: "projeto_id=eq." + projetoId }, onMuralRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "enquete_votos", filter: "projeto_id=eq." + projetoId }, onEnqueteRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "comentarios_painel", filter: "projeto_id=eq." + projetoId }, onComentarioPainelRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "form_respostas", filter: "projeto_id=eq." + projetoId }, onFormRealtime)
    .subscribe();
}
function unsubscribeRealtime() {
  if (_rtChannel) { sb.removeChannel(_rtChannel); _rtChannel = null; }
  clearTimeout(_rtTimer);
}
function onRealtime() {
  if (view !== "painel") return;
  // só re-renderiza abas que mostram dados ao vivo
  if (!["mensagens", "aprovacoes", "painel"].includes(projTab)) return;
  // não atrapalhar quem está digitando: adia enquanto um campo está focado
  const ae = document.activeElement;
  if (ae && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT" || ae.isContentEditable)) {
    clearTimeout(_rtTimer); _rtTimer = setTimeout(onRealtime, 2500); return;
  }
  clearTimeout(_rtTimer);
  _rtTimer = setTimeout(() => { if (view === "painel") route(); }, 200);
}
/* Mural: recarrega só o widget afetado, sem re-render do painel (preserva foco). */
function onMuralRealtime(payload) {
  if (view !== "painel" || projTab !== "painel") return;
  const wid = (payload.new && payload.new.widget_id) || (payload.old && payload.old.widget_id);
  if (wid && document.getElementById("mural-" + wid)) loadMural(wid);
}
function onEnqueteRealtime(payload) {
  if (view !== "painel" || projTab !== "painel") return;
  const wid = (payload.new && payload.new.widget_id) || (payload.old && payload.old.widget_id);
  if (wid && document.getElementById("poll-" + wid)) loadEnquete(wid);
}
function onComentarioPainelRealtime(payload) {
  if (view !== "painel" || (projTab !== "painel" && projTab !== "admin")) return;
  const ids = [...document.querySelectorAll(".cmt-btn")].map(b => b.dataset.wid);
  if (ids.length) refreshComentarioMarcadores(ids);
  const wid = (payload.new && payload.new.widget_id) || (payload.old && payload.old.widget_id);
  const iref = (payload.new && payload.new.item_ref) || (payload.old && payload.old.item_ref) || null;
  if (_cmtCtx && _cmtCtx.widget === wid && (_cmtCtx.item || null) === iref && document.getElementById("cmtThread")) loadComentariosPainel();
}
function onFormRealtime() {
  if (view !== "painel" || (projTab !== "painel" && projTab !== "admin")) return;
  const ae = document.activeElement;
  document.querySelectorAll('[id^="formw-"]').forEach(el => {
    if (ae && el.contains(ae)) return; // não recarrega enquanto a pessoa preenche
    loadFormularioWidget(el.id.replace("formw-", ""));
  });
}

/* ===== 13) Autenticação ===== */
/* Campos que contam para a barra de completude do perfil */
const PERFIL_CAMPOS = ["nome", "avatar", "cargo", "nascimento", "telefone", "cidade", "uf"];
function perfilPct(p) {
  const o = Object.assign({ nome: me && me.nome }, p || {});
  const ok = PERFIL_CAMPOS.filter(k => o[k] && String(o[k]).trim()).length;
  return Math.round(ok / PERFIL_CAMPOS.length * 100);
}
function abrirPerfil() {
  const p = (me && me.perfil) || {};
  const av = p.avatar || "";
  const ini = (me.nome || me.email || "?").split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase();
  openModal('<h3>👤 Meu perfil</h3>' +
    '<div class="perfil-top"><div class="perfil-av" id="perfilAv">' + (av ? '<img src="' + escAttr(av) + '">' : esc(ini)) + '</div>' +
    '<div style="flex:1"><div class="perfil-nome">' + esc(me.nome || me.email) + '</div><div class="muted-note" style="font-size:12px">' + esc(me.email || "") + ' · ' + (isAdmin ? "Admin" : "Cliente") + '</div>' +
    '<div class="perfil-evo"><div class="evo-bar"><i id="perfilBar" style="width:' + perfilPct(p) + '%"></i></div><span class="evo-pct" id="perfilPctLbl">' + perfilPct(p) + '%</span></div></div></div>' +
    '<label class="btn sm" style="cursor:pointer;display:inline-block;margin-bottom:4px">📷 Foto do avatar<input type="file" id="avUp" accept="image/*" style="display:none"></label> ' +
    '<label class="muted-note" style="display:inline;text-transform:none;letter-spacing:0;font-weight:600;font-size:12px"> ou cole uma URL</label>' +
    field("URL do avatar", "avatar", (av && !String(av).startsWith("data:")) ? av : "") +
    field("Nome", "nome", me.nome || "") +
    field("Cargo", "cargo", p.cargo || "") +
    '<label>Data de nascimento</label><input type="date" data-k="nascimento" value="' + escAttr(p.nascimento || "") + '">' +
    field("Telefone", "telefone", p.telefone || "") +
    '<div style="display:flex;gap:8px"><div style="flex:1">' + field("Cidade", "cidade", p.cidade || "") + '</div><div style="width:90px">' + field("UF", "uf", p.uf || "") + '</div></div>' +
    '<div class="pz-sec-tit" style="margin-top:18px">Senha</div>' +
    '<input type="password" id="pwNew" placeholder="Nova senha (mín. 6)"><input type="password" id="pwConf" placeholder="Repita a nova senha" style="margin-top:8px"><button class="btn sm" id="pwBtn" style="margin-top:8px">🔑 Alterar senha</button><span id="pwMsg" class="muted-note" style="font-size:12px;margin-left:8px"></span>' +
    '<div class="modal-actions"><button class="btn danger" data-out>Sair</button><span class="grow"></span><button class="btn" data-x>Fechar</button><button class="btn primary" data-ok>Salvar perfil</button></div>',
    m => {
      let avData = (av && String(av).startsWith("data:")) ? av : null;
      const recalc = () => {
        const vals = {}; PERFIL_CAMPOS.forEach(k => { const el = m.querySelector('[data-k="' + k + '"]'); if (el) vals[k] = el.value; });
        vals.avatar = avData || (m.querySelector('[data-k="avatar"]') || {}).value;
        const pct = perfilPct(vals);
        m.querySelector("#perfilBar").style.width = pct + "%"; m.querySelector("#perfilPctLbl").textContent = pct + "%";
      };
      m.querySelectorAll("[data-k]").forEach(el => el.oninput = recalc);
      m.querySelector("#avUp").onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 300000) { toast("Imagem grande (máx ~300KB). Use uma URL."); return; } const r = new FileReader(); r.onload = () => { avData = r.result; m.querySelector("#perfilAv").innerHTML = '<img src="' + r.result + '">'; recalc(); }; r.readAsDataURL(f); };
      m.querySelector("#pwBtn").onclick = async () => {
        const a = m.querySelector("#pwNew").value, b = m.querySelector("#pwConf").value, msg = m.querySelector("#pwMsg");
        if (a.length < 6) { msg.textContent = "Mínimo 6 caracteres."; return; }
        if (a !== b) { msg.textContent = "As senhas não conferem."; return; }
        msg.textContent = "Salvando…";
        const { error } = await sb.auth.updateUser({ password: a });
        msg.textContent = error ? "Erro: " + error.message : "✓ Senha alterada!";
        if (!error) { m.querySelector("#pwNew").value = ""; m.querySelector("#pwConf").value = ""; }
      };
      m.querySelector("[data-out]").onclick = async () => { await sb.auth.signOut(); closeModal(); };
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => ((m.querySelector('[data-k="' + k + '"]') || {}).value || "").trim();
        const perfil = { avatar: avData || get("avatar"), cargo: get("cargo"), nascimento: get("nascimento"), telefone: get("telefone"), cidade: get("cidade"), uf: get("uf").toUpperCase() };
        const nome = get("nome") || me.nome;
        const { error } = await sb.rpc("atualizar_meu_perfil", { p_nome: nome, p_perfil: perfil });
        if (error) { toast("Erro: " + error.message); return; }
        me.nome = nome; me.perfil = perfil;
        closeModal(); paintTools(); toast("Perfil salvo.");
      };
    });
}

function authModal() {
  if (me) { abrirPerfil(); return; }
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
  if (!session) { unsubscribeRealtime(); unsubscribeAcessosRealtime(); unsubscribeNotifRealtime(); clearInterval(_pingTimer); me = null; isAdmin = false; view = "login"; route(); return; }
  const { data: pessoa } = await sb.from("pessoas").select("*").eq("id", session.user.id).maybeSingle();
  me = pessoa || { id: session.user.id, email: session.user.email, nome: session.user.email };
  isAdmin = !!(pessoa && pessoa.is_admin);
  if (isAdmin) {
    subscribeAcessosRealtime(); updateBell();
    // Verifica URL primeiro — se há deep link (projeto/cliente), abre direto sem renderizar o console antes
    // (evita race condition: renderConsole async sobrescrevia o projeto já carregado)
    await applyUrlRoute();
    if (view !== "painel" && view !== "cliente") { view = "console"; route(); }
  } else {
    registrarAcesso(); subscribeNotifRealtime(); updateBell();
    await rotaCliente();
    await applyUrlRoute(); // guard de slug no applyUrlRoute evita dupla carga
  }
}

/* ===== Registro de acesso (frequência, último acesso, tempo de sessão) ===== */
let _acessoId = null, _pingTimer = null;
async function registrarAcesso() {
  if (!me || isAdmin) return; // só clientes/equipe; o admin não se rastreia
  try {
    const cutoff = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: recent } = await sb.from("acessos").select("id").eq("pessoa_id", me.id).gte("last_ping", cutoff).order("last_ping", { ascending: false }).limit(1);
    if (recent && recent.length) {
      _acessoId = recent[0].id;
      await sb.from("acessos").update({ last_ping: new Date().toISOString() }).eq("id", _acessoId);
    } else {
      const { data } = await sb.from("acessos").insert({ pessoa_id: me.id }).select("id").single();
      _acessoId = data && data.id;
    }
  } catch (e) { /* silencioso */ }
  clearInterval(_pingTimer);
  _pingTimer = setInterval(() => {
    if (_acessoId && document.visibilityState === "visible") sb.from("acessos").update({ last_ping: new Date().toISOString() }).eq("id", _acessoId);
  }, 120000);
}

/* ===== Sino de avisos (admin): badge + card de acessos ===== */
let _acessosChannel = null, _alertasCache = [];
function subscribeAcessosRealtime() {
  if (_acessosChannel) return;
  _acessosChannel = sb.channel("acessos-admin")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "acessos" }, () => updateBell())
    .subscribe();
}
function unsubscribeAcessosRealtime() { if (_acessosChannel) { sb.removeChannel(_acessosChannel); _acessosChannel = null; } }

const NOTIF_ICON = { mensagem: "💬", aprovacao: "✅", reuniao: "📅", questionario: "📝", material: "📎", etapa: "✔" };

/* Despacha por papel: admin vê acessos; cliente/equipe vê novidades */
function updateBell() { return isAdmin ? updateBellAdmin() : updateBellCliente(); }
function toggleBell() { return isAdmin ? toggleBellAdmin() : toggleBellCliente(); }
function _bellPanel(headHtml, listHtml) {
  const panel = document.createElement("div");
  panel.id = "bellPanel"; panel.className = "bell-panel";
  panel.innerHTML = '<div class="bell-head">' + headHtml + '</div><div class="bell-list">' + listHtml + '</div>';
  document.body.appendChild(panel);
  const r = document.getElementById("bellBtn").getBoundingClientRect();
  panel.style.top = (r.bottom + 6) + "px";
  panel.style.right = Math.max(8, window.innerWidth - r.right) + "px";
  setTimeout(() => document.addEventListener("click", _closeBellOutside, true), 0);
  return panel;
}
function _closeBellOutside(e) {
  const panel = document.getElementById("bellPanel");
  if (panel && !panel.contains(e.target) && e.target.id !== "bellBtn") {
    panel.remove(); document.removeEventListener("click", _closeBellOutside, true);
  }
}

/* — Admin: acessos — */
async function updateBellAdmin() {
  const { data } = await sb.from("acessos").select("id, started_at, pessoa:pessoas!pessoa_id(nome,email)").order("started_at", { ascending: false }).limit(30);
  _alertasCache = data || [];
  const lastSeen = localStorage.getItem("dojo_alertas_visto") || "1970-01-01T00:00:00Z";
  const unseen = _alertasCache.filter(a => a.started_at > lastSeen).length;
  const badge = document.getElementById("bellBadge"); if (!badge) return;
  if (unseen > 0) { badge.textContent = unseen > 99 ? "99+" : String(unseen); badge.style.display = ""; }
  else badge.style.display = "none";
}
function toggleBellAdmin() {
  const existing = document.getElementById("bellPanel");
  if (existing) { existing.remove(); document.removeEventListener("click", _closeBellOutside, true); return; }
  const lastSeen = localStorage.getItem("dojo_alertas_visto") || "1970-01-01T00:00:00Z";
  const items = (_alertasCache || []).length
    ? _alertasCache.map(a => {
        const who = (a.pessoa && (a.pessoa.nome || a.pessoa.email)) || "Alguém";
        return '<div class="bell-item' + (a.started_at > lastSeen ? " novo" : "") + '"><span class="bell-dot"></span><div class="bell-body"><div class="bell-who">' + esc(who) + '</div><div class="bell-when">acessou ' + fmtRel(a.started_at) + '</div></div></div>';
      }).join("")
    : '<p class="muted-note" style="padding:14px;text-align:center">Nenhum acesso registrado ainda.</p>';
  _bellPanel("Avisos de acesso", items);
  localStorage.setItem("dojo_alertas_visto", new Date().toISOString());
  setTimeout(updateBellAdmin, 30);
}

/* — Cliente/equipe: novidades — */
async function updateBellCliente() {
  if (!me) return;
  const { count } = await sb.from("notificacoes").select("*", { count: "exact", head: true }).eq("pessoa_id", me.id).eq("lida", false);
  const badge = document.getElementById("bellBadge"); if (!badge) return;
  if (count > 0) { badge.textContent = count > 99 ? "99+" : String(count); badge.style.display = ""; }
  else badge.style.display = "none";
}
async function toggleBellCliente() {
  const existing = document.getElementById("bellPanel");
  if (existing) { existing.remove(); document.removeEventListener("click", _closeBellOutside, true); return; }
  const panel = _bellPanel("Novidades", '<p class="muted-note" style="padding:14px">Carregando…</p>');
  const { data } = await sb.from("notificacoes").select("*").eq("pessoa_id", me.id).order("created_at", { ascending: false }).limit(30);
  const list = data || [];
  const inner = list.length
    ? list.map(n => '<div class="bell-item' + (n.lida ? "" : " novo") + '"><span class="bell-dot"></span><div class="bell-body"><div class="bell-who">' + (NOTIF_ICON[n.tipo] || "🔔") + ' ' + esc(n.titulo) + '</div>' + (n.corpo ? '<div class="bell-when">' + esc(n.corpo) + '</div>' : '') + '<div class="bell-when">' + fmtRel(n.created_at) + '</div></div></div>').join("")
    : '<p class="muted-note" style="padding:14px;text-align:center">Nenhuma novidade ainda.</p>';
  const pl = panel.querySelector(".bell-list"); if (pl) pl.innerHTML = inner;
  await sb.from("notificacoes").update({ lida: true }).eq("pessoa_id", me.id).eq("lida", false);
  updateBellCliente();
}

/* Caixa de aviso (toast) que some ao fechar */
function notifToast(n) {
  let host = document.getElementById("ntoastHost");
  if (!host) { host = document.createElement("div"); host.id = "ntoastHost"; document.body.appendChild(host); }
  const el = document.createElement("div"); el.className = "ntoast";
  el.innerHTML = '<div class="ntoast-ico">' + (NOTIF_ICON[n.tipo] || "🔔") + '</div>' +
    '<div class="ntoast-body"><div class="ntoast-t">' + esc(n.titulo) + '</div>' + (n.corpo ? '<div class="ntoast-c">' + esc(n.corpo) + '</div>' : '') + '</div>' +
    '<button class="ntoast-x" title="Fechar">✕</button>';
  el.querySelector(".ntoast-x").onclick = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); };
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
}

let _notifChannel = null;
function subscribeNotifRealtime() {
  if (_notifChannel || !me) return;
  _notifChannel = sb.channel("notif-" + me.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes", filter: "pessoa_id=eq." + me.id }, (payload) => { if (payload.new) notifToast(payload.new); updateBell(); })
    .subscribe();
}
function unsubscribeNotifRealtime() { if (_notifChannel) { sb.removeChannel(_notifChannel); _notifChannel = null; } }

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
        if (!nome && !file && !url) { toast("Informe um nome e um arquivo ou link."); return; }
        let storage_path = null, tipo = null, tamanho = null;
        if (file) {
          storage_path = curProjeto.id + "/" + uid() + "-" + file.name.replace(/[^\w.\-]/g, "_");
          const up = await sb.storage.from("documentos").upload(storage_path, file);
          if (up.error) { toast("Erro no upload: " + up.error.message); return; }
          tipo = file.type; tamanho = file.size;
        } else if (url) { tipo = "link"; }
        const { error } = await sb.from("documentos").insert({
          projeto_id: curProjeto.id, nome: nome || (file && file.name) || url,
          storage_path, url: url || null, tipo, tamanho, visibilidade: vis, criado_por: me.id
        });
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function baixarDoc(path) {
  const { data, error } = await sb.storage.from("documentos").createSignedUrl(path, 3600);
  if (error) { toast("Erro: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}
async function delDoc(id, path) {
  if (!(await confirmDialog("Excluir este documento?"))) return;
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
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function delAnotacao(id) { if (!(await confirmDialog("Excluir esta anotação?"))) return; await sb.from("anotacoes").delete().eq("id", id); route(); }

/* — Checklists — */
function novoChecklist() {
  openModal('<h3>Novo checklist</h3>' + field("Título", "titulo", "") + visSelect() + actions("Criar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const titulo = m.querySelector('[data-k="titulo"]').value.trim();
        if (!titulo) { toast("Informe o título."); return; }
        const { error } = await sb.from("checklists").insert({ projeto_id: curProjeto.id, titulo, visibilidade: m.querySelector('[data-k="vis"]').value, criado_por: me.id });
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function delChecklist(id) { if (!(await confirmDialog("Excluir o checklist e seus itens?"))) return; await sb.from("checklists").delete().eq("id", id); route(); }
async function addItem(clId) {
  const el = document.getElementById("ni-" + clId); const texto = (el.value || "").trim(); if (!texto) return;
  const { error } = await sb.from("checklist_itens").insert({ checklist_id: clId, texto });
  if (error) { toast("Erro: " + error.message); return; }
  route();
}
async function toggleItem(id, cur) {
  const done = !cur;
  await sb.from("checklist_itens").update({ concluido: done, concluido_por: done ? me.id : null, concluido_em: done ? new Date().toISOString() : null }).eq("id", id);
  recomputeEvolucaoSeAuto(); route();
}
async function delItem(id) { await sb.from("checklist_itens").delete().eq("id", id); route(); }

/* ===== 13c) Mensagens ===== */
async function renderMensagens(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const allTiles = (state.spaces || []).flatMap(sp => sp.tiles || []);
  const tileIds = allTiles.map(t => t.id);
  const [msgs, mbs, cmtsRes] = await Promise.all([
    sb.from("mensagens").select("*, autor:pessoas!autor_id(nome,email)").eq("projeto_id", pid).order("created_at"),
    sb.from("membros").select("pessoa_id, papel, pessoas(nome,email)").eq("projeto_id", pid),
    tileIds.length
      ? sb.from("comentarios_painel").select("id, corpo, autor_id, widget_id, item_ref, created_at, autor:pessoas!autor_id(nome,email)").in("widget_id", tileIds).order("created_at")
      : { data: [] }
  ]);
  const participantes = (mbs.data || []).filter(x => x.pessoa_id !== me.id);

  // Timeline unificada: mensagens do chat + comentários de widgets, ordenados por data
  const timeline = [
    ...(msgs.data || []).map(m => ({ kind: "msg", ts: m.created_at, data: m })),
    ...(cmtsRes.data || []).map(c => ({ kind: "cmt", ts: c.created_at, data: c }))
  ].sort((a, b) => a.ts < b.ts ? -1 : 1);

  const lista = timeline.map(item => {
    if (item.kind === "msg") {
      const mm = item.data, mine = mm.autor_id === me.id;
      const who = (mm.autor && (mm.autor.nome || mm.autor.email)) || "—";
      const priv = mm.destinatario_id ? ' · <span class="msg-priv">privado</span>' : "";
      const anexo = mm.anexo_storage_path
        ? '<div class="msg-anexo"><button class="lnk" onclick="baixarChatAnexo(\'' + escAttr(mm.anexo_storage_path) + '\')">📎 ' + esc(mm.anexo_nome || "Arquivo") + '</button></div>'
        : "";
      return '<div class="msg' + (mine ? " mine" : "") + '"><div class="msg-meta">' + esc(who) + priv + '</div>' +
        '<div class="msg-bubble">' + (mm.corpo ? esc(mm.corpo) : "") + anexo + '</div></div>';
    }
    // Comentário de widget
    const cm = item.data;
    const who = (cm.autor && (cm.autor.nome || cm.autor.email)) || "—";
    const tile = allTiles.find(t => t.id === cm.widget_id);
    const tname = (tile && ((tile.props && tile.props.title) || (WIDGETS[tile.type] && WIDGETS[tile.type].name))) || "Widget";
    return '<div class="msg-comment">' +
      '<div class="msg-src">📌 <button class="lnk msg-src-link" onclick="irParaComentarioWidget(\'' + escAttr(cm.widget_id) + '\',\'' + escAttr(tname) + '\')">' + esc(tname) + '</button></div>' +
      '<div class="msg-meta">' + esc(who) + '</div>' +
      '<div class="msg-bubble">' + esc(cm.corpo || "") + '</div></div>';
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
    if (upErr) { toast("Erro no upload: " + upErr.message); return; }
    anexo_storage_path = path; anexo_nome = file.name;
  }
  const to = document.getElementById("msgTo").value || null;
  const { error } = await sb.from("mensagens").insert({
    projeto_id: curProjeto.id, autor_id: me.id, destinatario_id: to,
    corpo: corpo || "", anexo_storage_path, anexo_nome
  });
  if (error) { toast("Erro: " + error.message); return; }
  route();
}

async function baixarChatAnexo(path) {
  const { data, error } = await sb.storage.from("chat").createSignedUrl(path, 3600);
  if (error) { toast("Erro: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}
function irParaComentarioWidget(tid, label) {
  projTab = "painel"; route();
  setTimeout(() => abrirComentariosPainel(tid, null, label), 150);
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
        if (!titulo) { toast("Informe o título."); return; }
        const { error } = await sb.from("aprovacoes").insert({ projeto_id: curProjeto.id, titulo, descricao: m.querySelector('[data-k="descricao"]').value.trim(), criado_por: me.id });
        if (error) { toast("Erro: " + error.message); return; }
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
        if (error) { toast("Erro: " + error.message); return; }
        recomputeEvolucaoSeAuto(); closeModal(); route();
      };
    });
}
async function delAprovacao(id) { if (!(await confirmDialog("Excluir esta aprovação?"))) return; await sb.from("aprovacoes").delete().eq("id", id); route(); }
async function addComentario(apId) {
  const el = document.getElementById("co-" + apId); const corpo = (el.value || "").trim(); if (!corpo) return;
  const { error } = await sb.from("comentarios").insert({ aprovacao_id: apId, autor_id: me.id, corpo });
  if (error) { toast("Erro: " + error.message); return; }
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
  if (!actingAdmin()) {
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
    if (actingAdmin()) {
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
        '<button class="lnk" onclick="salvarComoModelo(\'' + q.id + '\')">salvar como modelo</button>' +
        '<button class="lnk del" onclick="delQuestionario(\'' + q.id + '\')">excluir</button></div>' : '') +
      '</div>';
  }).join("") || '<p class="muted-note">Nenhum questionário ainda.' + (canEdit ? ' Crie um para o cliente responder.' : '') + '</p>';

  hint.innerHTML = '<div class="page"><div class="page-head"><h2>📝 Questionários</h2>' +
    (canEdit ? '<div style="display:flex;gap:8px"><button class="btn" onclick="usarModeloQuestionario()">📋 Usar modelo</button><button class="btn primary" onclick="novoQuestionario()">＋ Novo questionário</button></div>' : '') +
    '</div>' + cards + '</div>';
}

/* ===== Modelos de questionário/formulário (item 13) ===== */
async function abrirModelos(tipo, onPick) {
  const { data } = await sb.from("modelos").select("*").eq("tipo", tipo).order("created_at", { ascending: false });
  const list = data || [];
  const rows = list.length
    ? list.map(m => '<div class="grow-row"><div class="gr-main"><span class="gr-name">' + esc(m.titulo) + ' <span class="muted-note" style="font-size:11px;text-transform:none;letter-spacing:0">' + ((m.perguntas || []).length) + ' pergunta(s)</span></span><div class="gr-actions"><button class="lnk" data-use="' + m.id + '">usar</button><button class="lnk del" data-del="' + m.id + '">excluir</button></div></div>' + (m.descricao ? '<div class="ano-prev">' + esc(m.descricao) + '</div>' : '') + '</div>').join("")
    : '<p class="muted-note">Nenhum modelo salvo ainda. Crie um a partir de um ' + (tipo === "questionario" ? "questionário" : "formulário") + ' existente (botão “salvar como modelo”).</p>';
  openModal('<h3>📋 Modelos</h3>' + rows + '<div class="modal-actions"><span class="grow"></span><button class="btn primary" data-x>Fechar</button></div>',
    mm => {
      mm.querySelector("[data-x]").onclick = closeModal;
      mm.querySelectorAll("[data-use]").forEach(b => b.onclick = () => { const m = list.find(x => x.id === b.dataset.use); closeModal(); if (m) onPick(m); });
      mm.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (!(await confirmDialog("Excluir este modelo?"))) return; await sb.from("modelos").delete().eq("id", b.dataset.del); abrirModelos(tipo, onPick); });
    });
}
async function salvarModelo(tipo, titulo, descricao, perguntas) {
  if (!perguntas.length) { toast("Sem perguntas para salvar como modelo."); return; }
  const { error } = await sb.from("modelos").insert({ tipo, titulo: titulo || "Modelo", descricao: descricao || null, perguntas, criado_por: me.id });
  if (error) { toast("Erro: " + error.message); return; }
  toast("✓ Modelo salvo.");
}
function _qTipo(t) { return ({ paragrafo: "texto", nota: "escala" })[t] || (["texto", "multipla", "unica", "escala"].includes(t) ? t : "texto"); }
function usarModeloQuestionario() {
  abrirModelos("questionario", async m => {
    const { data: q } = await sb.from("questionarios").insert({ projeto_id: curProjeto.id, titulo: m.titulo, descricao: m.descricao, criado_por: me.id }).select().single();
    if (!q) return;
    const pergs = (m.perguntas || []).map((p, i) => ({ questionario_id: q.id, texto: p.texto, tipo: _qTipo(p.tipo), opcoes: p.opcoes || null, obrigatoria: !!p.obrigatoria, ordem: i }));
    if (pergs.length) await sb.from("perguntas").insert(pergs);
    editarQuestionario(q.id);
  });
}
async function salvarComoModelo(qid) {
  const [{ data: q }, { data: pergs }] = await Promise.all([
    sb.from("questionarios").select("titulo,descricao").eq("id", qid).single(),
    sb.from("perguntas").select("*").eq("questionario_id", qid).order("ordem")
  ]);
  await salvarModelo("questionario", q && q.titulo, q && q.descricao, (pergs || []).map(p => ({ tipo: p.tipo, texto: p.texto, opcoes: p.opcoes, obrigatoria: p.obrigatoria })));
}
function usarModeloForm(widgetId) {
  abrirModelos("formulario", async m => {
    const form = await ensureFormulario(widgetId); if (!form) return;
    await sb.from("form_formularios").update({ titulo: m.titulo, descricao: m.descricao || null }).eq("id", form.id);
    await sb.from("form_perguntas").delete().eq("formulario_id", form.id);
    const pergs = (m.perguntas || []).map((p, i) => ({ formulario_id: form.id, texto: p.texto, tipo: p.tipo, opcoes: p.opcoes || null, media_url: p.media_url || null, media_tipo: p.media_tipo || null, obrigatoria: !!p.obrigatoria, ordem: i }));
    if (pergs.length) await sb.from("form_perguntas").insert(pergs);
    editarFormulario(widgetId);
  });
}
async function salvarFormComoModelo(widgetId) {
  const { data: form } = await sb.from("form_formularios").select("*").eq("widget_id", widgetId).maybeSingle();
  if (!form) { toast("Configure o formulário primeiro."); return; }
  const { data: pergs } = await sb.from("form_perguntas").select("*").eq("formulario_id", form.id).order("ordem");
  await salvarModelo("formulario", form.titulo, form.descricao, (pergs || []).map(p => ({ tipo: p.tipo, texto: p.texto, opcoes: p.opcoes, media_url: p.media_url, media_tipo: p.media_tipo, obrigatoria: p.obrigatoria })));
}

function novoQuestionario() {
  openModal('<h3>Novo questionário</h3>' + field("Título", "titulo", "") +
    '<label>Descrição (opcional)</label><textarea data-k="descricao" placeholder="Contexto para o cliente…"></textarea>' +
    actions("Criar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const titulo = m.querySelector('[data-k="titulo"]').value.trim();
        if (!titulo) { toast("Informe o título."); return; }
        const { data, error } = await sb.from("questionarios").insert({
          projeto_id: curProjeto.id, titulo,
          descricao: m.querySelector('[data-k="descricao"]').value.trim() || null,
          criado_por: me.id
        }).select().single();
        if (error) { toast("Erro: " + error.message); return; }
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
  if (!(await confirmDialog("Excluir esta pergunta?"))) return;
  await sb.from("perguntas").delete().eq("id", pid);
  closeModal(); editarQuestionario(qid);
}

async function toggleQStatus(qid, cur) {
  await sb.from("questionarios").update({ status: cur === "aberto" ? "fechado" : "aberto" }).eq("id", qid);
  recomputeEvolucaoSeAuto(); route();
}

async function delQuestionario(qid) {
  if (!(await confirmDialog("Excluir este questionário e todas as respostas?"))) return;
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

function _reuLocalHtml(r) {
  return String(r.local_ou_link).startsWith("http")
    ? '<a href="' + escAttr(r.local_ou_link) + '" target="_blank" rel="noopener" class="lnk">🔗 Link da reunião</a>'
    : '📍 ' + esc(r.local_ou_link);
}
async function renderReunioes(canvas, hint) {
  const pid = curProjeto.id;
  hint.style.display = "block";
  const { data: rs } = await sb.from("reunioes").select("*").eq("projeto_id", pid).order("data_hora", { ascending: false });
  const all = rs || [];
  const agendadas = all.filter(r => r.status === "agendada").sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  const realizadas = all.filter(r => r.status === "realizada");

  const cardAgendada = r => '<div class="reucard">' +
    '<div class="reu-head"><span class="reu-title">' + esc(r.titulo) + '</span><span class="reubadge agendada">⏳ agendada</span></div>' +
    '<div class="reu-when">📅 ' + fmtDt(r.data_hora) + ' · ' + r.duracao_min + ' min</div>' +
    (r.local_ou_link ? '<div class="reu-local">' + _reuLocalHtml(r) + '</div>' : '') +
    (r.descricao ? '<div class="reu-desc">' + esc(r.descricao) + '</div>' : '') +
    (canEdit ? '<div class="reu-actions"><button class="lnk" onclick="editarReuniao(\'' + r.id + '\')">editar</button><button class="lnk ok" onclick="realizarReuniao(\'' + r.id + '\')">marcar como realizada</button><button class="lnk del" onclick="delReuniao(\'' + r.id + '\')">excluir</button></div>' : '') +
    '</div>';

  const cardRealizada = r => {
    const d = r.dados || {};
    const tarefas = (d.tarefas || []).map(t => '<li>' + esc(t.texto) + (t.responsavel ? ' <span class="reu-resp">— ' + esc(t.responsavel) + '</span>' : '') + '</li>').join("");
    const prints = (d.prints || []).map(u => '<a href="' + escAttr(u) + '" target="_blank" rel="noopener"><img src="' + escAttr(u) + '" class="reu-print" loading="lazy"></a>').join("");
    return '<div class="reucard">' +
      '<div class="reu-head"><span class="reu-title">' + esc(r.titulo) + '</span><span class="reubadge realizada">✓ realizada</span></div>' +
      '<div class="reu-when">📅 ' + fmtDt(r.data_hora) + '</div>' +
      (d.gravacao_url ? '<div class="reu-local"><a href="' + escAttr(d.gravacao_url) + '" target="_blank" rel="noopener" class="lnk">🎥 Gravação</a></div>' : '') +
      (d.resumo ? '<div class="reu-notas"><b>📝 Resumo:</b> ' + esc(d.resumo) + '</div>' : (r.notas ? '<div class="reu-notas"><b>📋 Ata:</b> ' + esc(r.notas) + '</div>' : '')) +
      (tarefas ? '<div class="reu-tarefas"><b>✅ Tarefas:</b><ul>' + tarefas + '</ul></div>' : '') +
      (prints ? '<div class="reu-prints">' + prints + '</div>' : '') +
      (d.transcricao ? '<details class="reu-transc"><summary>📄 Transcrição</summary><div>' + esc(d.transcricao) + '</div></details>' : (d.transcricao_url ? '<div class="reu-local"><a href="' + escAttr(d.transcricao_url) + '" target="_blank" rel="noopener" class="lnk">📄 Transcrição (arquivo)</a></div>' : '')) +
      (canEdit ? '<div class="reu-actions"><button class="lnk" onclick="registrarReuniaoRealizada(\'' + r.id + '\')">✏ editar registro</button><button class="lnk del" onclick="delReuniao(\'' + r.id + '\')">excluir</button></div>' : '') +
      '</div>';
  };

  hint.innerHTML = '<div class="page"><div class="page-head"><h2>📅 Reuniões</h2>' +
    (canEdit || perm("pode_marcar_reunioes") ? '<button class="btn primary" onclick="novaReuniao()">＋ Agendar reunião</button>' : '') + '</div>' +
    '<div class="gsec"><div class="gsec-head"><h3>⏳ Agendadas</h3></div>' + (agendadas.map(cardAgendada).join("") || '<p class="muted-note">Nenhuma reunião agendada.</p>') + '</div>' +
    '<div class="gsec"><div class="gsec-head"><h3>✅ Realizadas</h3></div>' + (realizadas.map(cardRealizada).join("") || '<p class="muted-note">Nenhuma reunião realizada ainda.</p>') + '</div>' +
    '</div>';
}

/* Item 12: registro completo da reunião realizada */
async function registrarReuniaoRealizada(rid) {
  const { data: r } = await sb.from("reunioes").select("*").eq("id", rid).single();
  const d = r.dados || {};
  const tarefasTxt = (d.tarefas || []).map(t => t.texto + (t.responsavel ? " | " + t.responsavel : "")).join("\n");
  const printsTxt = (d.prints || []).join("\n");
  openModal('<h3>📝 Registro — ' + esc(r.titulo) + '</h3>' +
    field("🎥 Link da gravação", "gravacao_url", d.gravacao_url || "") +
    '<label>Resumo da reunião</label><textarea data-k="resumo" style="min-height:70px">' + esc(d.resumo || r.notas || "") + '</textarea>' +
    '<label>Transcrição (texto)</label><textarea data-k="transcricao" style="min-height:90px">' + esc(d.transcricao || "") + '</textarea>' +
    field("📄 Link do arquivo de transcrição", "transcricao_url", d.transcricao_url || "") +
    '<label>Prints / fotos <span class="muted-note" style="text-transform:none;letter-spacing:0;font-weight:600;font-size:11px">(uma URL por linha)</span></label><textarea data-k="prints" style="min-height:50px;font-family:var(--font-mono);font-size:12px">' + esc(printsTxt) + '</textarea>' +
    '<label>Tarefas <span class="muted-note" style="text-transform:none;letter-spacing:0;font-weight:600;font-size:11px">(uma por linha: <b>tarefa | responsável</b> — participante ou externo)</span></label><textarea data-k="tarefas" style="min-height:70px;font-family:var(--font-mono);font-size:12.5px">' + esc(tarefasTxt) + '</textarea>' +
    actions("Salvar registro"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => (m.querySelector('[data-k="' + k + '"]') || {}).value || "";
        const tarefas = get("tarefas").split("\n").map(l => l.split("|").map(s => s.trim())).filter(a => a[0]).map(a => ({ texto: a[0], responsavel: a[1] || "" }));
        const prints = get("prints").split("\n").map(s => s.trim()).filter(Boolean);
        const dados = Object.assign({}, r.dados || {}, { gravacao_url: get("gravacao_url").trim() || null, resumo: get("resumo").trim() || null, transcricao: get("transcricao").trim() || null, transcricao_url: get("transcricao_url").trim() || null, prints, tarefas });
        const { error } = await sb.from("reunioes").update({ dados, notas: get("resumo").trim() || r.notas }).eq("id", rid);
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); route(); toast("Registro salvo.");
      };
    });
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
  const dd = r.dados || {};
  const tipo = dd.tipo || ((r.local_ou_link && String(r.local_ou_link).startsWith("http")) ? "online" : "presencial");
  return field("Título", "titulo", r.titulo || "") +
    '<label>Data e hora</label><input type="datetime-local" data-k="data_hora" value="' + escAttr(toLocalDt(r.data_hora)) + '">' +
    field("Duração (minutos)", "duracao_min", r.duracao_min || 60) +
    '<label>Tipo</label><select data-k="tipo" id="reuTipo"><option value="online"' + (tipo === "online" ? " selected" : "") + '>💻 Online</option><option value="presencial"' + (tipo === "presencial" ? " selected" : "") + '>📍 Presencial</option></select>' +
    '<label id="reuLocalLbl">' + (tipo === "online" ? "Link da reunião" : "Endereço / local") + '</label>' +
    '<div style="position:relative"><input data-k="local_ou_link" id="reuLocal" autocomplete="off" value="' + escAttr(r.local_ou_link || "") + '" placeholder="' + (tipo === "online" ? "https://meet…" : "Digite o endereço ou nome do lugar…") + '"><div id="placeAc" class="place-ac" style="display:none"></div></div>' +
    '<label>Descrição (pauta)</label><textarea data-k="descricao">' + esc(r.descricao || "") + '</textarea>';
}
/* Busca de lugares em tempo real (Photon/OSM, grátis, viés Brasil) — item 11 */
let _placeTimer = null;
function attachPlaceSearch(input, acBox) {
  input.oninput = () => {
    clearTimeout(_placeTimer);
    const q = input.value.trim();
    if (q.length < 3) { acBox.style.display = "none"; return; }
    _placeTimer = setTimeout(async () => {
      try {
        const resp = await fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=6&lat=-14.24&lon=-51.93");
        const j = await resp.json();
        const feats = (j.features || []);
        if (!feats.length) { acBox.style.display = "none"; return; }
        acBox.innerHTML = feats.map(f => {
          const p = f.properties || {};
          const lbl = [p.name, [p.street, p.housenumber].filter(Boolean).join(" "), p.city || p.county, p.state, p.country].filter(Boolean).join(", ");
          return '<div class="place-it" data-lbl="' + escAttr(lbl) + '">📍 ' + esc(lbl) + '</div>';
        }).join("");
        acBox.style.display = "block";
        acBox.querySelectorAll(".place-it").forEach(el => el.onmousedown = e => { e.preventDefault(); input.value = el.dataset.lbl; acBox.style.display = "none"; });
      } catch (e) { acBox.style.display = "none"; }
    }, 350);
  };
  input.onblur = () => setTimeout(() => { acBox.style.display = "none"; }, 220);
}
function wireReuForm(m) {
  const tipoSel = m.querySelector("#reuTipo"), input = m.querySelector("#reuLocal"), lbl = m.querySelector("#reuLocalLbl"), ac = m.querySelector("#placeAc");
  if (!tipoSel) return;
  const apply = () => {
    const presencial = tipoSel.value === "presencial";
    lbl.textContent = presencial ? "Endereço / local" : "Link da reunião";
    input.placeholder = presencial ? "Digite o endereço ou nome do lugar…" : "https://meet…";
    if (presencial) attachPlaceSearch(input, ac); else { input.oninput = null; ac.style.display = "none"; }
  };
  tipoSel.onchange = apply; apply();
}

function novaReuniao() {
  openModal('<h3>Agendar reunião</h3>' + reuForm() + actions("Agendar"),
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      wireReuForm(m);
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => (m.querySelector('[data-k="' + k + '"]') || {}).value || "";
        const titulo = get("titulo").trim();
        const data_hora = get("data_hora");
        if (!titulo) { toast("Informe o título."); return; }
        if (!data_hora) { toast("Informe a data e hora."); return; }
        const { error } = await sb.from("reunioes").insert({
          projeto_id: curProjeto.id, titulo, data_hora: new Date(data_hora).toISOString(),
          duracao_min: parseInt(get("duracao_min")) || 60,
          local_ou_link: get("local_ou_link").trim() || null,
          descricao: get("descricao").trim() || null,
          dados: { tipo: get("tipo") },
          criado_por: me.id
        });
        if (error) { toast("Erro: " + error.message); return; }
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
      wireReuForm(m);
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => (m.querySelector('[data-k="' + k + '"]') || {}).value || "";
        const titulo = get("titulo").trim();
        const data_hora = get("data_hora");
        if (!titulo || !data_hora) { toast("Título e data são obrigatórios."); return; }
        const { error } = await sb.from("reunioes").update({
          titulo, data_hora: new Date(data_hora).toISOString(),
          duracao_min: parseInt(get("duracao_min")) || 60,
          local_ou_link: get("local_ou_link").trim() || null,
          descricao: get("descricao").trim() || null,
          dados: Object.assign({}, r.dados || {}, { tipo: get("tipo") }),
          notas: get("notas").trim() || null
        }).eq("id", rid);
        if (error) { toast("Erro: " + error.message); return; }
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
  if (!(await confirmDialog("Excluir esta reunião?"))) return;
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
  const podeGerenciar = canEdit || perm("pode_adicionar_pessoas");
  const { data: ms } = await sb.from("membros").select("*, pessoas(nome,email)").eq("projeto_id", pid).order("created_at");
  const rows = (ms || []).map(m => {
    const p = m.pessoas || {};
    if (!podeGerenciar) {
      // visão do cliente: só quem está na equipe (nome + papel), sem ações nem config
      const ini = (p.nome || p.email || "?").split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase();
      return '<div class="grow-row"><div class="gr-main"><span class="gr-name">' +
        '<span class="team-av" style="display:inline-grid;width:26px;height:26px;font-size:11px;vertical-align:middle;margin-right:8px">' + esc(ini) + '</span>' +
        esc(p.nome || p.email || "—") + ' <span class="papel ' + m.papel + '">' + (m.papel === "gestor" ? "equipe" : "cliente") + '</span></span></div></div>';
    }
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
  }).join("") || '<p class="muted-note">' + (podeGerenciar ? "Nenhum participante ainda. Adicione alguém para liberar o portal do cliente." : "Ninguém na equipe ainda.") + '</p>';
  hint.innerHTML = '<div class="page"><div class="page-head"><h2>👥 ' + (podeGerenciar ? "Participantes" : "Equipe") + '</h2>' +
    (podeGerenciar ? '<button class="btn primary" onclick="adicionarParticipante()">＋ Adicionar</button>' : '') + '</div>' + rows +
    (podeGerenciar ? '<div id="adesaoBox" style="margin-top:22px"></div>' : '') + '</div>';
  if (podeGerenciar) carregarAdesaoProjeto(pid);
}

/* Item 10: adesão/uso de cada participante NESTE projeto */
async function carregarAdesaoProjeto(pid) {
  const box = document.getElementById("adesaoBox"); if (!box) return;
  box.innerHTML = '<div class="gsec-head"><h3>📊 Adesão neste projeto</h3></div><p class="muted-note">Carregando…</p>';
  const { data, error } = await sb.rpc("metricas_uso_projeto", { p_projeto: pid });
  if (error) { box.innerHTML = '<div class="gsec-head"><h3>📊 Adesão neste projeto</h3></div><p class="muted-note">Erro: ' + esc(error.message) + '</p>'; return; }
  const rows = data || [];
  if (!rows.length) { box.innerHTML = '<div class="gsec-head"><h3>📊 Adesão neste projeto</h3></div><p class="muted-note">Sem participantes para medir.</p>'; return; }
  const trs = rows.map(r => {
    const st = _statusUso(r.ultimo_acesso);
    const contrib = Number(r.n_mensagens || 0) + Number(r.n_forms || 0) + Number(r.n_aprovacoes || 0) + Number(r.n_comentarios || 0);
    return '<tr><td><div class="uso-nome">' + esc(r.nome || r.email || "—") + ' <span class="papel ' + r.papel + '" style="font-size:9px">' + esc(r.papel) + '</span></div></td>' +
      '<td><span class="uso-st ' + st.k + '">' + st.t + '</span></td>' +
      '<td>' + (r.ultimo_acesso ? fmtRel(r.ultimo_acesso) : "—") + '</td>' +
      '<td><div class="uso-contrib">' + contrib + '</div><div class="uso-breakdown">💬 ' + (r.n_mensagens || 0) + ' · 📋 ' + (r.n_forms || 0) + ' · ✅ ' + (r.n_aprovacoes || 0) + ' · 🗨 ' + (r.n_comentarios || 0) + '</div></td></tr>';
  }).join("");
  box.innerHTML = '<div class="gsec-head"><h3>📊 Adesão neste projeto</h3></div>' +
    '<div class="uso-table-wrap"><table class="data-table uso-table"><thead><tr><th>Participante</th><th>Status</th><th>Último acesso</th><th>Contribuições aqui</th></tr></thead><tbody>' + trs + '</tbody></table></div>';
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
        if (error) { toast("Erro: " + error.message); return; }
        closeModal(); route();
      };
    });
}
async function removerMembro(id) { if (!(await confirmDialog("Remover este participante do projeto?"))) return; await sb.from("membros").delete().eq("id", id); route(); }

/* — Configurar cliente (identidade + contato + dados) — */
function editarCliente() {
  const c = curCliente;
  const d = c.dados || {};
  const mk = c.marca || {};
  const urlLogo = (mk.logoUrl && !String(mk.logoUrl).startsWith("data:")) ? mk.logoUrl : "";
  openModal('<h3>⚙ Configurar cliente</h3>' +
    '<div class="pz-sec-tit">Identidade</div>' +
    '<label>CNPJ <span class="muted-note" style="text-transform:none;letter-spacing:0;font-weight:600;font-size:11px">(digite e clique buscar — preenche o resto)</span></label>' +
    '<div style="display:flex;gap:8px"><input data-k="cnpj" value="' + escAttr(d.cnpj || "") + '" placeholder="00.000.000/0000-00" style="flex:1"><button class="btn" id="cnpjBtn" type="button">🔎 Buscar</button></div>' +
    '<span id="cnpjMsg" class="muted-note" style="font-size:12px"></span>' +
    field("Empresa", "empresa", c.empresa || "") +
    field("Contato / nome", "nome", c.nome || "") +
    '<label>Status</label><select data-k="status"><option value="ativo"' + (c.status === "ativo" ? " selected" : "") + '>Ativo</option><option value="pausado"' + (c.status !== "ativo" ? " selected" : "") + '>Pausado</option></select>' +
    '<label>Cor da marca</label><input type="color" data-k="cor" value="' + escAttr(mk.cor || "#e8a33d") + '" style="height:40px;padding:4px">' +
    field("Logo (cole uma URL)", "logoUrl", urlLogo) +
    '<label class="btn sm" style="cursor:pointer;display:inline-block;margin-top:6px">📁 Enviar logo<input type="file" id="logoUp" accept="image/*" style="display:none"></label> <span id="logoMsg" class="muted-note" style="font-size:12px">' + (mk.logoUrl && String(mk.logoUrl).startsWith("data:") ? "logo enviada ✓" : "") + '</span>' +
    '<div class="pz-sec-tit" style="margin-top:18px">Contato</div>' +
    field("E-mail", "email", d.email || "") + field("Telefone", "telefone", d.telefone || "") +
    field("Site", "site", d.site || "") + field("Endereço", "endereco", d.endereco || "") +
    '<div class="pz-sec-tit" style="margin-top:18px">Sobre o cliente</div>' +
    field("Segmento / área", "segmento", d.segmento || "") +
    '<label>Cliente desde</label><input type="date" data-k="inicio" value="' + escAttr(d.inicio || "") + '">' +
    '<label>Observações (anotações internas)</label><textarea data-k="observacoes" style="min-height:80px">' + esc(d.observacoes || "") + '</textarea>' +
    actions("Salvar"),
    m => {
      let logoData = (mk.logoUrl && String(mk.logoUrl).startsWith("data:")) ? mk.logoUrl : null;
      m.querySelector("#logoUp").onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        if (f.size > 400000) { toast("Logo grande demais (máx ~400KB). Use uma URL."); return; }
        const r = new FileReader(); r.onload = () => { logoData = r.result; m.querySelector("#logoMsg").textContent = "logo enviada ✓"; }; r.readAsDataURL(f);
      };
      const setv = (k, v) => { const el = m.querySelector('[data-k="' + k + '"]'); if (el && v) el.value = v; };
      m.querySelector("#cnpjBtn").onclick = async () => {
        const cnpj = (m.querySelector('[data-k="cnpj"]').value || "").replace(/\D/g, "");
        const msg = m.querySelector("#cnpjMsg");
        if (cnpj.length !== 14) { msg.textContent = "CNPJ deve ter 14 dígitos."; return; }
        msg.textContent = "Buscando…";
        try {
          const resp = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + cnpj);
          if (!resp.ok) { msg.textContent = "CNPJ não encontrado."; return; }
          const j = await resp.json();
          setv("empresa", j.nome_fantasia || j.razao_social);
          const end = [j.logradouro, j.numero].filter(Boolean).join(", ") + (j.bairro ? " - " + j.bairro : "") + (j.municipio ? ", " + j.municipio : "") + (j.uf ? "/" + j.uf : "") + (j.cep ? " - CEP " + j.cep : "");
          setv("endereco", end.replace(/^,\s*/, ""));
          setv("telefone", j.ddd_telefone_1);
          setv("email", j.email);
          setv("segmento", j.cnae_fiscal_descricao);
          msg.textContent = "✓ Dados preenchidos.";
        } catch (e) { msg.textContent = "Erro na consulta (verifique a conexão)."; }
      };
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-ok]").onclick = async () => {
        const get = k => ((m.querySelector('[data-k="' + k + '"]') || {}).value || "").trim();
        const empresa = get("empresa");
        if (!empresa) { toast("Informe a empresa."); return; }
        const logoUrl = logoData || get("logoUrl") || "";
        const marca = Object.assign({}, mk, { cor: get("cor"), titulo: empresa, logoUrl });
        const dados = { cnpj: get("cnpj"), email: get("email"), telefone: get("telefone"), site: get("site"), endereco: get("endereco"), segmento: get("segmento"), inicio: get("inicio"), observacoes: get("observacoes") };
        const upd = { empresa, nome: get("nome") || empresa, status: get("status"), marca, dados };
        const { error } = await sb.from("clientes").update(upd).eq("id", c.id);
        if (error) { toast("Erro: " + error.message); return; }
        curCliente = Object.assign({}, c, upd);
        closeModal(); route();
      };
    });
}

async function excluirCliente() {
  if (curCliente.is_interno) { toast("Não é possível excluir Meus Projetos."); return; }
  const nome = curCliente.empresa || curCliente.nome;
  if (!(await confirmDialog('Excluir "' + nome + '" e TODOS os seus projetos, painéis, documentos e mensagens? Esta ação não pode ser desfeita.', { ok: "Excluir tudo" }))) return;
  const { error } = await sb.from("clientes").delete().eq("id", curCliente.id);
  if (error) { toast("Erro: " + error.message); return; }
  irConsole();
}

/* ===== 14) Topbar ===== */
/* ===== Item 4: visualização responsiva (desktop/tablet/celular) — admin ===== */
let deviceView = window.innerWidth <= 768 ? "mobile" : (window.innerWidth <= 1080 ? "tablet" : "desktop");
const DEV_ICON = { desktop: "🖥", tablet: "📲", mobile: "📱" };
const DEV_NOME = { desktop: "Desktop", tablet: "Tablet", mobile: "Celular" };
function applyDevice() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;
  wrap.classList.remove("dev-tablet", "dev-mobile");
  if (view === "painel" && (projTab === "painel" || projTab === "admin")) {
    if (deviceView === "tablet") wrap.classList.add("dev-tablet");
    else if (deviceView === "mobile") wrap.classList.add("dev-mobile");
  }
  const b = $("#deviceBtn"); if (b) { b.textContent = DEV_ICON[deviceView]; b.classList.toggle("on", deviceView !== "desktop"); }
}
function cycleDevice() {
  const order = ["desktop", "tablet", "mobile"];
  deviceView = order[(order.indexOf(deviceView) + 1) % 3];
  applyDevice();
  route(); // re-renderiza com posições do novo device
  toast("Visualização: " + DEV_NOME[deviceView] + " " + DEV_ICON[deviceView]);
}
/* Posição do tile no device atual: lê de space._layouts[device] ou cai no desktop */
function tilePos(t) {
  try { const sp = space(); if (sp && sp._layouts && sp._layouts[deviceView] && sp._layouts[deviceView][t.id]) return sp._layouts[deviceView][t.id]; } catch(_) {}
  return { x: t.x, y: t.y, w: t.w, h: t.h };
}
/* Salva posição do tile no device atual */
function saveTilePos(t, pos) {
  if (deviceView === "desktop") { t.x = pos.x; t.y = pos.y; t.w = pos.w; t.h = pos.h; return; }
  const sp = space();
  if (!sp._layouts) sp._layouts = {};
  if (!sp._layouts[deviceView]) sp._layouts[deviceView] = {};
  sp._layouts[deviceView][t.id] = { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
}

/* ===== Item 8: renomear menus (rótulos por cliente) — admin ===== */
const MENU_DEF = { admin: "🔒 Admin", painel: "📋 Painel", gestao: "📎 Materiais", materiais: "📎 Materiais", aprovacoes: "✅ Aprovações", questionarios: "📝 Questionários", reunioes: "📅 Reuniões", mensagens: "💬 Mensagens", participantes: "👥 Participantes" };
function menuLabel(key) {
  const m = curCliente && curCliente.menu_labels;
  return (m && m[key]) || MENU_DEF[key] || key;
}
function renomearMenus() {
  if (!curCliente) { toast("Abra um projeto de um cliente."); return; }
  const ml = curCliente.menu_labels || {};
  const linhas = [["painel", "Painel"], ["materiais", "Materiais (Gestão p/ você)"], ["aprovacoes", "Aprovações"], ["questionarios", "Questionários"], ["reunioes", "Reuniões"], ["mensagens", "Mensagens"], ["participantes", "Participantes"], ["admin", "Admin (só você)"]]
    .map(([k, lbl]) => '<label style="text-transform:none;letter-spacing:0;font-weight:700;font-size:12.5px">' + lbl + '</label><input data-mk="' + k + '" value="' + escAttr(ml[k] || "") + '" placeholder="' + escAttr(MENU_DEF[k]) + '">').join("");
  openModal('<h3>🏷 Renomear menus</h3>' +
    '<p class="muted-note" style="font-size:12px;text-transform:none;letter-spacing:0;font-weight:600">Personalize os nomes das abas deste cliente. Deixe em branco para usar o padrão.</p>' +
    '<div style="margin-top:8px">' + linhas + '</div>' +
    '<div class="modal-actions"><span class="grow"></span><button class="btn" data-x>Cancelar</button><button class="btn" id="resetMenus">Restaurar padrão</button><button class="btn primary" data-ok>Salvar</button></div>',
    m => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("#resetMenus").onclick = async () => { await sb.from("clientes").update({ menu_labels: {} }).eq("id", curCliente.id); curCliente.menu_labels = {}; closeModal(); route(); };
      m.querySelector("[data-ok]").onclick = async () => {
        const labels = {};
        m.querySelectorAll("[data-mk]").forEach(el => { const v = el.value.trim(); if (v) labels[el.dataset.mk] = v; });
        const { error } = await sb.from("clientes").update({ menu_labels: labels }).eq("id", curCliente.id);
        if (error) { toast("Erro: " + error.message); return; }
        curCliente.menu_labels = labels; closeModal(); route(); toast("Menus atualizados.");
      };
    });
}

function wireTopbar() {
  $("#authBtn").onclick = authModal;
  $("#adminBtn").onclick = irConsole;
  $("#meusBtn").onclick = irMeusProjetos;
  $("#addBtn").onclick = openPicker;
  $("#previewBtn").onclick = () => setPreviewCliente(!previewCliente);
  $("#bellBtn").onclick = (e) => { e.stopPropagation(); toggleBell(); };
  $("#menuBtn").onclick = abrirPersonalizar;
  $("#undoBtn").onclick = undo;
  $("#redoBtn").onclick = redo;
  $("#histBtn").onclick = () => abrirHistorico("hist");
  $("#deviceBtn").onclick = cycleDevice;
  $("#editBtn").onclick = () => { editMode = !editMode; route(); };
}

/* ===== Boot ===== */
/* IMPORTANTE: não chamar `await sb.from(...)` dentro do callback de
   onAuthStateChange (deadlock no lock interno). Adiamos com setTimeout(0).

   Estratégia de boot:
   - Usamos APENAS onAuthStateChange. NÃO chamamos getSession() no boot.
   - Chamar getSession() em paralelo com o refresh interno do Supabase causa
     race condition com o rotating refresh token: ambos tentam usar o mesmo
     refresh_token; o segundo recebe 401 → SIGNED_OUT dispara mesmo logado.
   - INITIAL_SESSION com session válida → boot imediato.
   - INITIAL_SESSION null → token expirado, refresh em andamento; aguardamos
     TOKEN_REFRESHED (sucesso) ou SIGNED_OUT (falha genuína).
   - Safety net: se nada responder em 8 s, tentamos getSession() uma vez. */
applyPrefs();
wireTopbar();


let _authBooted = false;
const _bootSafety = setTimeout(async () => {
  if (_authBooted) return;
  window._authLog && window._authLog("safety-net: chamando getSession()");
  try {
    const { data } = await sb.auth.getSession();
    window._authLog && window._authLog("safety-net result: session=" + (data.session ? "ok" : "null"));
    if (!_authBooted) { _authBooted = true; onSession(data.session || null); }
  } catch (e) {
    window._authLog && window._authLog("safety-net erro: " + e.message);
    if (!_authBooted) { _authBooted = true; onSession(null); }
  }
}, 8000);

sb.auth.onAuthStateChange((event, session) => {
  window._authLog && window._authLog(event + " session=" + (session ? "ok" : "null"));
  if (event === "INITIAL_SESSION") {
    if (session) {
      // Token ainda válido — boot imediato
      clearTimeout(_bootSafety);
      _authBooted = true;
      setTimeout(() => onSession(session), 0);
    }
    // null → token expirado, refresh em andamento; aguarda TOKEN_REFRESHED ou SIGNED_OUT
    return;
  }
  if (event === "TOKEN_REFRESHED" && session) {
    // Refresh concluído com sucesso
    clearTimeout(_bootSafety);
    _authBooted = true;
    setTimeout(() => onSession(session), 0);
    return;
  }
  if (event === "SIGNED_IN" && session) {
    clearTimeout(_bootSafety);
    _authBooted = true;
    setTimeout(() => onSession(session), 0);
    return;
  }
  if (event === "SIGNED_OUT") {
    clearTimeout(_bootSafety);
    _authBooted = true;
    setTimeout(() => onSession(null), 0);
    return;
  }
  // USER_UPDATED e outros: mantém sessão ativa se disponível
  if (session && _authBooted) setTimeout(() => onSession(session), 0);
});
