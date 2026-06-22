# By the C — Sistema próprio (Onda 2)

Sistema de gestão que substitui o Bubble da **By the C Realty & Property Management** (Cape Cod, MA).
Esta pasta é a **fundação** da Onda 2: schema completo do banco + painel interno com os módulos
**Clientes**, **Propriedades** e **Invoices** funcionais. Os demais módulos têm o schema modelado e
placeholders na UI.

> **Invoices** suporta dois tipos: **Service** (manutenção, itens Labor/Material) e **Seasonal**
> (Airbnb/VRBO, fórmula travada de owner-payout). Numeração por tipo via trigger atômico no banco.
> Secretárias (`invoices.service`) só veem/criam Service; `financials.full` vê tudo. O detalhe é o
> invoice da marca, com Print / Save as PDF (print CSS dedicado). Formatos decodificados +
> exemplos verificados em [`docs/invoice-formats.md`](docs/invoice-formats.md).

> No futuro esta pasta vira um repositório próprio no GitHub do cliente (`info@bythecrealty.com`).
> Por ora vive dentro do repo BA.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) + Tailwind CSS |
| Backend | Supabase (Postgres + Auth + Storage) |
| Cliente DB | `@supabase/supabase-js` + `@supabase/ssr` |
| Ícones | lucide-react |
| Fontes | Space Grotesk (display) + Manrope (body) via `next/font` |

Design: tema CLARO premium By the C (fundo `#f6f8f7`, verdes da marca primário `#198577` /
secundário `#04a27f`), superfícies brancas com sombra suave, gradients/grid de fundo, empty states
com ícone + mensagem + CTA. UI em inglês (US), dinheiro em USD, datas em `America/New_York`.

### Auth + RBAC (login real)
Login por e-mail/senha (Supabase Auth, sessão por cookie via `@supabase/ssr`). `middleware.ts` protege
todas as rotas do painel. Acesso por **capability** (ver `src/lib/auth/capabilities.ts`), espelhado no
SQL via `has_cap()` (migration `0005`) — o RLS do banco é a camada segura. Papéis internos: **owner**
(super admin), **manager** (gestão sem deletar usuários), **secretary** (operação sem finanças nem
gestão de usuários). Tela **Users & Access** (`/users`) convida logins por e-mail (a pessoa define a
própria senha), edita papel/permissões/ativo e remove (owner only).

---

## Estrutura de pastas

```
sistema/
├── supabase/
│   ├── config.toml                 # config do stack local (portas, auth, storage)
│   ├── seed.sql                    # dados FICTÍCIOS de demo (não são reais da Andrea)
│   └── migrations/
│       ├── 0001_enums_and_core.sql   # enums + clients + properties (entidade-mãe)
│       ├── 0002_finance.sql          # invoices, invoice_items, payments, expenses
│       ├── 0003_operations.sql       # requests, providers, services, listings, notes, documents
│       ├── 0004_users_and_rls.sql    # esqueleto antigo (substituído por 0005)
│       ├── 0005_auth_rbac.sql        # profiles + app_role + has_cap() + RLS por capacidade
│       ├── 0006_profile_structured_address.sql
│       ├── 0007_clients_structured_billing.sql
│       └── 0008_invoice_numbering_and_commission.sql  # 2 sequences por tipo + trigger + commission %
├── src/
│   ├── app/
│   │   ├── layout.tsx              # root: fontes + globals
│   │   ├── globals.css             # tema premium (glass, grid, gradients)
│   │   └── (painel)/
│   │       ├── layout.tsx          # sidebar + área de conteúdo
│   │       ├── page.tsx            # Overview (contadores)
│   │       ├── clientes/           # MÓDULO FUNCIONAL (list, novo, [id], editar)
│   │       ├── propriedades/       # MÓDULO FUNCIONAL (list, [id], editar)
│   │       ├── invoices/           # MÓDULO FUNCIONAL (list, novo/servico, novo/temporada, [id], [id]/editar)
│   │       └── payments|expenses|requests|providers|listings/  # placeholders
│   ├── components/                 # Sidebar, Tabs, UnderConstruction, ui/
│   ├── middleware.ts               # protege todas as rotas do painel (sessão)
│   └── lib/
│       ├── types.ts                # tipos do domínio + rótulos
│       ├── format.ts               # money (USD), date (NY), cx
│       ├── auth/capabilities.ts    # RBAC: capabilities + role defaults (fonte de verdade do front)
│       ├── auth/session.ts         # getProfile / requireProfile / requireCapability
│       └── supabase/               # client.ts (browser) · server.ts (sessão+RLS) · admin.ts (service_role)
├── env.example.txt                 # template de env (renomear p/ .env.example / .env.local)
├── package.json · tsconfig.json · tailwind.config.ts · next.config.mjs · postcss.config.mjs
└── .gitignore                      # .env* ignorado (só .env.example versiona)
```

