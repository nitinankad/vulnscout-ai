import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const sourceTypeEnum = pgEnum('source_type', ['github']);
export const scanStatusEnum = pgEnum('scan_status', ['queued', 'running', 'completed', 'failed']);
export const severityEnum = pgEnum('severity', ['critical', 'high', 'medium', 'low', 'info']);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  githubTokenEncrypted: text('github_token_encrypted'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  sourceType: sourceTypeEnum('source_type').notNull(),
  source: text('source').notNull(),
  branch: text('branch'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const scans = pgTable('scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: scanStatusEnum('status').default('queued').notNull(),
  attackProfile: text('attack_profile').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  critical: integer('critical').default(0).notNull(),
  high: integer('high').default(0).notNull(),
  medium: integer('medium').default(0).notNull(),
  low: integer('low').default(0).notNull(),
  info: integer('info').default(0).notNull(),
  endpointsScanned: integer('endpoints_scanned').default(0).notNull(),
  requestsFired: integer('requests_fired').default(0).notNull(),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'cascade' }).notNull(),
  severity: severityEnum('severity').notNull(),
  vulnClass: text('vuln_class').notNull(),
  title: text('title').notNull(),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  description: text('description').notNull(),
  proofRequest: jsonb('proof_request').notNull(),
  proofResponse: jsonb('proof_response').notNull(),
  curlCommand: text('curl_command').notNull(),
  fixSuggestion: text('fix_suggestion').notNull(),
  cweId: text('cwe_id').notNull(),
  owaspCategory: text('owasp_category').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
