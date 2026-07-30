/**
 * Seed the base configuration: org structure, the lunch activity type and
 * the CN holiday calendar. Pass --demo to also create ~30 fake users for
 * local development with the dev-login provider.
 *
 *   bun run seed          # production-safe base data
 *   bun run seed --demo   # + demo users
 */
import { eq } from "drizzle-orm";

import { db } from "../src/db";
import {
  activityTypes,
  cafeterias,
  cities,
  offices,
  users,
} from "../src/db/schema";
import { importHolidays } from "./import-holidays";

async function upsertCity(nameEn: string, nameZh: string, timezone: string) {
  const existing = await db.query.cities.findFirst({
    where: eq(cities.nameEn, nameEn),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(cities)
    .values({ nameEn, nameZh, timezone })
    .returning({ id: cities.id });
  return row.id;
}

async function upsertOffice(cityId: string, nameEn: string, nameZh: string) {
  const existing = await db.query.offices.findFirst({
    where: eq(offices.nameEn, nameEn),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(offices)
    .values({ cityId, nameEn, nameZh })
    .returning({ id: offices.id });
  return row.id;
}

async function upsertCafeteria(officeId: string, nameEn: string, nameZh: string) {
  const existing = await db.query.cafeterias.findFirst({
    where: eq(cafeterias.nameEn, nameEn),
  });
  if (existing) return;
  await db.insert(cafeterias).values({ officeId, nameEn, nameZh });
}

async function seedBase() {
  const beijing = await upsertCity("Beijing", "北京", "Asia/Shanghai");
  const shanghai = await upsertCity("Shanghai", "上海", "Asia/Shanghai");

  const zgc = await upsertOffice(beijing, "Zhongguancun Office", "中关村办公区");
  const wj = await upsertOffice(beijing, "Wangjing Office", "望京办公区");
  const zj = await upsertOffice(shanghai, "Zhangjiang Office", "张江办公区");

  await upsertCafeteria(zgc, "1F Cafeteria", "一层食堂");
  await upsertCafeteria(zgc, "3F Restaurant", "三层餐厅");
  await upsertCafeteria(wj, "Staff Canteen", "员工餐厅");
  await upsertCafeteria(wj, "Cafe Corner", "咖啡简餐");
  await upsertCafeteria(zj, "Block A Cafeteria", "A栋食堂");
  await upsertCafeteria(zj, "Park Food Court", "园区美食城");

  await db
    .insert(activityTypes)
    .values({
      key: "lunch",
      nameEn: "Lunch",
      nameZh: "午餐",
      signupCloseTime: "10:30",
      notifyByTime: "11:00",
      eventTime: "11:45",
    })
    .onConflictDoNothing({ target: activityTypes.key });

  const holidayCount = await importHolidays("data/holidays-cn-2026.json");

  return { offices: [zgc, wj, zj], holidayCount };
}

const DEMO_USERS: Array<[string, string, string, number]> = [
  // [name, email localpart, department, office index]
  ["王伟", "wang.wei", "技术部", 0],
  ["李娜", "li.na", "产品部", 0],
  ["张敏", "zhang.min", "设计部", 0],
  ["刘洋", "liu.yang", "技术部", 0],
  ["陈静", "chen.jing", "市场部", 0],
  ["杨帆", "yang.fan", "技术部", 0],
  ["赵磊", "zhao.lei", "财务部", 0],
  ["黄丽", "huang.li", "人力资源部", 0],
  ["周强", "zhou.qiang", "产品部", 0],
  ["吴昊", "wu.hao", "设计部", 0],
  ["徐涛", "xu.tao", "技术部", 1],
  ["孙悦", "sun.yue", "市场部", 1],
  ["马超", "ma.chao", "技术部", 1],
  ["朱婷", "zhu.ting", "产品部", 1],
  ["胡军", "hu.jun", "财务部", 1],
  ["郭静怡", "guo.jingyi", "设计部", 1],
  ["林峰", "lin.feng", "技术部", 1],
  ["何雪", "he.xue", "人力资源部", 1],
  ["高翔", "gao.xiang", "产品部", 1],
  ["罗丹", "luo.dan", "市场部", 1],
  ["郑双", "zheng.shuang", "技术部", 2],
  ["梁晨", "liang.chen", "产品部", 2],
  ["宋佳", "song.jia", "设计部", 2],
  ["唐磊", "tang.lei", "技术部", 2],
  ["许清", "xu.qing", "市场部", 2],
  ["韩冰", "han.bing", "财务部", 2],
  ["冯媛", "feng.yuan", "人力资源部", 2],
  ["曹阳", "cao.yang", "技术部", 2],
  ["彭飞", "peng.fei", "产品部", 2],
  ["董杰", "dong.jie", "设计部", 2],
];

async function seedDemoUsers(officeIds: string[]) {
  for (const [name, local, department, officeIdx] of DEMO_USERS) {
    await db
      .insert(users)
      .values({
        email: `${local}@corp.example.com`,
        name,
        department,
        officeId: officeIds[officeIdx],
        locale: "zh-CN",
        // First demo user doubles as an admin for local admin-UI work.
        isAdmin: local === "wang.wei",
      })
      .onConflictDoNothing({ target: users.email });
  }
}

if (import.meta.main) {
  const { offices: officeIds, holidayCount } = await seedBase();
  console.log(`Seeded org structure, lunch activity, ${holidayCount} calendar days`);
  if (process.argv.includes("--demo")) {
    await seedDemoUsers(officeIds);
    console.log(`Seeded ${DEMO_USERS.length} demo users`);
  }
  process.exit(0);
}
