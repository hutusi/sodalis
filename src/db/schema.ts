import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Enums — fixed vocabularies the code branches on. Admin-configurable data
// (cities, offices, cafeterias, activity types) lives in lookup tables.
// ---------------------------------------------------------------------------

export const localeEnum = pgEnum("locale", ["en", "zh-CN"]);
export const sizePrefEnum = pgEnum("size_pref", ["pair_only", "flex_2_4"]);
export const signupSourceEnum = pgEnum("signup_source", ["manual", "standing"]);
export const signupStatusEnum = pgEnum("signup_status", ["active", "cancelled"]);
export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "superseded",
]);
export const runTriggerEnum = pgEnum("run_trigger", ["scheduler", "manual"]);
export const dayKindEnum = pgEnum("day_kind", ["holiday", "workday"]);
export const calSourceEnum = pgEnum("cal_source", ["seed", "admin"]);
export const notifyChannelEnum = pgEnum("notify_channel", ["email"]);
export const notifyTemplateEnum = pgEnum("notify_template", [
  "match_result",
  "match_updated",
  "unmatched",
]);
export const notifyStatusEnum = pgEnum("notify_status", [
  "pending",
  "sending",
  "sent",
  "failed",
]);

// ---------------------------------------------------------------------------
// Org structure
// ---------------------------------------------------------------------------

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  // IANA zone on the city, not the office: offices in one city share it.
  timezone: text("timezone").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const offices = pgTable(
  "offices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("offices_city_idx").on(t.cityId)],
);

export const cafeterias = pgTable(
  "cafeterias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("cafeterias_office_idx").on(t.officeId)],
);

// ---------------------------------------------------------------------------
// Users — authenticated via OIDC/LDAP; profile fields cached from claims at
// each login unless the user locked their own values.
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    authSubject: text("auth_subject"),
    name: text("name").notNull().default(""),
    department: text("department"),
    officeId: uuid("office_id").references(() => offices.id),
    // Once the user picks an office manually, SSO hints stop overwriting it.
    officeLocked: boolean("office_locked").notNull().default(false),
    locale: localeEnum("locale").notNull().default("zh-CN"),
    contactExtra: text("contact_extra"),
    contactVisible: boolean("contact_visible").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_auth_subject_unique")
      .on(t.authSubject)
      .where(sql`${t.authSubject} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Activities — "lunch" at launch; dinner/coffee later are rows, not code.
// Times are office-local wall clock, interpreted via the office's city tz.
// ---------------------------------------------------------------------------

export const activityTypes = pgTable("activity_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  signupCloseTime: time("signup_close_time").notNull(),
  notifyByTime: time("notify_by_time").notNull(),
  eventTime: time("event_time").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Signups
// ---------------------------------------------------------------------------

export const standingSignups = pgTable(
  "standing_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => activityTypes.id),
    // ISO weekdays 1 (Mon) – 7 (Sun); the UI offers Mon–Fri.
    weekdays: smallint("weekdays").array().notNull(),
    groupSizePref: sizePrefEnum("group_size_pref").notNull().default("flex_2_4"),
    willingToHost: boolean("willing_to_host").notNull().default(false),
    isPaused: boolean("is_paused").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("standing_signups_user_activity_unique").on(
      t.userId,
      t.activityTypeId,
    ),
  ],
);

export const signups = pgTable(
  "signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => activityTypes.id),
    // Snapshotted at signup: the match uses this even if the user moves later.
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    date: date("date").notNull(),
    groupSizePref: sizePrefEnum("group_size_pref").notNull().default("flex_2_4"),
    willingToHost: boolean("willing_to_host").notNull().default(false),
    source: signupSourceEnum("source").notNull().default("manual"),
    standingSignupId: uuid("standing_signup_id").references(
      () => standingSignups.id,
      { onDelete: "set null" },
    ),
    // A 'cancelled' row deliberately blocks re-materialization from a
    // standing signup for that day (enforced by the unique index below).
    status: signupStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("signups_user_activity_date_unique").on(
      t.userId,
      t.activityTypeId,
      t.date,
    ),
    index("signups_pool_idx").on(t.officeId, t.activityTypeId, t.date, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export const matchRuns = pgTable(
  "match_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => activityTypes.id),
    date: date("date").notNull(),
    seed: text("seed").notNull(),
    status: runStatusEnum("status").notNull().default("pending"),
    triggeredBy: runTriggerEnum("triggered_by").notNull(),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id),
    stats: jsonb("stats"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // Idempotency backbone: at most one live (non-superseded, non-failed)
    // run per office × activity × date. Scheduler inserts are
    // ON CONFLICT DO NOTHING against this index.
    uniqueIndex("match_runs_live_unique")
      .on(t.officeId, t.activityTypeId, t.date)
      .where(sql`${t.status} in ('pending', 'running', 'completed')`),
    index("match_runs_date_idx").on(t.date),
  ],
);

export const matchGroups = pgTable(
  "match_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchRunId: uuid("match_run_id")
      .notNull()
      .references(() => matchRuns.id),
    groupIndex: integer("group_index").notNull(),
    hostUserId: uuid("host_user_id").references(() => users.id),
    cafeteriaId: uuid("cafeteria_id").references(() => cafeterias.id),
    // Denormalized from the run for cheap history/dashboard queries.
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => activityTypes.id),
    date: date("date").notNull(),
    ...timestamps,
  },
  (t) => [
    index("match_groups_date_office_idx").on(t.date, t.officeId),
    index("match_groups_run_idx").on(t.matchRunId),
    index("match_groups_host_date_idx").on(t.hostUserId, t.date),
  ],
);

export const matchGroupMembers = pgTable(
  "match_group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => matchGroups.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("match_group_members_unique").on(t.groupId, t.userId),
    index("match_group_members_user_idx").on(t.userId),
  ],
);

// Scoring hot path: "when did these two last eat together". Kept as explicit
// pairs so the matcher loads history in one indexed query and superseding a
// run is a single DELETE by match_run_id. UI history reads group_members.
export const matchPairs = pgTable(
  "match_pairs",
  {
    userLo: uuid("user_lo").notNull(),
    userHi: uuid("user_hi").notNull(),
    date: date("date").notNull(),
    matchRunId: uuid("match_run_id")
      .notNull()
      .references(() => matchRuns.id),
  },
  (t) => [
    primaryKey({ columns: [t.userLo, t.userHi, t.date] }),
    check("match_pairs_ordered", sql`${t.userLo} < ${t.userHi}`),
    index("match_pairs_run_idx").on(t.matchRunId),
  ],
);

// ---------------------------------------------------------------------------
// Holiday calendar — absent dates fall back to Mon–Fri logic.
// kind = 'workday' marks 调休 makeup working days (often Saturdays).
// ---------------------------------------------------------------------------

export const holidayCalendar = pgTable("holiday_calendar", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull().unique(),
  kind: dayKindEnum("kind").notNull(),
  label: text("label").notNull(),
  source: calSourceEnum("source").notNull().default("admin"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Notifications outbox — decouples the matching transaction from SMTP
// delivery; retried with backoff by the worker. dedupe_key makes re-enqueue
// on run retry a no-op.
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    channel: notifyChannelEnum("channel").notNull().default("email"),
    template: notifyTemplateEnum("template").notNull(),
    locale: localeEnum("locale").notNull(),
    // Fully denormalized payload: sending must not require joins.
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: notifyStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_pending_idx").on(t.status, t.nextAttemptAt)],
);
