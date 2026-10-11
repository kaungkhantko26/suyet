import type { Role } from "@prisma/client";

/**
 * Deny-by-default permission matrix. Anything not listed for a role is forbidden.
 * Higher roles are explicit supersets (no hidden inheritance), so reading this file is enough to audit access.
 */
export type Permission =
  | "events.save" | "profile.manage" | "suggestion.submit" | "report.submit"
  | "org.manage.own" | "event.submit" | "event.edit.own"
  | "admin.access" | "review.submissions" | "review.verify" | "review.reports" | "review.candidates"
  | "events.manage" | "organizers.manage" | "categories.manage" | "users.view" | "users.manage" | "sources.manage"
  | "analytics.view" | "audit.view" | "security.view" | "security.emergency" | "settings.view"
  | "admins.manage" | "security.config";

const STUDENT: Permission[] = ["events.save", "profile.manage", "suggestion.submit", "report.submit"];
const ORGANIZER: Permission[] = [...STUDENT, "org.manage.own", "event.submit", "event.edit.own"];
const MODERATOR: Permission[] = [...STUDENT, "admin.access", "review.submissions", "review.verify", "review.reports", "review.candidates"];
const ADMIN: Permission[] = [
  ...MODERATOR,
  "events.manage", "organizers.manage", "categories.manage", "users.view", "users.manage", "sources.manage",
  "analytics.view", "audit.view", "security.view", "security.emergency", "settings.view",
];
const SUPER_ADMIN: Permission[] = [...ADMIN, "admins.manage", "security.config"];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  STUDENT: new Set(STUDENT), ORGANIZER: new Set(ORGANIZER), MODERATOR: new Set(MODERATOR), ADMIN: new Set(ADMIN), SUPER_ADMIN: new Set(SUPER_ADMIN),
};

export const can = (role: Role | undefined | null, permission: Permission): boolean => !!role && !!MATRIX[role]?.has(permission);

/** Roles that must use a second factor. */
export const PRIVILEGED_ROLES: readonly Role[] = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];
export const isPrivileged = (role: Role) => PRIVILEGED_ROLES.includes(role);

/**
 * Who may change whose role to what. Prevents vertical escalation:
 *  - nobody changes their own role,
 *  - ADMIN manages non-privileged STUDENT/ORGANIZER accounts only,
 *  - privileged MODERATOR/ADMIN/SUPER_ADMIN roles are managed only by SUPER_ADMIN,
 *  - SUPER_ADMIN may assign any role,
 *  - MODERATOR and below can't assign roles.
 */
export function canAssignRole(actor: { id: string; role: Role }, target: { id: string; role: Role }, next: Role): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "ADMIN") {
    const manageable: Role[] = ["STUDENT", "ORGANIZER"];
    return manageable.includes(target.role) && manageable.includes(next);
  }
  return false;
}

/** Actors who may suspend/reinstate a target account (same hierarchy as role changes). */
export function canModerateUser(actor: { id: string; role: Role }, target: { id: string; role: Role }): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === "SUPER_ADMIN") return true;
  return actor.role === "ADMIN" && ["STUDENT", "ORGANIZER"].includes(target.role);
}
