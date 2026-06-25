# Modelos de e-mail do Dojo (Supabase Auth)

Cole estes HTMLs em **Supabase → Authentication → Emails → Templates**.
Antes, configure também:

- **Authentication → URL Configuration**
  - **Site URL:** `https://akira-dojo.vercel.app`
  - **Redirect URLs:** `https://akira-dojo.vercel.app/**`
- **Authentication → Emails → SMTP** (para os e-mails saírem de verdade, com sua marca):
  - Sender name: `Dojo · Akira`
  - Sender email: `no-reply@SEU-DOMINIO` (domínio verificado no Resend)
  - Host: `smtp.resend.com` · Port: `465` · User: `resend` · Password: a sua chave do Resend.

Variáveis disponíveis nos templates: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}`, `{{ .Token }}`.

---

## 1) Convite (Invite user)

**Assunto:** Você foi convidado para o Dojo

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#16161f;border:1px solid #2a2a38;border-radius:16px;overflow:hidden">
      <tr><td style="padding:26px 30px 8px">
        <div style="display:inline-block;width:34px;height:34px;border:2.5px solid #e8a33d;border-radius:50%;vertical-align:middle"></div>
        <span style="color:#fff;font-size:20px;font-weight:800;margin-left:10px;vertical-align:middle">Dojo <span style="color:#9a9ab0;font-weight:400">Akira</span></span>
      </td></tr>
      <tr><td style="padding:10px 30px 4px">
        <h1 style="color:#fff;font-size:21px;margin:8px 0">Bem-vindo(a) ao seu portal</h1>
        <p style="color:#c7c7d6;font-size:15px;line-height:1.6;margin:8px 0 18px">
          Você foi convidado para acompanhar o projeto pelo <b>Dojo</b> — o portal onde ficam o painel,
          as entregas, aprovações e mensagens. Clique abaixo para criar seu acesso.
        </p>
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#e8a33d;color:#1a1300;text-decoration:none;font-weight:800;font-size:15px;padding:13px 26px;border-radius:10px">Criar meu acesso</a>
        <p style="color:#7a7a90;font-size:12.5px;line-height:1.6;margin:22px 0 6px">
          Se o botão não funcionar, copie e cole este link no navegador:<br>
          <a href="{{ .ConfirmationURL }}" style="color:#e8a33d;word-break:break-all">{{ .ConfirmationURL }}</a>
        </p>
        <p style="color:#7a7a90;font-size:12px;margin:14px 0 0">Não esperava este convite? Pode ignorar este e-mail.</p>
      </td></tr>
      <tr><td style="padding:18px 30px 26px;border-top:1px solid #2a2a38;color:#5d5d70;font-size:11.5px">Dojo · Akira — portal de clientes</td></tr>
    </table>
  </td></tr>
</table>
```

---

## 2) Redefinir senha (Reset password)

**Assunto:** Redefinir sua senha do Dojo

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#16161f;border:1px solid #2a2a38;border-radius:16px;overflow:hidden">
      <tr><td style="padding:26px 30px 8px">
        <div style="display:inline-block;width:34px;height:34px;border:2.5px solid #e8a33d;border-radius:50%;vertical-align:middle"></div>
        <span style="color:#fff;font-size:20px;font-weight:800;margin-left:10px;vertical-align:middle">Dojo <span style="color:#9a9ab0;font-weight:400">Akira</span></span>
      </td></tr>
      <tr><td style="padding:10px 30px 4px">
        <h1 style="color:#fff;font-size:21px;margin:8px 0">Redefinir sua senha</h1>
        <p style="color:#c7c7d6;font-size:15px;line-height:1.6;margin:8px 0 18px">
          Recebemos um pedido para redefinir a senha da conta <b>{{ .Email }}</b>. Clique abaixo para escolher uma nova senha.
        </p>
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#e8a33d;color:#1a1300;text-decoration:none;font-weight:800;font-size:15px;padding:13px 26px;border-radius:10px">Definir nova senha</a>
        <p style="color:#7a7a90;font-size:12.5px;line-height:1.6;margin:22px 0 6px">
          Ou copie e cole este link:<br>
          <a href="{{ .ConfirmationURL }}" style="color:#e8a33d;word-break:break-all">{{ .ConfirmationURL }}</a>
        </p>
        <p style="color:#7a7a90;font-size:12px;margin:14px 0 0">Não foi você? Ignore este e-mail — sua senha continua a mesma.</p>
      </td></tr>
      <tr><td style="padding:18px 30px 26px;border-top:1px solid #2a2a38;color:#5d5d70;font-size:11.5px">Dojo · Akira — portal de clientes</td></tr>
    </table>
  </td></tr>
</table>
```

---

## 3) Link mágico (Magic Link)

**Assunto:** Seu link de acesso ao Dojo

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#16161f;border:1px solid #2a2a38;border-radius:16px;overflow:hidden">
      <tr><td style="padding:26px 30px 8px">
        <div style="display:inline-block;width:34px;height:34px;border:2.5px solid #e8a33d;border-radius:50%;vertical-align:middle"></div>
        <span style="color:#fff;font-size:20px;font-weight:800;margin-left:10px;vertical-align:middle">Dojo <span style="color:#9a9ab0;font-weight:400">Akira</span></span>
      </td></tr>
      <tr><td style="padding:10px 30px 4px">
        <h1 style="color:#fff;font-size:21px;margin:8px 0">Entrar no Dojo</h1>
        <p style="color:#c7c7d6;font-size:15px;line-height:1.6;margin:8px 0 18px">Clique no botão para entrar — sem precisar de senha.</p>
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#e8a33d;color:#1a1300;text-decoration:none;font-weight:800;font-size:15px;padding:13px 26px;border-radius:10px">Entrar no Dojo</a>
        <p style="color:#7a7a90;font-size:12.5px;line-height:1.6;margin:22px 0 6px">
          Ou copie e cole este link:<br>
          <a href="{{ .ConfirmationURL }}" style="color:#e8a33d;word-break:break-all">{{ .ConfirmationURL }}</a>
        </p>
      </td></tr>
      <tr><td style="padding:18px 30px 26px;border-top:1px solid #2a2a38;color:#5d5d70;font-size:11.5px">Dojo · Akira — portal de clientes</td></tr>
    </table>
  </td></tr>
</table>
```
