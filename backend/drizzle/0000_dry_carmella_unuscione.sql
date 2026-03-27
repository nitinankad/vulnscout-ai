CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('github', 'openapi');--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"severity" "severity" NOT NULL,
	"vuln_class" text NOT NULL,
	"title" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"description" text NOT NULL,
	"proof_request" jsonb NOT NULL,
	"proof_response" jsonb NOT NULL,
	"curl_command" text NOT NULL,
	"fix_suggestion" text NOT NULL,
	"cwe_id" text NOT NULL,
	"owasp_category" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"attack_profile" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"critical" integer DEFAULT 0 NOT NULL,
	"high" integer DEFAULT 0 NOT NULL,
	"medium" integer DEFAULT 0 NOT NULL,
	"low" integer DEFAULT 0 NOT NULL,
	"info" integer DEFAULT 0 NOT NULL,
	"endpoints_scanned" integer DEFAULT 0 NOT NULL,
	"requests_fired" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source" text NOT NULL,
	"branch" text,
	"env_vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"github_token_encrypted" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;