# Dojo — Painéis de Clientes

Portal sob medida onde **você (admin) administra clientes e projetos** e **cada cliente acessa só o que lhe cabe** — visualiza, interage, aprova. Vanilla JS, sem build. Backend **Supabase** (Auth + Postgres + RLS).

## Arquitetura (3 camadas)

1. **Console (admin)** — lista de clientes, status dos projetos, dashboard, selecionar quem trabalhar.
2. **Gestão interna (privada)** — dados, documentos, anotações, checklists, mensagens aos participantes.
3. **Portal do cliente** — visualiza, marca concluído, responde, anexa, comenta, aprova/reprova.

Permissões granulares (quem adiciona pessoas, envia mensagem, marca reunião, vê documento) vivem na tabela `membros` e são aplicadas por **RLS** no banco.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Shell (topbar, canvas, SDK do Supabase via CDN). |
| `config.js` | URL + publishable key do Supabase (seguro no cliente; a segurança real é a RLS). |
| `app.js` | Motor: sessão/papéis, console, projetos, painel, 4 widgets, edição (admin/gestor). |
| `style.css` | Design system (tokens, tiles, páginas, modais). |

## Backend (Supabase)

- Projeto: **Dojo** (`lcdayrmcgcwtkutmxjbo`, região sa-east-1, org Akira).
- Tabelas: `pessoas`, `clientes`, `projetos`, `membros`, `paineis`.
- Helpers de permissão em schema `private` (não expostos via API); RLS em todas as tabelas.
- Migrations versionadas: `01_core_schema` → `04_bootstrap_owner_admin`.

## Rodar local

```bash
cd dojo
python3 -m http.server 8011
# abra http://localhost:8011
```

## Primeiro acesso (virar admin)

1. Abra o app → **Entrar** → aba **Criar conta** → cadastre-se com `thiagoogura@gmail.com`.
2. Confirme o e-mail (link do Supabase) e entre. Esse e-mail vira **admin** automaticamente (bootstrap do dono).
3. Console aberto: **＋ Novo cliente** → entre no cliente → **＋ Novo projeto** → abra o projeto → **✏ Editar** → **＋ Adicionar** widgets.

Login do cliente: e-mail/senha **ou** link mágico. Um participante só vê os projetos em que é `membro`.

## Adicionar um widget novo

Em `app.js`, dentro de `WIDGETS`:

```js
meuwidget: {
  emoji: "⭐", name: "Meu Widget", desc: "…",
  w: 3, h: 2, defaults: { title: "", valor: "" },
  render(t, c) { c.innerHTML = '<div class="kpi">…' + esc(t.props.valor) + '</div>'; },
  form(p) { return field("Valor", "valor", p.valor); }
}
```

## Próximas fases

- **2** — gestão interna: documentos, anotações, checklists, mensagens.
- **3** — portal do cliente: marcar concluído, aprovar/reprovar, comentar.
- **4** — questionários, anexos (Storage), @menções, reuniões.
- **5** — UI das permissões granulares.
