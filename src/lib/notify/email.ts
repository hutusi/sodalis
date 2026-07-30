import { createTransport, type Transporter } from "nodemailer";

import { env } from "@/env";
import type { Notifier, OutboundMessage } from "./notifier";
import { renderNotification } from "./templates";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

export const emailNotifier: Notifier = {
  channel: "email",
  isConfigured: () => Boolean(env.SMTP_HOST),
  async send(message: OutboundMessage) {
    const rendered = renderNotification(message.payload, message.locale);
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  },
};

export const notifiers: Record<"email", Notifier> = {
  email: emailNotifier,
};
