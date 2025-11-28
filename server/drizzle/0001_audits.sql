-- Create enums
CREATE TYPE "app"."audit_status" AS ENUM('pending', 'crawling', 'analyzing', 'completed', 'failed');
CREATE TYPE "app"."page_status" AS ENUM('pending', 'crawling', 'analyzing', 'completed', 'failed');
CREATE TYPE "app"."issue_type" AS ENUM('grammar', 'redundancy', 'contradiction', 'placeholder', 'empty');
CREATE TYPE "app"."severity" AS ENUM('low', 'medium', 'high');
CREATE TYPE "app"."job_type" AS ENUM('crawl_page', 'analyze_page');
CREATE TYPE "app"."job_status" AS ENUM('pending', 'processing', 'completed', 'failed');

-- Create audits table
CREATE TABLE IF NOT EXISTS "app"."audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"sitemap_url" text NOT NULL,
	"status" "app"."audit_status" NOT NULL DEFAULT 'pending',
	"total_urls" integer NOT NULL DEFAULT 0,
	"processed_urls" integer NOT NULL DEFAULT 0,
	"rate_limit_ms" integer NOT NULL DEFAULT 1000,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL
);

-- Create audit_pages table
CREATE TABLE IF NOT EXISTS "app"."audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" "app"."page_status" NOT NULL DEFAULT 'pending',
	"title" text,
	"content" text,
	"quality_score" integer,
	"error_message" text,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"analyzed_at" timestamp,
	FOREIGN KEY ("audit_id") REFERENCES "app"."audits"("id") ON DELETE CASCADE
);

-- Create audit_issues table
CREATE TABLE IF NOT EXISTS "app"."audit_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"page_id" uuid NOT NULL,
	"issue_type" "app"."issue_type" NOT NULL,
	"severity" "app"."severity" NOT NULL,
	"description" text NOT NULL,
	"snippet" text NOT NULL,
	"suggestion" text,
	FOREIGN KEY ("page_id") REFERENCES "app"."audit_pages"("id") ON DELETE CASCADE
);

-- Create job_queue table
CREATE TABLE IF NOT EXISTS "app"."job_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"job_type" "app"."job_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "app"."job_status" NOT NULL DEFAULT 'pending',
	"attempts" integer NOT NULL DEFAULT 0,
	"max_attempts" integer NOT NULL DEFAULT 3,
	"locked_until" timestamp,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"processed_at" timestamp
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "audits_user_id_idx" ON "app"."audits"("user_id");
CREATE INDEX IF NOT EXISTS "audits_status_idx" ON "app"."audits"("status");
CREATE INDEX IF NOT EXISTS "audit_pages_audit_id_idx" ON "app"."audit_pages"("audit_id");
CREATE INDEX IF NOT EXISTS "audit_pages_status_idx" ON "app"."audit_pages"("status");
CREATE INDEX IF NOT EXISTS "audit_issues_page_id_idx" ON "app"."audit_issues"("page_id");
CREATE INDEX IF NOT EXISTS "job_queue_status_idx" ON "app"."job_queue"("status");
CREATE INDEX IF NOT EXISTS "job_queue_locked_until_idx" ON "app"."job_queue"("locked_until");

