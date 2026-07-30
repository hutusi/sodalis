import type { NotificationPayload } from "./types";

export type OutboundMessage = {
  to: string;
  locale: "en" | "zh-CN";
  payload: NotificationPayload;
};

/**
 * One implementation per channel. Adding WeCom/Feishu later means a new
 * file implementing this interface plus a value in the notify_channel
 * enum — the outbox loop and enqueue path stay untouched.
 */
export interface Notifier {
  readonly channel: "email";
  isConfigured(): boolean;
  send(message: OutboundMessage): Promise<void>;
}
