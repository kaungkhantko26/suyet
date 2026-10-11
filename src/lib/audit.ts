import { Prisma } from "@prisma/client";
import { db } from "./db";
import { currentRequestId } from "./security/request";

type Tx = Prisma.TransactionClient | typeof db;

/** Admin audit trail (append-only at the database level). Includes the request id for cross-referencing logs. */
export async function audit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details?: Prisma.InputJsonObject,
  tx: Tx = db,
) {
  const requestId = await currentRequestId();
  await tx.adminAuditLog.create({ data: { adminId, action, targetType, targetId, details: { ...(details ?? {}), outcome: "success", ...(requestId ? { requestId } : {}) } } });
}
