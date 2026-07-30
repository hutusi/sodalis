import { describe, expect, test } from "bun:test";

import { renderNotification } from "./templates";
import type { NotificationPayload } from "./types";

const base: NotificationPayload = {
  kind: "match_result",
  date: "2026-07-31",
  activity: { nameEn: "Lunch", nameZh: "午餐", eventTime: "11:45:00" },
  office: { nameEn: "Wangjing Office", nameZh: "望京办公区" },
  group: {
    hostUserId: "u1",
    venue: { nameEn: "Staff Canteen", nameZh: "员工餐厅" },
    members: [
      {
        userId: "u1",
        name: "徐涛",
        department: "技术部",
        email: "xu.tao@corp.example.com",
        contact: "wx: xutao",
        isHost: true,
      },
      {
        userId: "u2",
        name: "孙悦",
        department: "市场部",
        email: "sun.yue@corp.example.com",
        contact: null,
        isHost: false,
      },
    ],
  },
};

describe("renderNotification", () => {
  test("zh-CN match result includes members, host, venue, time", () => {
    const r = renderNotification(base, "zh-CN");
    expect(r.subject).toContain("2026-07-31");
    for (const s of ["徐涛", "孙悦", "搭主", "员工餐厅", "11:45", "wx: xutao"]) {
      expect(r.text).toContain(s);
      expect(r.html).toContain(s);
    }
    expect(r.text).not.toContain("Staff Canteen");
  });

  test("en locale uses English names and copy", () => {
    const r = renderNotification(base, "en");
    expect(r.text).toContain("Staff Canteen");
    expect(r.text).toContain("Host");
    expect(r.subject).toContain("lunch group");
  });

  test("match_updated gets the updated subject", () => {
    const r = renderNotification({ ...base, kind: "match_updated" }, "zh-CN");
    expect(r.subject).toContain("更新");
  });

  test("unmatched renders the apology without a group", () => {
    const r = renderNotification(
      { ...base, kind: "unmatched", group: undefined },
      "zh-CN",
    );
    expect(r.text).toContain("抱歉");
    expect(r.text).not.toContain("徐涛");
  });

  test("html escapes member-provided strings", () => {
    const evil = {
      ...base,
      group: {
        ...base.group!,
        members: [
          {
            ...base.group!.members[0],
            name: "<script>alert(1)</script>",
          },
        ],
      },
    };
    const r = renderNotification(evil, "zh-CN");
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});
