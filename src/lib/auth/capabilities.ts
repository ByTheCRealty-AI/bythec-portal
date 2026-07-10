// =============================================================================
// By the C — Capabilities (RBAC) · ÚNICA fonte de verdade no front
// =============================================================================
// Estas chaves e o mapa role -> defaults SÃO ESPELHADOS na função SQL has_cap()
// (migration 0005). Qualquer mudança aqui DEVE ser refletida lá, senão a UI e o
// banco discordam. A UI usa isto pra montar a navegação e bloquear telas; o RLS
// usa has_cap() pra bloquear de verdade no banco (camada segura).
// =============================================================================

export type AppRole =
  | "owner"
  | "manager"
  | "secretary"
  | "owner_client"
  | "tenant"
  | "realtor";

// Papéis internos (operam o painel). Os externos (owner_client/tenant/realtor)
// são reservados pros portais futuros e NÃO têm capacidade interna nenhuma.
export const INTERNAL_ROLES: AppRole[] = ["owner", "manager", "secretary"];

export function isInternalRole(role: AppRole): boolean {
  return INTERNAL_ROLES.includes(role);
}

// Todas as capabilities do sistema. Chave = string estável usada no banco também.
export type Capability =
  | "clients.edit"
  | "properties.edit"
  | "operations.edit" // requests / providers / listings
  | "financials.full" // todos os invoices/payments/expenses/commissions/payouts (ver + editar)
  | "invoices.service" // criar/ver SOMENTE invoices de serviço
  | "invoices.seasonal" // criar/ver SOMENTE invoices de temporada (Airbnb/VRBO)
  | "payments.annual" // gerir pagamentos de aluguel year-round
  | "reminders.view" // ver o quadro compartilhado de lembretes/follow-ups
  | "reminders.manage" // criar/atribuir/completar/editar/arquivar lembretes
  | "users.create"
  | "users.delete"
  | "users.manage_access";

export const ALL_CAPABILITIES: Capability[] = [
  "clients.edit",
  "properties.edit",
  "operations.edit",
  "financials.full",
  "invoices.service",
  "invoices.seasonal",
  "payments.annual",
  "reminders.view",
  "reminders.manage",
  "users.create",
  "users.delete",
  "users.manage_access",
];

// Labels amigáveis (UI, EN-US) pros toggles na tela de Users & Access.
export const CAPABILITY_LABEL: Record<Capability, string> = {
  "clients.edit": "Clients — view & edit",
  "properties.edit": "Properties — view & edit",
  "operations.edit": "Operations — requests, providers & listings",
  "financials.full": "Financials — full access (all invoices, payments, expenses, commissions, payouts)",
  "invoices.service": "Service invoices — create & view (service type only)",
  "invoices.seasonal": "Seasonal invoices — create & view (Airbnb / VRBO)",
  "payments.annual": "Year-round payments — manage rent payments",
  "reminders.view": "Reminders — see the shared follow-up board",
  "reminders.manage": "Reminders — create, assign, complete & archive",
  "users.create": "Users — invite & create logins",
  "users.delete": "Users — delete logins",
  "users.manage_access": "Users — edit roles & permissions",
};

export const CAPABILITY_HINT: Partial<Record<Capability, string>> = {
  "financials.full": "Grants everything in invoices, payments, expenses, commissions and owner payouts.",
  "users.delete": "Owner only. Removes a person's login from the system.",
  "users.manage_access": "Lets this person edit other people's role and permissions.",
};

