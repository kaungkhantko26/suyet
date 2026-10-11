import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { recordSecurityEvent } from "../security/events";
import { can, type Permission } from "./permissions";
import { getCurrentUser, getPendingMfaUser, type SessionUser } from "./session";

export class ForbiddenError extends Error {}

/** Server-side gate for pages: anonymous → login; password-only privileged session → MFA; everyone else continues. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;
  const pending = await getPendingMfaUser();
  if (pending) {
    const enrolled = await db.mfaCredential.findFirst({ where: { userId: pending.id, enabledAt: { not: null } } });
    redirect(`${enrolled ? "/auth/mfa" : "/auth/mfa/setup"}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  }
  redirect(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
}

export async function requirePermission(permission: Permission, next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!can(user.role, permission)) {
    await recordSecurityEvent({ type: "authz.denied", severity: "LOW", outcome: "blocked", actorId: user.id, metadata: { permission, path: next } });
    redirect("/forbidden");
  }
  return user;
}

export const requireAdmin = (next?: string) => requirePermission("admin.access", next);
export const requireOrganizer = (next?: string) => requirePermission("event.submit", next);
export const requireRole = async (roles: Role[], next?: string) => {
  const user = await requireUser(next);
  if (!roles.includes(user.role)) redirect("/forbidden");
  return user;
};

/** For server actions: throws instead of redirecting so callers can return structured errors. Deny by default. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !can(user.role, permission)) {
    await recordSecurityEvent({ type: "authz.denied", severity: user ? "LOW" : "INFO", outcome: "blocked", actorId: user?.id, metadata: { permission } });
    throw new ForbiddenError("Forbidden");
  }
  return user;
}

/** Organizers that the user may manage events for (staff with events.manage: all). */
export async function organizerIdsFor(user: { id: string; role: Role }): Promise<string[] | "ALL"> {
  if (can(user.role, "events.manage")) return "ALL";
  const rows = await db.organizerMember.findMany({
    where: { userId: user.id, organizer: { status: { not: "SUSPENDED" }, deletedAt: null } },
    select: { organizerId: true },
  });
  return rows.map((r) => r.organizerId);
}

export async function canManageOrganizer(user: { id: string; role: Role }, organizerId: string) {
  const ids = await organizerIdsFor(user);
  return ids === "ALL" || ids.includes(organizerId);
}
