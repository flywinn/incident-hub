import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("teams_code_uq").on(table.code),
]);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("OPERATOR"),
  team: text("team").notNull().default("عملیات"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("users_email_uq").on(table.email),
]);

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  path: text("path").notNull(),
  team: text("team").notNull(),
  managerEmail: text("manager_email").notNull().default(""),
  alertEmail: text("alert_email").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("services_code_uq").on(table.code),
]);

export const dailyCounters = sqliteTable("daily_counters", {
  day: text("day").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const bugs = sqliteTable("bugs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bugCode: text("bug_code").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  serviceId: integer("service_id").references(() => services.id),
  serviceLabel: text("service_label").notNull(),
  priority: text("priority").notNull().default("P3"),
  status: text("status").notNull().default("NEW"),
  ownerId: integer("owner_id").references(() => users.id),
  ownerName: text("owner_name").notNull().default("تعیین نشده"),
  source: text("source").notNull().default("MANUAL"),
  externalAlertId: text("external_alert_id"),
  fingerprint: text("fingerprint"),
  dashboardUrl: text("dashboard_url"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  nextFollowUpAt: text("next_follow_up_at"),
  resolvedAt: text("resolved_at"),
  closedAt: text("closed_at"),
  createdBy: text("created_by").notNull().default("سامانه"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("bugs_bug_code_uq").on(table.bugCode),
  index("bugs_status_idx").on(table.status),
  index("bugs_priority_idx").on(table.priority),
  index("bugs_fingerprint_idx").on(table.fingerprint),
  index("bugs_next_follow_up_idx").on(table.nextFollowUpAt),
]);

export const bugAssignees = sqliteTable("bug_assignees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bugId: integer("bug_id").notNull().references(() => bugs.id),
  userId: integer("user_id").notNull().references(() => users.id),
  assignedBy: text("assigned_by").notNull().default("سامانه"),
  assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("bug_assignees_bug_user_uq").on(table.bugId, table.userId),
  index("bug_assignees_bug_idx").on(table.bugId),
  index("bug_assignees_user_idx").on(table.userId),
]);

export const followUps = sqliteTable("follow_ups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bugId: integer("bug_id").notNull().references(() => bugs.id),
  type: text("type").notNull().default("بررسی فنی"),
  scheduledAt: text("scheduled_at").notNull(),
  completedAt: text("completed_at"),
  ownerName: text("owner_name").notNull(),
  status: text("status").notNull().default("SCHEDULED"),
  result: text("result").notNull().default(""),
  nextAction: text("next_action").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("follow_ups_bug_idx").on(table.bugId),
  index("follow_ups_schedule_idx").on(table.scheduledAt),
]);

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bugId: integer("bug_id").notNull().references(() => bugs.id),
  body: text("body").notNull(),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("comments_bug_idx").on(table.bugId),
]);

export const bugEvents = sqliteTable("bug_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bugId: integer("bug_id").notNull().references(() => bugs.id),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  actor: text("actor").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("bug_events_bug_idx").on(table.bugId),
  index("bug_events_created_idx").on(table.createdAt),
]);

export const emailQueue = sqliteTable("email_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bugId: integer("bug_id").references(() => bugs.id),
  recipient: text("recipient").notNull(),
  cc: text("cc").notNull().default(""),
  subject: text("subject").notNull(),
  template: text("template").notNull(),
  bodyText: text("body_text").notNull().default(""),
  preparedBy: text("prepared_by").notNull().default("سامانه"),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("email_queue_status_idx").on(table.status),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("audit_logs_entity_idx").on(table.entityType, table.entityId),
]);

export const importBatches = sqliteTable("import_batches", {
  batchKey: text("batch_key").primaryKey(),
  sourceName: text("source_name").notNull(),
  importedCount: integer("imported_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const appSettings = sqliteTable("app_settings", {
  settingKey: text("setting_key").primaryKey(),
  valueJson: text("value_json").notNull().default("{}"),
  updatedBy: text("updated_by").notNull().default("سامانه"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
