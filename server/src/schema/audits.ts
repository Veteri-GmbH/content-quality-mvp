import { pgTable, uuid, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { appSchema } from './users';

// Enums
export const auditStatusEnum = pgEnum('audit_status', ['pending', 'crawling', 'analyzing', 'completed', 'failed']);
export const pageStatusEnum = pgEnum('page_status', ['pending', 'crawling', 'analyzing', 'completed', 'failed']);
export const issueTypeEnum = pgEnum('issue_type', ['grammar', 'redundancy', 'contradiction', 'placeholder', 'empty']);
export const severityEnum = pgEnum('severity', ['low', 'medium', 'high']);
export const jobTypeEnum = pgEnum('job_type', ['crawl_page', 'analyze_page']);
export const jobStatusEnum = pgEnum('job_status', ['pending', 'processing', 'completed', 'failed']);

// audits table
export const audits = appSchema.table('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => appSchema.users.id, { onDelete: 'set null' }),
  sitemap_url: text('sitemap_url').notNull(),
  status: auditStatusEnum('status').notNull().default('pending'),
  total_urls: integer('total_urls').notNull().default(0),
  processed_urls: integer('processed_urls').notNull().default(0),
  rate_limit_ms: integer('rate_limit_ms').notNull().default(1000),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// audit_pages table
export const auditPages = appSchema.table('audit_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  audit_id: uuid('audit_id').references(() => audits.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  status: pageStatusEnum('status').notNull().default('pending'),
  title: text('title'),
  content: text('content'),
  quality_score: integer('quality_score'),
  error_message: text('error_message'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  analyzed_at: timestamp('analyzed_at'),
});

// audit_issues table
export const auditIssues = appSchema.table('audit_issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  page_id: uuid('page_id').references(() => auditPages.id, { onDelete: 'cascade' }).notNull(),
  issue_type: issueTypeEnum('issue_type').notNull(),
  severity: severityEnum('severity').notNull(),
  description: text('description').notNull(),
  snippet: text('snippet').notNull(),
  suggestion: text('suggestion'),
});

// job_queue table
export const jobQueue = appSchema.table('job_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_type: jobTypeEnum('job_type').notNull(),
  payload: jsonb('payload').notNull(),
  status: jobStatusEnum('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(3),
  locked_until: timestamp('locked_until'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  processed_at: timestamp('processed_at'),
});

// Types
export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
export type AuditPage = typeof auditPages.$inferSelect;
export type NewAuditPage = typeof auditPages.$inferInsert;
export type AuditIssue = typeof auditIssues.$inferSelect;
export type NewAuditIssue = typeof auditIssues.$inferInsert;
export type JobQueue = typeof jobQueue.$inferSelect;
export type NewJobQueue = typeof jobQueue.$inferInsert;