// Role -> capabilities padrão. ESPELHA o CASE da has_cap() no SQL.
export const ROLE_DEFAULT_CAPS: Record<AppRole, Capability[]> = {
  owner: [...ALL_CAPABILITIES], // super admin: tudo
  manager: [
    "clients.edit",
    "properties.edit",
    "operations.edit",
    "financials.full",
    "invoices.service",
    "invoices.seasonal",
    "payments.annual",
    "reminders.view",
    "reminders.manage",
    "users.create",
    "users.manage_access",
    // NÃO tem users.delete
  ],
  secretary: [
    "clients.edit",
    "properties.edit",
    "operations.edit",
    "invoices.service",
    "invoices.seasonal", // vê/cria TODAS as invoices; NÃO vê commissions/payouts/expenses
    "payments.annual",
    "reminders.view",
    "reminders.manage",
    // SEM financials.full, SEM gestão de usuários
  ],
  // Externos: sem capacidade interna, EXCETO o quadro de lembretes — realtor
  // participa do board (pode ser designado e ver os follow-ups), mesmo default
  // da secretary pra reminders (confirmado com Andrea 2026-07-09).
  owner_client: [],
  tenant: [],
  realtor: ["reminders.view", "reminders.manage"],
};

// Overrides por usuário: { "financials.full": true } concede, { "invoices.service": false } revoga.
export type PermissionOverrides = Partial<Record<Capability, boolean>>;

// Forma mínima do profile que o front precisa pra decidir acesso.
export interface ProfileLike {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  role: AppRole;
  permissions: PermissionOverrides | null;
  active: boolean;
}

// Capacidade efetiva = defaults do papel, depois aplica overrides do usuário.
export function can(
  profile: Pick<ProfileLike, "role" | "permissions" | "active"> | null | undefined,
  cap: Capability
): boolean {
  if (!profile || !profile.active) return false;
  const overrides = profile.permissions ?? {};
  if (Object.prototype.hasOwnProperty.call(overrides, cap)) {
    return overrides[cap] === true;
  }
  return ROLE_DEFAULT_CAPS[profile.role]?.includes(cap) ?? false;
}

// Conjunto efetivo de capabilities de um profile (pra montar a sidebar de uma vez).
export function effectiveCaps(profile: Pick<ProfileLike, "role" | "permissions" | "active"> | null | undefined): Set<Capability> {
  const set = new Set<Capability>();
  if (!profile) return set;
  for (const cap of ALL_CAPABILITIES) {
    if (can(profile, cap)) set.add(cap);
  }
  return set;
}

// Tem QUALQUER capacidade de gestão de usuários? (controla a aba Users & Access.)
export function canManageUsers(profile: Pick<ProfileLike, "role" | "permissions" | "active"> | null | undefined): boolean {
  return (
    can(profile, "users.create") ||
    can(profile, "users.delete") ||
    can(profile, "users.manage_access")
  );
}

// --- Regras de quem pode mexer em quem (espelham o RLS de profiles) ----------

// Pode editar role/permissions/active do alvo?
// - owner edita QUALQUER um.
// - manager edita SÓ alvos cujo papel NÃO é owner nem manager.
export function canEditTarget(actor: ProfileLike, targetRole: AppRole): boolean {
  if (!can(actor, "users.manage_access")) return false;
  if (actor.role === "owner") return true;
  // manager (ou quem tem o cap via override) não toca em owner/manager.
  return targetRole !== "owner" && targetRole !== "manager";
}

// Pode ATRIBUIR este papel a alguém? Só owner promove a owner/manager.
export function canAssignRole(actor: ProfileLike, role: AppRole): boolean {
  if (actor.role === "owner") return true;
  return role !== "owner" && role !== "manager";
}

// Pode deletar/remover logins? Owner only.
export function canDeleteUsers(actor: ProfileLike): boolean {
  return can(actor, "users.delete") && actor.role === "owner";
}

// Pode PERMANENTEMENTE deletar clientes/propriedades (hard delete via RPC)?
// OWNER ONLY — NÃO é uma capability concedível (não aparece em Users & Access,
// não entra na union Capability). É amarrado ao papel `owner` direto, de
// propósito: é a ação mais destrutiva do sistema. O banco (admin_delete_*)
// reforça isso server-side; este helper só guarda a UI e as server actions.
export function canDelete(
  profile: Pick<ProfileLike, "role" | "active"> | null | undefined
): boolean {
  return !!profile && profile.active && profile.role === "owner";
}

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  secretary: "Secretary",
  owner_client: "Property Owner (portal)",
  tenant: "Tenant (portal)",
  realtor: "Realtor (portal)",
};