---

## Como rodar local (4 passos)

Pré-requisitos: **Node 18+**, **npm**, **Docker** (para o Supabase local) e a **Supabase CLI**
(`brew install supabase/tap/supabase`).

```bash
# 1. Instalar dependências
cd sistema
npm install

# 2. Subir o Postgres + Auth + Storage local (aplica migrations + seed.sql automaticamente)
supabase start
#    -> o terminal imprime API URL, anon key e service_role key. Copie a anon key.

# 3. Configurar ambiente
cp env.example.txt .env.local
#    -> cole a anon key em NEXT_PUBLIC_SUPABASE_ANON_KEY (e a service_role se for usar scripts)

# 4. Rodar o app
npm run dev
#    -> http://localhost:3000
```

Para recriar o banco do zero (reaplica migrations + seed): `supabase db reset`.

> **Nota sobre o `.env`:** a política de segurança do repo BA bloqueia escrita direta em `.env*`,
> então o template foi versionado como `env.example.txt`. Renomeie para `.env.example` quando esta
> pasta virar o repo próprio do cliente. **Nenhuma credencial real vai versionada** — só placeholders.

---

## O que está PRONTO (demoável)

- **Schema completo** das 16 tabelas núcleo + enums, com as regras de negócio travadas em comentários SQL.
- **Painel** com navegação lateral de todos os módulos (Overview, Clientes, Propriedades, Invoices,
  Payments, Expenses, Requests, Providers, Listings).
- **Clientes (CRUD completo):** listar (filtra arquivados, filtro por tipo), criar com `client_type`,
  ver detalhe com abas (Detalhes, Propriedades, Notas/Documentos/Requests stub), editar, **arquivar**
  (nunca deletar) e restaurar.
- **Propriedades:** pendurar no cliente com **owner + endereço auto-preenchidos**, listar (filtro por
  tipo), ver detalhe, editar, arquivar/restaurar. Datas de lease só aparecem para aluguel.
- **Seed** com 4 clientes e 3 propriedades fictícios para demo.
- **Overview** com contadores ao vivo + fallback elegante quando o banco não está conectado.

### Regras travadas refletidas no schema
- **Cliente = entidade-mãe:** `properties.owner_id → clients.id` NOT NULL + `on delete restrict`.
- **Nunca deletar — arquivar:** `archived_at` em toda tabela de dado real; listas filtram `IS NULL`.
- **invoice_number** via sequence dedicada (`start 336`): sequencial, único, sem reuso.
- **invoice_items.type** (`charge|discount|fee`): sinal explícito, nunca por workflow (fix do bug nº1).
- **payments.status** (`due|received`): regime de caixa, comissão só conta quando recebida.
- **expenses:** `property_id` e `client_id` opcionais + `category`/`vendor` (despesa do próprio negócio).
- **cleaning_goes_to** (`owner|bythec`): flag por invoice — as 2 incógnitas (% comissão e destino do
  cleaning) **só são modeladas**, não resolvidas (decisão da Andrea, vive no `bythec-mcp`).

---

## O que NÃO foi validado nesta sandbox

A sandbox de build **não tem Node/npm/Docker**, então **não foi possível rodar `npm install`,
`npm run build` nem `supabase start` aqui**. O código está escrito para compilar limpo no Next 14 +
TS strict, mas o type-check/build precisa ser rodado na máquina da Andrea/Fábio:

```bash
cd sistema && npm install && npm run typecheck && npm run build
```

Se aparecer qualquer ajuste de versão de dependência, corrigir antes do deploy.

---

## Próximos passos (próximas rodadas)

1. **Validar build local** (`npm install` + `supabase start` + `npm run dev`).
2. **Migração do Bubble** (83 clients / 53 properties / 235 invoices) — ver `docs/migracao-bubble.md`.
3. **Supabase Auth + RLS** (migration 0004 deixou o esqueleto) — login + acesso granular por aba.
4. **Módulo Invoices** plugado ao `bythec-mcp` (fórmula travada) + PDF limpo + enviar ao dono.
5. **Payments** (regime de caixa, comprovante multi-foto/HEIC) e **Expenses**.
6. **Requests / Services / Providers** e portais (inquilino/dono/prestador) — Fase 2.
7. **Storage buckets** (`client-photos`, `property-photos`, `invoice-pdfs`, `payment-receipts`, `documents`).

> **Importante:** a criação do projeto Supabase remoto e o deploy (Vercel) são **decisão da Andrea**
> e ainda estão pendentes. Esta rodada é 100% local — nenhum recurso pago foi criado.
