/* ====================================================================
   Coletor diário de acessibilidade — AMA/UNIFESP
   --------------------------------------------------------------------
   Roda no GitHub Actions (1×/dia, 7h BRT) e a pedido (workflow_dispatch).
   1) Descobre os domínios a monitorar varrendo os widgets "acessmon"
      dentro de paineis.layout (única fonte de verdade — o domínio que
      você escreve no widget).
   2) Abre a página da AMA de cada domínio, espera a análise (~5 min) e a
      animação do donut assentar, e lê: nota, erros, A/AA/AAA.
   3) Grava no Supabase (tabela acessibilidade_monitor) usando a chave
      service_role (ignora o RLS para escrever; fica só nos Secrets do
      GitHub, nunca no código).

   Variáveis de ambiente (Secrets do repositório):
     SUPABASE_URL                 ex.: https://xxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY    chave service_role
   Opcional (para teste manual):
     ONLY_DOMAIN                  coleta só esse domínio
   ==================================================================== */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ONLY = limparDominio(process.env.ONLY_DOMAIN || "");
const CIRC = 282.743; // circunferência do donut (2π·45); medidor é meia-volta → nota = (1 - off/CIRC)·20
const ESPERA_ANALISE_MS = 7 * 60 * 1000; // até 7 min para a análise concluir

