import { db } from "../db";

export type SwitchKey = "automation_paused" | "submissions_disabled";

export async function isSwitchOn(key: SwitchKey): Promise<boolean> {
  const row = await db.siteSetting.findUnique({ where: { key } });
  return row?.value === true;
}

export async function setSwitch(key: SwitchKey, on: boolean) {
  await db.siteSetting.upsert({ where: { key }, update: { value: on }, create: { key, value: on } });
}
