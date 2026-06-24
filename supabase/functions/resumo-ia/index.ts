// Edge Function: resumo-ia
// Resume as respostas abertas de um formulário usando Claude (Anthropic).
// verify_jwt = true: só usuários logados; dentro, autoriza admin/gestor do projeto.
// Lê a chave Anthropic de public.app_config (service role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};
const J = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Identifica o usuário pelo JWT
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return J({ error: "Não autenticado." }, 401);

    const { formulario_id } = await req.json();
    if (!formulario_id) return J({ error: "formulario_id ausente." }, 400);

    // Projeto do formulário
    const { data: form } = await admin.from("form_formularios").select("projeto_id, titulo").eq("id", formulario_id).maybeSingle();
    if (!form) return J({ error: "Formulário não encontrado." }, 404);

    // Autoriza: admin ou gestor do projeto
    const { data: pessoa } = await admin.from("pessoas").select("is_admin").eq("id", user.id).maybeSingle();
    let ok = !!(pessoa && pessoa.is_admin);
    if (!ok) {
      const { data: mb } = await admin.from("membros").select("papel").eq("projeto_id", form.projeto_id).eq("pessoa_id", user.id).maybeSingle();
      ok = !!(mb && mb.papel === "gestor");
    }
    if (!ok) return J({ error: "Sem permissão." }, 403);

    // Perguntas abertas + respostas
    const [{ data: pergs }, { data: resps }] = await Promise.all([
      admin.from("form_perguntas").select("id, texto, tipo").eq("formulario_id", formulario_id).in("tipo", ["texto", "paragrafo"]).order("ordem"),
      admin.from("form_respostas").select("respostas").eq("formulario_id", formulario_id),
    ]);
    const abertas = pergs || [];
    if (!abertas.length) return J({ resumo: "", error: "Este formulário não tem perguntas abertas para resumir." });

    // Monta o material
    let material = "";
    let totalRespostas = 0;
    for (const p of abertas) {
      const ans = (resps || [])
        .map((r: any) => r.respostas && r.respostas[p.id])
        .filter((v: any) => typeof v === "string" && v.trim());
      totalRespostas += ans.length;
      material += "\nPergunta: " + p.texto + "\nRespostas:\n" + (ans.length ? ans.map((a: string) => "- " + a).join("\n") : "(sem respostas)") + "\n";
    }
    if (!totalRespostas) return J({ resumo: "", error: "Ainda não há respostas abertas para resumir." });

    // Chave Anthropic
    const { data: cfg } = await admin.from("app_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
    const apiKey = cfg && cfg.value;
    if (!apiKey) return J({ error: "Chave da Anthropic não configurada." }, 500);

    const prompt = "Você é um analista de pesquisas. Abaixo estão as respostas abertas de um formulário chamado \"" + (form.titulo || "Formulário") +
      "\". Para cada pergunta, escreva um resumo curto em português do Brasil com: (1) os temas recorrentes, (2) o sentimento geral, (3) 1 ou 2 destaques/citações. " +
      "Seja objetivo e use a pergunta como título de cada bloco. No fim, dê uma conclusão geral de 1-2 frases.\n\n" + material;

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      return J({ error: "Erro na API da Anthropic: " + t.slice(0, 300) }, 502);
    }
    const ai = await aiResp.json();
    const resumo = (ai.content && ai.content[0] && ai.content[0].text) || "";
    return J({ resumo, respostas: totalRespostas });
  } catch (e) {
    return J({ error: String(e) }, 500);
  }
});
