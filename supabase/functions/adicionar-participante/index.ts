// Edge Function: adicionar-participante
// Adiciona ao projeto uma pessoa existente OU convida/provisiona uma nova
// (provisionar usuário precisa do service role → não pode rodar no navegador).
// Autoriza o solicitante (admin global, ou gestor/pode_adicionar do projeto).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    // Identifica quem chama (JWT do admin/gestor)
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uerr } = await asUser.auth.getUser();
    if (uerr || !user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const { projeto_id, email, nome, papel = "cliente", permissoes = {} } = body || {};
    if (!projeto_id || !email) return json({ error: "Faltam projeto_id e email" }, 400);
    if (papel !== "cliente" && papel !== "gestor") return json({ error: "Papel inválido" }, 400);

    const admin = createClient(url, service);

    // Autorização: admin global OU gestor/pode_adicionar no projeto
    const { data: perfil } = await admin.from("pessoas").select("is_admin").eq("id", user.id).maybeSingle();
    let autorizado = !!perfil?.is_admin;
    if (!autorizado) {
      const { data: m } = await admin.from("membros")
        .select("papel, pode_adicionar_pessoas")
        .eq("projeto_id", projeto_id).eq("pessoa_id", user.id).maybeSingle();
      autorizado = !!m && (m.papel === "gestor" || m.pode_adicionar_pessoas === true);
    }
    if (!autorizado) return json({ error: "Sem permissão para adicionar participantes" }, 403);

    const emailLc = String(email).trim().toLowerCase();
    const nomeFinal = (nome && String(nome).trim()) || emailLc.split("@")[0];
    let pessoaId: string | null = null;
    let status = "adicionado";

    // Já existe?
    const { data: existente } = await admin.from("pessoas").select("id").ilike("email", emailLc).maybeSingle();
    if (existente) {
      pessoaId = existente.id;
    } else {
      // Provisiona via convite por e-mail; fallback para criação direta
      const inv = await admin.auth.admin.inviteUserByEmail(emailLc, { data: { nome: nomeFinal } });
      if (inv.error || !inv.data?.user) {
        const cu = await admin.auth.admin.createUser({ email: emailLc, email_confirm: true, user_metadata: { nome: nomeFinal } });
        if (cu.error || !cu.data?.user) {
          return json({ error: "Não foi possível criar o usuário: " + (inv.error?.message || cu.error?.message) }, 400);
        }
        pessoaId = cu.data.user.id;
      } else {
        pessoaId = inv.data.user.id;
      }
      status = "convidado";
    }

    // Garante a linha em pessoas (o trigger normalmente já cria)
    await admin.from("pessoas").upsert(
      { id: pessoaId, email: emailLc, nome: nomeFinal },
      { onConflict: "id", ignoreDuplicates: true },
    );

    // Vincula ao projeto (idempotente)
    const membro = {
      projeto_id,
      pessoa_id: pessoaId,
      papel,
      pode_adicionar_pessoas: !!permissoes.pode_adicionar_pessoas,
      pode_enviar_mensagens: permissoes.pode_enviar_mensagens !== false,
      pode_marcar_reunioes: !!permissoes.pode_marcar_reunioes,
      pode_ver_documentos: permissoes.pode_ver_documentos !== false,
    };
    const merr = (await admin.from("membros").upsert(membro, { onConflict: "projeto_id,pessoa_id" })).error;
    if (merr) return json({ error: "Erro ao vincular participante: " + merr.message }, 400);

    return json({ ok: true, status, pessoa_id: pessoaId });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
