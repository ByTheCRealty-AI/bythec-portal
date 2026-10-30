"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ALL_CAPABILITIES,
  CAPABILITY_LABEL,
  CAPABILITY_HINT,
  ROLE_DEFAULT_CAPS,
  ROLE_LABEL,
  INTERNAL_ROLES,
  type AppRole,
  type Capability,
  type ProfileLike,
} from "@/lib/auth/capabilities";
import { Badge, buttonClass, Field, inputClass, EmptyState } from "@/components/ui";
import { PhoneInput, AddressFields } from "@/components/form-fields";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, ACCEPTED_IMAGE_TYPES } from "@/lib/image-prep";
import {
  inviteUserAction,
  updateUserAccessAction,
  deleteUserAction,
  setProfilePhotoAction,
  removeProfilePhotoAction,
} from "./actions";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  CircleSlash,
  ImagePlus,
  Globe,
} from "lucide-react";

const TEAM_BUCKET = "team-photos";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

type Actor = Pick<ProfileLike, "id" | "role" | "permissions" | "active">;

// Papéis que ESTE ator pode atribuir, dado o seu papel.
function assignableRoles(actorIsOwner: boolean): AppRole[] {
  // Externos (portais): Property Owner, Tenant, Realtor. owner/manager podem
  // convidar external roles (o server já permite via canAssignRole); manager NÃO
  // pode criar owner/manager, mas PODE criar owner_client/tenant/realtor/secretary.
  const external: AppRole[] = ["owner_client", "tenant", "realtor"];
  return actorIsOwner
    ? (["owner", "manager", "secretary", ...external] as AppRole[])
    : (["secretary", ...external] as AppRole[]);
}

// O ator pode editar o alvo? (espelha canEditTarget do server)
function actorCanEdit(actorIsOwner: boolean, targetRole: AppRole): boolean {
  if (actorIsOwner) return true;
  return targetRole !== "owner" && targetRole !== "manager";
}

// Field names dos profiles (Users) pro AddressFields compartilhado.
const PROFILE_ADDRESS_NAMES = {
  line1: "address_line1",
  line2: "address_line2",
  city: "city",
  state: "state",
  zip: "zip",
} as const;

// Pré-preenche o AddressFields a partir de um profile (mantém o fallback legado
// de `address` solto no line1).
function profileAddressDefaults(user?: ProfileLike) {
  return {
    line1: user?.address_line1 ?? user?.address ?? "",
    line2: user?.address_line2 ?? "",
    city: user?.city ?? "",
    state: user?.state ?? "",
    zip: user?.zip ?? "",
  };
}

