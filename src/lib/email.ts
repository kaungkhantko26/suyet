import nodemailer, { type Transporter } from "nodemailer";
import { config } from "@/lib/config";

let transport: Transporter | null = null;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

/** Sends via SMTP; without SMTP_HOST the message is logged (development only). */
export async function sendMail(mail: Mail) {
  const from = process.env.SMTP_FROM ?? `${config.brandName} <no-reply@localhost>`;
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP_HOST is not configured");
    console.info(`[email:dev] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}\n`);
    return;
  }
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from, ...mail });
}
