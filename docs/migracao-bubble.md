# Plano de migração — Bubble → Supabase

Migração dos dados reais do Bubble para o sistema novo. Volume conhecido:
**83 clients · 53 properties · 235 invoices** (+ items, payments, expenses, listings, etc).

> **Regra de ouro:** NUNCA inventar dado faltante. Campo vazio no export = campo nulo no destino.
> Se um match (owner, tipo, endereço) não bate com confiança, vai para **revisão manual** — nunca chuta.
> (Mesma doutrina do `owner-payout` / `bythec-mcp`.)

---

## Ordem de import (respeita as foreign keys)

A ordem importa porque `properties.owner_id` é NOT NULL e referencia `clients`, e quase tudo
referencia `properties`. Importar fora de ordem quebra as FKs.

```
1. clients            (entidade-mãe — primeiro de tudo)
2. client_roles       (papéis extras, se o Bubble tiver múltiplos tipos por cliente)
3. service_providers  (independente)
4. properties         (precisa de clients prontos para owner_id / tenant_id)
5. invoices           (precisa de clients + properties)
6. invoice_items      (precisa de invoices)
7. payments           (precisa de properties + invoices + tenants)
8. expenses           (property_id / client_id opcionais)
9. tenant_requests    (precisa de properties + tenants)
10. services          (precisa de tenant_requests + properties + providers)
11. listings          (precisa de clients)
12. notes / documents (polimórficos — precisam dos pais já existirem)
```

Atachments de arquivo (fotos, PDFs, comprovantes) **provavelmente não migram automaticamente** do
Bubble — plano B é upload manual no Google Drive / Supabase Storage e religar a referência depois.

---

## Mapeamento de colunas Bubble → tabela nova

### clients
| Bubble | Nova coluna | Tratamento |
|---|---|---|
| Name | `name` | obrigatório; sem nome = revisão manual |
| ClientType (OS Client Type) | `client_type` | mapear option set (abaixo). "Airbnb Guest" descartado |
| Email / PhoneNumber | `email` / `phone` | trim; vazio = null |
| Photo | `photo_url` | URL do Bubble; rebaixar p/ Storage depois |
| Notes | `notes` | — |
| BillingAddress (geo) | `billing_address` | extrair o texto do campo geo |
| BillingAddress2 | `billing_address2` | unidade/apto |
| CoClientName/Email/PhoneNumber | `co_client_*` | — |
| EmailNotifications / SMSNotifications | `email_notifications` / `sms_notifications` | yes/no → bool |
| Active | `active` | yes/no → bool |
| (sem equivalente) | `archived_at` | null no import (todos entram ativos) |

### properties
| Bubble | Nova coluna | Tratamento |
|---|---|---|
| Owner → Clients | `owner_id` | resolver por id do cliente já importado. **Sem owner = revisão manual** (NOT NULL) |
| Address (geo) / AddressText | `address` / `address_text` | endereço da base, com unit number |
| Address2 | `address2` | unidade |
| PropertyType (OS Listing Type) | `property_type` | mapear option set |
| CommissionFee | `commission_fee` | numeric |
| (Tenant, se existir) | `tenant_id` | resolver por id; opcional |
| RentPrice / RentalStart / RentalEnd / RentDueDay / RentFrequency | idem | datas: vacation rental não tem |
| Notes / Photo | `notes` / `photo_url` | — |

### invoices
| Bubble | Nova coluna | Tratamento |
|---|---|---|
| (ID sequencial do Bubble) | `invoice_number` | **preservar o número original**. Ver nota da sequence abaixo |
| Client / Property | `client_id` / `property_id` | resolver por id |
| Platform | `platform` | texto (Airbnb/VRBO) |
| (derivar) | `kind` | seasonal se tem room/cleaning; service se tem labor/material |
| Date / DueDate / DatesReserved / PaidDate / Paid | idem | DatesReserved (range) → `dates_reserved_start/end` |
| ByTheCCommission, CleaningFee, GuestServiceFee, HostServiceFee, HostPayout, OccupancyTaxes, LodgingTaxesVrbo, RentalDiscount, RentalNights, TotalPaidByGuest, TotalReceivedByOwner, Vrbo* | colunas homônimas | numeric; vazio = null. **NÃO recalcular** no import — importar como está |
| (cleaning destino) | `cleaning_goes_to` | se o Bubble não tem flag explícita → deixar null + revisão |
| GuestName / Notes / InvoicePDF | `guest_name` / `notes` / `pdf_url` | — |

