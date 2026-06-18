# Publicar o portal By the C (Onda 2) — passo a passo turnkey

> Quem faz: Andrea (guiada pelo Icaro) **ou** Fábio / Me Ensina AI (conexão de infra, como no ADR).
> Custo: **$0** (Vercel free + Supabase free). Build roda na nuvem — não precisa de Node na máquina.

O banco Supabase JÁ está no ar. Falta só publicar a *tela* (este app Next.js).

---

## Passo 0 — Repositório PÚBLICO só do portal

Decisão da dona: o portal vai num repositório **público** próprio; o repositório dos **agentes continua PRIVADO**.

1. Em github.com (conta `ByTheCRealty-AI`), criar repo novo **público**, ex.: `bythec-portal`.
2. Subir SÓ o conteúdo da pasta `sistema/` (este app) como raiz desse repo novo.
   - Não subir nada de fora de `sistema/`. Sem `.env` (já está no `.gitignore`).
3. Pronto: repo público, sem nenhuma chave secreta dentro (conferido).

> Se o portal continuar como subpasta de um repo, o **Root Directory** na Vercel tem que apontar pra `sistema`. Se for repo próprio (passo 0), o Root Directory é a **raiz** (`/`).

## Passo 1 — Importar na Vercel

1. vercel.com → **Add New… → Project** → **Continue with GitHub** → autorizar.
2. Selecionar o repo `bythec-portal`.
3. **Framework**: Next.js (detecta sozinho). **Root Directory**: `/` (raiz, se repo próprio).

## Passo 2 — Variáveis de ambiente (3)

Em **Environment Variables**, colar exatamente:

```
NEXT_PUBLIC_SUPABASE_URL=https://ycpxdialfjtdzgsewsbk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljcHhkaWFsZmp0ZHpnc2V3c2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODM5NzcsImV4cCI6MjA5NzM1OTk3N30.Ijd9Sq8YPBZvWK_CuGoTN0aCKSBI2uXY643xinbPXL8
SUPABASE_SERVICE_ROLE_KEY=  <copiar do Supabase — ver abaixo>
```

**Onde achar a `service_role` (secreta):** supabase.com → projeto `bythec-sistema` (ref `ycpxdialfjtdzgsewsbk`) → **Project Settings → API → Project API keys → `service_role` → Reveal → copiar.**
- URL e `anon` são públicas por design (a `anon` já vai pro browser). A `service_role` é **secreta**: só entra na Vercel (server-side), **nunca** num arquivo do repo nem com prefixo `NEXT_PUBLIC_`.

Marcar as 3 para **Production**.

## Passo 3 — Deploy

Clicar **Deploy**. O build roda ~1–2 min na nuvem. Sai uma URL `https://bythec-portal.vercel.app` — abrir e ver o painel com os dados.

Se o build falhar: abrir o log na Vercel e mandar pro Icaro — ele lê e corrige.

---

## Estado atual (já feito)
- ✅ Supabase `bythec-sistema` no ar, 16 tabelas + RLS ligado, dados de exemplo + admins.
- ✅ App `sistema/` blindado pra build (Next 14, leitura via service_role server-side).
- ⏳ Falta só: passos 0–3 acima (exigem login humano — Vercel/GitHub).

## Quando o login (Supabase Auth) entrar (próxima onda)
- Trocar a leitura de `service_role` por `anon` + policies de RLS por usuário.
- Aí o portal pode até voltar a repo privado, se quiser.
