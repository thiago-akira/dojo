// Edge Function: notificar
// Disparada por triggers do Postgres (pg_net) em nova aprovação/reunião/mensagem.
// Lê config de public.app_config (service role ignora RLS) e envia e-mail via Resend.
// verify_jwt = false: autenticada pelo header x-notify-secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Config (chave Resend, segredo do trigger, remetente, URL do app)
    const { data: cfgRows } = await sb.from("app_config").select("key,value");
    const cfg: Record<string, string> = Object.fromEntries(
      (cfgRows || []).map((r: any) => [r.key, r.value]),
    );
    const secret = cfg["notify_secret"];
    const resendKey = cfg["resend_api_key"];
    const fromEmail = cfg["from_email"] || "Dojo <onboarding@resend.dev>";
    const appUrl = cfg["app_url"] || "https://akira-dojo.vercel.app";

    // Autentica a chamada do trigger
    if (!secret || req.headers.get("x-notify-secret") !== secret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "resend key ausente" }), { status: 500, headers: cors });
    }

    const { type, record } = await req.json();
    if (!type || !record || !record.projeto_id) {
      return new Response(JSON.stringify({ ok: true, skip: "sem record" }), { headers: cors });
    }

    // Nome do projeto
    const { data: proj } = await sb.from("projetos").select("nome").eq("id", record.projeto_id).single();
    const projNome = (proj && proj.nome) || "seu projeto";

    const actor = record.criado_por || record.autor_id || null;

    // Destinatários
    let recipients: Array<{ email: string; nome?: string }> = [];
    if (type === "mensagem" && record.destinatario_id) {
      const { data } = await sb.from("pessoas").select("email,nome").eq("id", record.destinatario_id);
      recipients = (data || []) as any;
    } else {
      const { data: mbs } = await sb.from("membros").select("pessoa_id, pessoas(email,nome)").eq("projeto_id", record.projeto_id);
      const { data: admins } = await sb.from("pessoas").select("id,email,nome").eq("is_admin", true);
      const map = new Map<string, { email: string; nome?: string }>();
      (mbs || []).forEach((m: any) => { if (m.pessoas && m.pessoas.email) map.set(m.pessoa_id, m.pessoas); });
      (admins || []).forEach((a: any) => { if (a.email) map.set(a.id, { email: a.email, nome: a.nome }); });
      if (actor) map.delete(actor);
      recipients = [...map.values()];
    }

    // Dedup por e-mail
    const seen = new Set<string>();
    recipients = recipients.filter((r) => r && r.email && !seen.has(r.email) && (seen.add(r.email), true));
    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: cors });
    }

    // Assunto e corpo por tipo
    let subject = "", intro = "";
    if (type === "aprovacao") {
      subject = "Nova aprovação: " + (record.titulo || "");
      intro = "Há uma nova aprovação aguardando sua avaliação em <b>" + projNome + "</b>.";
    } else if (type === "reuniao") {
      subject = "Reunião agendada: " + (record.titulo || "");
      intro = "Uma reunião foi agendada em <b>" + projNome + "</b>.";
    } else if (type === "mensagem") {
      subject = "Nova mensagem em " + projNome;
      intro = "Você recebeu uma nova mensagem em <b>" + projNome + "</b>.";
    } else {
      return new Response(JSON.stringify({ ok: true, skip: "tipo desconhecido" }), { headers: cors });
    }

    const titulo = record.titulo ? '<p style="font-size:16px;font-weight:700;margin:8px 0">' + record.titulo + "</p>" : "";
    const html = '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#1d2030">' +
      '<h2 style="color:#e8a33d;margin:0 0 12px">Dojo</h2>' +
      "<p>" + intro + "</p>" + titulo +
      '<p style="margin-top:18px"><a href="' + appUrl + '" style="display:inline-block;background:#e8a33d;color:#1a1300;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700">Abrir no Dojo</a></p>' +
      '<p style="color:#6b7186;font-size:12px;margin-top:24px">Você recebe este e-mail porque participa de um projeto no Dojo.</p>' +
      "</div>";

    let sent = 0;
    const errors: string[] = [];
    for (const r of recipients) {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + resendKey, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: r.email, subject, html }),
      });
      if (resp.ok) sent++;
      else errors.push(r.email + ": " + (await resp.text()));
    }

    return new Response(JSON.stringify({ ok: true, sent, errors }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