export function UsersManager({
  users,
  actor,
  canCreate,
  canDelete,
  canManageAccess,
  actorIsOwner,
}: {
  users: ProfileLike[];
  actor: Actor;
  canCreate: boolean;
  canDelete: boolean;
  canManageAccess: boolean;
  actorIsOwner: boolean;
}) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<ProfileLike | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  function refresh(msg: string) {
    setBanner({ kind: "ok", msg });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {banner && (
        <div
          className={
            "rounded-xl border px-4 py-3 text-sm " +
            (banner.kind === "ok"
              ? "border-primary/30 bg-primary/[0.07] text-ink/80"
              : "border-red-200 bg-red-50 text-red-600")
          }
        >
          {banner.msg}
        </div>
      )}

      <div className="flex justify-end">
        {canCreate && (
          <button onClick={() => setShowInvite(true)} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add login
          </button>
        )}
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="No logins yet"
          message="Invite the first person. They will receive an email to set their own password."
          cta={
            canCreate ? (
              <button onClick={() => setShowInvite(true)} className={buttonClass("primary")}>
                <Plus className="h-4 w-4" /> Add login
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Email</th>
                <th className="px-5 py-3 font-bold">Phone</th>
                <th className="px-5 py-3 font-bold">Role</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const editable = canManageAccess && actorCanEdit(actorIsOwner, u.role);
                const deletable = canDelete && u.id !== actor.id;
                return (
                  <tr
                    key={u.id}
                    className={
                      "border-t border-black/[0.05] " + (i % 2 === 1 ? "bg-black/[0.015]" : "")
                    }
                  >
                    <td className="px-5 py-3.5 font-semibold text-ink">
                      {u.full_name || "—"}
                      {u.id === actor.id && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-ink/40">You</span>
                      )}
                      {u.show_on_website && (
                        <span
                          title="Shown on the public website"
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary align-middle"
                        >
                          <Globe className="h-3 w-3" /> On website
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-ink/65">{u.email || "—"}</td>
                    <td className="px-5 py-3.5 text-ink/65">{u.phone || "—"}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={u.role === "owner" ? "gold" : u.role === "manager" ? "orange" : "neutral"}>
                        {ROLE_LABEL[u.role]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <Check className="h-3.5 w-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink/45">
                          <CircleSlash className="h-3.5 w-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {editable && (
                          <button
                            onClick={() => setEditing(u)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-semibold text-ink/65 transition hover:border-black/20 hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        )}
                        {deletable && (
                          <DeleteButton
                            user={u}
                            onDone={(msg, ok) => {
                              if (ok) refresh(msg);
                              else setBanner({ kind: "err", msg });
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteDialog
          actorIsOwner={actorIsOwner}
          onClose={() => setShowInvite(false)}
          onDone={(msg, ok) => {
            setShowInvite(false);
            if (ok) refresh(msg);
            else setBanner({ kind: "err", msg });
          }}
        />
      )}

      {editing && (
        <EditDialog
          user={editing}
          actorIsOwner={actorIsOwner}
          onClose={() => setEditing(null)}
          onDone={(msg, ok) => {
            setEditing(null);
            if (ok) refresh(msg);
            else setBanner({ kind: "err", msg });
          }}
        />
      )}
    </div>
  );
}

// ---- Modal shell -----------------------------------------------------------
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-10 backdrop-blur-sm">
      <div
        className={
          "w-full rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card " +
          (wide ? "max-w-4xl" : "max-w-lg")
        }
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="h-display text-lg text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink/45 transition hover:bg-black/[0.04] hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ---- Invite ----------------------------------------------------------------
function InviteDialog({
  actorIsOwner,
  onClose,
  onDone,
}: {
  actorIsOwner: boolean;
  onClose: () => void;
  onDone: (msg: string, ok: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const roles = assignableRoles(actorIsOwner);

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await inviteUserAction(fd);
      if (res.ok) onDone("Invite sent. The person will get an email to set their password.", true);
      else setError(res.error);
    });
  }

  return (
    <Modal title="Add login" onClose={onClose}>
      <form action={submit} className="space-y-4">
        <Field label="Full name">
          <input name="full_name" className={inputClass} placeholder="Jane Doe" />
        </Field>
        <AddressFields names={PROFILE_ADDRESS_NAMES} defaults={profileAddressDefaults()} />
        <Field label="Email" hint="They will receive an invite to set their own password.">
          <input name="email" type="email" required className={inputClass} placeholder="jane@bythecrealty.com" />
        </Field>
        <Field label="Phone">
          <PhoneInput />
        </Field>
        <Field label="Role">
          <select name="role" defaultValue="secretary" className={inputClass}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass("primary") + " disabled:opacity-60"}>
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Send invite"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Edit ------------------------------------------------------------------
type OverrideState = "default" | "true" | "false";

function EditDialog({
  user,
  actorIsOwner,
  onClose,
  onDone,
}: {
  user: ProfileLike;
  actorIsOwner: boolean;
  onClose: () => void;
  onDone: (msg: string, ok: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole>(user.role);
  const [active, setActive] = useState<boolean>(user.active);

  // Website presence ("Meet the Team")
  const [showOnWebsite, setShowOnWebsite] = useState<boolean>(!!user.show_on_website);
  const [photoUrl, setPhotoUrl] = useState<string | null>(user.public_photo_url ?? null);
  const [nameForInitials, setNameForInitials] = useState<string>(user.full_name ?? "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoErr(null);
    setPhotoBusy(true);
    try {
      const prepared = await prepareImage(file);
      const supabase = createClient();
      const path = `${user.id}/${Date.now()}-${prepared.fileName}`;
      const { error: upErr } = await supabase.storage
        .from(TEAM_BUCKET)
        .upload(path, prepared.blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from(TEAM_BUCKET).getPublicUrl(path);
      const fd = new FormData();
      fd.set("id", user.id);
      fd.set("photo_url", pub.publicUrl);
      fd.set("photo_path", path);
      const res = await setProfilePhotoAction(fd);
      if (!res.ok) throw new Error(res.error);
      setPhotoUrl(pub.publicUrl);
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : "That photo could not be uploaded.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemovePhoto() {
    setPhotoErr(null);
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.set("id", user.id);
      const res = await removeProfilePhotoAction(fd);
      if (!res.ok) throw new Error(res.error);
      setPhotoUrl(null);
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : "Could not remove the photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const initialOverride = (cap: Capability): OverrideState => {
    const o = user.permissions ?? {};
    if (Object.prototype.hasOwnProperty.call(o, cap)) return o[cap] ? "true" : "false";
    return "default";
  };
  const [overrides, setOverrides] = useState<Record<Capability, OverrideState>>(() => {
    const init = {} as Record<Capability, OverrideState>;
    for (const c of ALL_CAPABILITIES) init[c] = initialOverride(c);
    return init;
  });

  const roles = assignableRoles(actorIsOwner);
  // Garante que o papel atual do alvo apareça mesmo se não for "assignable"
  // (ex.: owner editando um external role no futuro).
  const roleOptions = Array.from(new Set<AppRole>([role, ...roles]));

  const isInternal = INTERNAL_ROLES.includes(role);

  function effectiveDefault(cap: Capability): boolean {
    return ROLE_DEFAULT_CAPS[role]?.includes(cap) ?? false;
  }

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await updateUserAccessAction(user.id, fd);
      if (res.ok) onDone("Access updated.", true);
      else setError(res.error);
    });
  }

  return (
    <Modal title={`Edit — ${user.full_name || user.email}`} wide onClose={onClose}>
      <form action={submit} className="space-y-5">
        <input type="hidden" name="active" value={active ? "true" : ""} />

        <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-black/[0.08] bg-black/[0.012] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
            Personal info
          </p>
          <Field label="Full name">
            <input
              name="full_name"
              defaultValue={user.full_name ?? ""}
              onChange={(e) => setNameForInitials(e.target.value)}
              className={inputClass}
              placeholder="Jane Doe"
            />
          </Field>
          <AddressFields names={PROFILE_ADDRESS_NAMES} defaults={profileAddressDefaults(user)} />
          <Field label="Email" hint="Changing this updates the login email too.">
            <input
              name="email"
              type="email"
              defaultValue={user.email ?? ""}
              className={inputClass}
              placeholder="jane@bythecrealty.com"
            />
          </Field>
          <Field label="Phone">
            <PhoneInput defaultValue={user.phone} />
          </Field>
        </div>

        <div className="space-y-5">
        <Field label="Role">
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className={inputClass}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        {/* Active toggle */}
        <label className="flex items-center justify-between rounded-xl border border-black/[0.1] bg-white px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-ink">Active</span>
            <span className="block text-xs text-ink/50">Inactive users cannot sign in.</span>
          </span>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
        </div>
        </div>

        {/* Website presence — "Meet the Team" on the public website. */}
        <input type="hidden" name="public_fields" value="1" />
        <input type="hidden" name="show_on_website" value={showOnWebsite ? "true" : "false"} />
        <div className="rounded-xl border border-black/[0.08] bg-black/[0.012] p-4">
          <div className="mb-1 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
              Website presence — Meet the Team
            </p>
          </div>
          <p className="mb-4 text-xs text-ink/50">
            Turn this on to show this person in the “Meet the Team” section of the public website.
            Only the name, title, bio and photo below are shown publicly — never email, phone or role.
          </p>

          <label className="mb-4 flex items-center justify-between rounded-xl border border-black/[0.1] bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Show on the website</span>
              <span className="block text-xs text-ink/50">When on, this person appears on bythecrealty.com.</span>
            </span>
            <input
              type="checkbox"
              checked={showOnWebsite}
              onChange={(e) => setShowOnWebsite(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>

          <div className="flex flex-col gap-4 sm:flex-row">
            {/* Photo */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border border-black/[0.08] bg-black/[0.03]">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt={nameForInitials || "Headshot"} className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-xl font-bold text-primary">
                    {initialsFromName(nameForInitials)}
                  </span>
                )}
                {photoBusy && (
                  <span className="absolute inset-0 grid place-items-center bg-white/60">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={onPickPhoto}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 transition hover:border-black/20 hover:bg-black/[0.03] disabled:opacity-60"
                >
                  <ImagePlus className="h-3.5 w-3.5" /> {photoUrl ? "Replace photo" : "Upload photo"}
                </button>
                {photoUrl && (
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={onRemovePhoto}
                    className="text-[11px] font-semibold text-ink/50 transition hover:text-ink disabled:opacity-60"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {/* Title + bio */}
            <div className="flex-1 space-y-4">
              <Field label="Public title" hint="Shown under their name on the website (e.g. “Broker & Owner”).">
                <input
                  name="public_title"
                  defaultValue={user.public_title ?? ""}
                  className={inputClass}
                  placeholder="Broker & Owner"
                />
              </Field>
              <Field label="Short bio">
                <textarea
                  name="public_bio"
                  defaultValue={user.public_bio ?? ""}
                  rows={4}
                  className={inputClass + " resize-y"}
                  placeholder="A few sentences about this person, shown on the website."
                />
              </Field>
            </div>
          </div>

          {photoErr && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{photoErr}</p>
          )}
        </div>

        {/* Capability overrides */}
        {isInternal ? (
          <div className="rounded-xl border border-black/[0.08] bg-black/[0.012] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/50">
              Permissions
            </p>
            <p className="mb-4 text-xs text-ink/50">
              Each capability follows the role by default. Switch to Grant or Revoke to override
              just this person.
            </p>
            <div className="space-y-3">
              {ALL_CAPABILITIES.map((cap) => {
                const def = effectiveDefault(cap);
                const val = overrides[cap];
                return (
                  <div key={cap} className="rounded-lg border border-black/[0.06] bg-white px-3 py-2.5">
                    <input type="hidden" name={`override:${cap}`} value={val} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{CAPABILITY_LABEL[cap]}</p>
                        {CAPABILITY_HINT[cap] && (
                          <p className="mt-0.5 text-[11px] text-ink/45">{CAPABILITY_HINT[cap]}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-ink/40">
                          Role default: {def ? "Allowed" : "Not allowed"}
                        </p>
                      </div>
                      <div className="flex shrink-0 overflow-hidden rounded-lg border border-black/[0.1] text-[11px] font-semibold">
                        {(["default", "true", "false"] as OverrideState[]).map((opt) => {
                          const labels: Record<OverrideState, string> = {
                            default: "Default",
                            true: "Grant",
                            false: "Revoke",
                          };
                          const activeOpt = val === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setOverrides((s) => ({ ...s, [cap]: opt }))}
                              className={
                                "px-2.5 py-1.5 transition " +
                                (activeOpt
                                  ? opt === "false"
                                    ? "bg-red-50 text-red-600"
                                    : "bg-primary/12 text-primary"
                                  : "bg-white text-ink/45 hover:text-ink")
                              }
                            >
                              {labels[opt]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-black/[0.08] bg-black/[0.012] px-4 py-3 text-xs text-ink/55">
            External portal roles do not have internal permissions yet. Their scoped portals
            arrive in a later phase.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass("primary") + " disabled:opacity-60"}>
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Delete ----------------------------------------------------------------
function DeleteButton({
  user,
  onDone,
}: {
  user: ProfileLike;
  onDone: (msg: string, ok: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          onClick={() =>
            start(async () => {
              const res = await deleteUserAction(user.id);
              if (res.ok) onDone(`${user.full_name || user.email} was removed.`, true);
              else onDone(res.error, false);
              setConfirming(false);
            })
          }
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-lg px-2 py-1 text-xs text-ink/45 hover:text-ink"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50"
    >
      <Trash2 className="h-3.5 w-3.5" /> Delete
    </button>
  );
}
