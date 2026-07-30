import { formatWallTime } from "../time";
import type { NotificationPayload } from "./types";

export type RenderedMessage = { subject: string; text: string; html: string };

type Locale = "en" | "zh-CN";

// Email copy lives here, not in the UI message catalogs: the worker must
// render without any framework, and email wording differs from UI wording.
const COPY = {
  en: {
    resultSubject: (date: string) => `🍜 Your lunch group for ${date}`,
    updatedSubject: (date: string) => `🍜 [Updated] Your lunch group for ${date}`,
    unmatchedSubject: (date: string) => `🍜 About lunch on ${date}`,
    greeting: "Hi!",
    intro: "Here is your lunch group for today — say hi and enjoy:",
    updatedIntro:
      "Your lunch group for today was re-arranged. The up-to-date group:",
    host: "Host",
    hostNote:
      "The host sets up the group chat and picks a time that works — that's all.",
    hostless: "No host today — the first to message the others wins eternal glory.",
    venue: "Suggested venue",
    venueNote: "Just a suggestion — go wherever the group likes.",
    time: "Time",
    unmatchedBody:
      "We couldn't find you a lunch group today — sorry! You're first in line next time you sign up.",
    footer: "Sodalis · Random lunch, real connections",
  },
  "zh-CN": {
    resultSubject: (date: string) => `🍜 今日午餐搭子已就位 · ${date}`,
    updatedSubject: (date: string) => `🍜 【更新】今日午餐分组有变 · ${date}`,
    unmatchedSubject: (date: string) => `🍜 关于 ${date} 的午餐`,
    greeting: "你好！",
    intro: "这是你今天的午餐小组，打个招呼，吃顿好饭：",
    updatedIntro: "你今天的午餐分组有调整，最新小组如下：",
    host: "搭主",
    hostNote: "搭主只需拉个群、定个大家方便的时间，仅此而已。",
    hostless: "今天没有搭主，谁先在群里冒泡谁就是英雄。",
    venue: "推荐餐厅",
    venueNote: "仅供参考，小组想去哪儿都行。",
    time: "时间",
    unmatchedBody:
      "今天没能帮你匹配到午餐小组，抱歉！下次报名时会优先安排你。",
    footer: "随机午餐 · 一顿午饭，认识一位新同事",
  },
} satisfies Record<Locale, Record<string, unknown>>;

// Quotes included: esc() output also lands in attribute values (mailto href).
function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderNotification(
  payload: NotificationPayload,
  locale: Locale,
): RenderedMessage {
  const c = COPY[locale];
  const name = (o: { nameEn: string; nameZh: string }) =>
    locale === "en" ? o.nameEn : o.nameZh;
  const time = formatWallTime(payload.activity.eventTime);

  if (payload.kind === "unmatched" || !payload.group) {
    const subject = c.unmatchedSubject(payload.date);
    const text = `${c.greeting}\n\n${c.unmatchedBody}\n\n${c.footer}`;
    const html = `<div style="font-family:sans-serif;max-width:520px">
<p>${esc(c.greeting)}</p><p>${esc(c.unmatchedBody)}</p>
<p style="color:#888;font-size:12px">${esc(c.footer)}</p></div>`;
    return { subject, text, html };
  }

  const g = payload.group;
  const updated = payload.kind === "match_updated";
  const subject = updated
    ? c.updatedSubject(payload.date)
    : c.resultSubject(payload.date);
  const intro = updated ? c.updatedIntro : c.intro;

  const memberLinesText = g.members.map((m) => {
    const parts = [
      m.isHost ? `⭐ ${m.name}（${c.host}）` : m.name,
      m.department ?? "",
      m.email,
      m.contact ?? "",
    ].filter(Boolean);
    return `  · ${parts.join(" | ")}`;
  });

  const details: string[] = [];
  details.push(`${c.time}: ${time} · ${name(payload.office)}`);
  if (g.venue) details.push(`${c.venue}: ${name(g.venue)}（${c.venueNote}）`);
  details.push(g.hostUserId ? c.hostNote : c.hostless);

  const text = [
    c.greeting,
    "",
    intro,
    ...memberLinesText,
    "",
    ...details,
    "",
    c.footer,
  ].join("\n");

  const memberRowsHtml = g.members
    .map((m) => {
      const label = m.isHost
        ? `⭐ <b>${esc(m.name)}</b> <span style="color:#b45309">（${esc(c.host)}）</span>`
        : esc(m.name);
      const meta = [m.department, m.contact]
        .filter((v): v is string => Boolean(v))
        .map(esc)
        .join(" · ");
      return `<tr>
<td style="padding:6px 12px 6px 0">${label}</td>
<td style="padding:6px 12px 6px 0;color:#666">${meta}</td>
<td style="padding:6px 0"><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></td>
</tr>`;
    })
    .join("");

  const html = `<div style="font-family:sans-serif;max-width:560px">
<p>${esc(c.greeting)}</p>
<p>${esc(intro)}</p>
<table style="border-collapse:collapse;font-size:14px">${memberRowsHtml}</table>
<p style="margin-top:12px">${details.map(esc).join("<br>")}</p>
<p style="color:#888;font-size:12px;margin-top:20px">${esc(c.footer)}</p>
</div>`;

  return { subject, text, html };
}