if (!SUPABASE_URL || !KEY) {
  console.error("✗ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (configure nos Secrets do GitHub).");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

function limparDominio(s) {
  return (s || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

/* Descobre { domain -> Set(projeto_id) } a partir dos widgets acessmon */
async function descobrirAlvos() {
  const { data, error } = await sb.from("paineis").select("projeto_id, layout");
  if (error) throw new Error("Erro lendo paineis: " + error.message);
  const alvos = new Map();
  for (const p of data || []) {
    const spaces = (p.layout && p.layout.spaces) || [];
    for (const sp of spaces) {
      for (const t of sp.tiles || []) {
        if (t.type !== "acessmon") continue;
        const d = limparDominio(t.props && t.props.domain);
        if (!d) continue;
        if (ONLY && d !== ONLY) continue;
        if (!alvos.has(d)) alvos.set(d, new Set());
        if (p.projeto_id) alvos.get(d).add(p.projeto_id);
      }
    }
  }
  return alvos;
}

/* Abre a AMA e extrai os dados de um domínio */
async function coletarSite(page, domain) {
  const url = "https://amaweb.unifesp.br/avaliador/results/" + domain;
  console.log("  → " + url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // A análise renderiza o site inteiro e leva ~5 min; espera a tabela de resultados.
  await page.waitForSelector('table[aria-label="Resultados da avaliação de acessibilidade"]', { timeout: ESPERA_ANALISE_MS });
  // Espera a nota (texto) aparecer e a animação de 3s do donut assentar.
  await page.waitForFunction(() => {
    const t = document.querySelector("text.CircularProgressbar-text, .CircularProgressbar-text");
    return t && (t.textContent || "").trim().length > 0;
  }, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);

  return await page.evaluate((CIRC) => {
    const num = s => { if (s == null) return null; const m = String(s).replace(",", ".").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    // Nota: principal pelo texto; conferência pelo dashoffset do donut
    const txtEl = document.querySelector("text.CircularProgressbar-text, .CircularProgressbar-text");
    const notaTexto = txtEl ? num(txtEl.textContent) : null;
    let notaCalc = null;
    const path = document.querySelector(".CircularProgressbar-path");
    if (path) {
      const off = parseFloat(String(path.style.strokeDashoffset || "").replace("px", ""));
      if (!isNaN(off)) notaCalc = Math.round((1 - off / CIRC) * 20 * 100) / 100;
    }
    // Erros a corrigir (total)
    const errEl = document.querySelector("span.donut-chart-value.text-error-center");
    const errosTotal = errEl ? num(errEl.textContent) : null;
    // Tabela A/AA/AAA por linha
    const tbl = document.querySelector('table[aria-label="Resultados da avaliação de acessibilidade"]');
    const linha = sel => { const r = tbl && tbl.querySelector(sel); return r ? Array.from(r.querySelectorAll("td")).map(td => num(td.textContent)) : null; };
    const totalFoot = tbl ? Array.from(tbl.querySelectorAll("tfoot td")).map(td => num(td.textContent)) : null;
    return {
      notaTexto, notaCalc, errosTotal,
      erros: linha("tr.error-row"), revisar: linha("tr.warning-row"), aceito: linha("tr.success-row"), total: totalFoot
    };
  }, CIRC);
}

/* Roda o axe-core no site real e conta violações por nível WCAG (A/AA/AAA).
   Diagnóstico próprio — diz O QUE quebrou, complementando a nota da AMA. */
async function coletarAxe(page, domain) {
  const url = "https://" + domain;
  console.log("  → axe em " + url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
    .analyze();
  const isA = t => /^wcag\d+a$/.test(t), isAA = t => /^wcag\d+aa$/.test(t), isAAA = t => /^wcag\d+aaa$/.test(t);
  const nivel = v => { const tg = v.tags || []; if (tg.some(isA)) return "A"; if (tg.some(isAA)) return "AA"; if (tg.some(isAAA)) return "AAA"; return "outros"; };
  let a = 0, aa = 0, aaa = 0;
  const det = [];
  for (const v of results.violations) {
    const L = nivel(v);
    if (L === "A") a++; else if (L === "AA") aa++; else if (L === "AAA") aaa++;
    det.push({ id: v.id, impacto: v.impact, nivel: L, nos: (v.nodes || []).length, ajuda: v.help });
  }
  return { total: results.violations.length, a, aa, aaa, detalhes: det };
}

/* Grava uma linha por projeto que usa o domínio */
async function inserir(projetos, domain, agora, row) {
  const inserts = projetos.map(pid => ({ projeto_id: pid, domain, coletado_em: agora, ...row }));
  const { error } = await sb.from("acessibilidade_monitor").insert(inserts);
  if (error) console.error("  ✗ erro ao gravar (" + row.fonte + "): " + error.message);
  else console.log("  gravado " + row.fonte + " para " + projetos.length + " projeto(s)");
}

(async () => {
  const alvos = await descobrirAlvos();
  if (!alvos.size) {
    console.log("Nenhum widget de acessibilidade com domínio encontrado. Adicione o widget num painel e configure o domínio.");
    return;
  }
  console.log("Alvos (" + alvos.size + "): " + [...alvos.keys()].join(", "));

  const browser = await chromium.launch();
  // @axe-core/playwright exige page vinda de um context explícito (não browser.newPage)
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  let ok = 0, falhas = 0;
  for (const [domain, projSet] of alvos) {
    const projetos = [...projSet];
    const agora = new Date().toISOString();
    console.log("Coletando " + domain + " …");

    // ---- AMA (nota oficial) ----
    let amaRow;
    try {
      const r = await coletarSite(page, domain);
      const nota = r.notaTexto != null ? r.notaTexto : r.notaCalc;
      if (r.notaTexto != null && r.notaCalc != null && Math.abs(r.notaTexto - r.notaCalc) > 0.2)
        console.warn("  ⚠ nota por texto (" + r.notaTexto + ") difere do cálculo (" + r.notaCalc + ")");
      const e = r.erros || [null, null, null];
      amaRow = {
        fonte: "ama", status: "ok",
        nota, erros: r.errosTotal, qtd_a: e[0], qtd_aa: e[1], qtd_aaa: e[2],
        detalhes: { revisar: r.revisar, aceito: r.aceito, total: r.total, nota_texto: r.notaTexto, nota_calc: r.notaCalc }
      };
      console.log("  ✓ AMA: nota " + nota + " · erros " + r.errosTotal + " · A/AA/AAA " + e.join("/"));
      ok++;
    } catch (err) {
      console.error("  ✗ AMA falhou: " + err.message);
      amaRow = { fonte: "ama", status: "indisponivel", detalhes: { erro: String(err.message).slice(0, 500) } };
      falhas++;
    }
    await inserir(projetos, domain, agora, amaRow);

    // ---- axe-core (diagnóstico próprio) ----
    let axeRow;
    try {
      const x = await coletarAxe(page, domain);
      axeRow = {
        fonte: "axe", status: "ok",
        nota: null, erros: x.total, qtd_a: x.a, qtd_aa: x.aa, qtd_aaa: x.aaa,
        detalhes: { violacoes: x.detalhes }
      };
      console.log("  ✓ axe: " + x.total + " violações · A/AA/AAA " + x.a + "/" + x.aa + "/" + x.aaa);
      ok++;
    } catch (err) {
      console.error("  ✗ axe falhou: " + err.message);
      axeRow = { fonte: "axe", status: "indisponivel", detalhes: { erro: String(err.message).slice(0, 500) } };
      falhas++;
    }
    await inserir(projetos, domain, agora, axeRow);
  }

  await browser.close();
  console.log("Fim. Sucesso: " + ok + " · falhas: " + falhas);
})().catch(e => { console.error(e); process.exit(1); });