> **invoice_number e a sequence:** a migration cria `invoice_number_seq` com `start 336`. Ao migrar,
> importar os invoices com o número ORIGINAL do Bubble (override do default) e, ao final, ajustar a
> sequence: `select setval('invoice_number_seq', (select max(invoice_number) from invoices));`
> Assim os números antigos são preservados e os novos seguem sem colidir/reusar.

### invoice_items
| Bubble | Nova coluna | Tratamento |
|---|---|---|
| Invoice / Description / Total | `invoice_id` / `description` / `total` | — |
| Guest / Owner (yes/no) | `guest` / `owner` | bool |
| (sem campo "tipo" no Bubble — era o bug) | `type` | **inferir:** total negativo → `discount`; senão `charge`. Casos ambíguos → revisão manual. NUNCA assumir cego |

### payments
| Bubble | Nova coluna | Tratamento |
|---|---|---|
| Property / Invoice / Tenant | `property_id` / `invoice_id` / `tenant_id` | resolver por id |
| Month / DueDate / RentAmount / Commission | idem | — |
| Paid? / "commission received" | `status` | recebido → `received` + `received_at`; senão `due`. **Regime de caixa** |

### expenses
| Bubble | Nova coluna | Tratamento |
|---|---|---|
| Client / Property | `client_id` / `property_id` | agora OPCIONAIS |
| Date / DueDate / Price / Paid / PaidBy | idem | PaidBy (OS) → enum |
| (sem no Bubble) | `category` / `vendor` | null no import; preencher manualmente depois |

### listings / notes / documents
- listings: mapear specs (beds/baths/etc), `listing_type` (rental/sale), `listing_status`, flags `active`/`featured`.
- notes/documents (ClientNotes, PropertyNotes, ListingNotes, *Docs): polimórficos → setar
  `parent_type` (client/property/listing) + `parent_id`. `documents.year` preenchido a partir da data.

---

## Option sets (Bubble) → enums (Postgres)

| OS Bubble | Valores → enum novo |
|---|---|
| OS Client Type | Tenant→`tenant`, AirBnB Owner→`airbnb_owner`, Landlord→`landlord`, Off-Season Tenant→`off_season_tenant`, (Buy/Sell)→`buy_sell_client`. **"Airbnb Guest" descartado** |
| OS Listing Type (property/listing) | Year-Round Rental→`year_round_rental`, Vacation Rental→`vacation_rental`, Off-Season/Winter→`off_season_rental`, For Sale→`for_sale` |
| OS Listing Status | mapear p/ `active`/`pending`/`sold`/`rented`/`off_market` |
| OS Paid By | mapear p/ `bythec`/`owner`/`tenant`/`other` |

> Os valores exatos dos option sets ainda precisam ser confirmados no export CSV (estavam pendentes
> no blueprint). Qualquer valor que não casar com o enum → revisão manual antes de inserir.

---

## Procedimento recomendado

1. Exportar as 24 tabelas do Bubble em CSV (headers = schema; dados = registros).
2. Carregar os CSVs numa tabela de staging (schema `staging`, colunas `text`) — não transformar ainda.
3. Rodar scripts de mapeamento na ordem de FK acima, gerando um relatório de:
   - registros inseridos OK
   - registros em **revisão manual** (owner não resolvido, option set desconhecido, sinal de item ambíguo)
4. Revisar manualmente a fila com a Andrea/Aline.
5. Ajustar a sequence de invoice_number.
6. Conferência: contar registros por tabela vs. Bubble (83/53/235) e validar somas financeiras de amostra.

> O export do Bubble provavelmente vem bagunçado. A Onda 1 (agentes Claude Native) não depende dele
> para funcionar — esta migração é tarefa da Fase 1 do build pago (Onda 2).
