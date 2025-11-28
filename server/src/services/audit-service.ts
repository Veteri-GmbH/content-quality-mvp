import { getDatabase } from '../lib/db';
import {
  audits,
  auditPages,
  auditIssues,
  type NewAudit,
  type NewAuditPage,
  type NewAuditIssue,
} from '../schema/audits';
import { eq, and, sql } from 'drizzle-orm';
import { parseSitemap } from './sitemap-parser';
import { crawlUrl } from './jina-crawler';
import { analyzeContent } from './ai-analyzer';
import { enqueueJob, getNextJob, completeJob, failJob, type JobQueue } from './job-queue';

/**
 * Start a new audit
 * Parses sitemap, creates audit and page records, enqueues crawl jobs
 */
export async function startAudit(
  sitemapUrl: string,
  userId?: string,
  rateLimitMs: number = 1000
): Promise<string> {
  const db = await getDatabase();

  // Parse sitemap to get all URLs
  console.log(`📋 Parsing sitemap: ${sitemapUrl}`);
  const urls = await parseSitemap(sitemapUrl);
  console.log(`✅ Found ${urls.length} URLs in sitemap`);

  if (urls.length === 0) {
    throw new Error('No URLs found in sitemap');
  }

  // Create audit record
  const newAudit: NewAudit = {
    user_id: userId,
    sitemap_url: sitemapUrl,
    status: 'pending',
    total_urls: urls.length,
    processed_urls: 0,
    rate_limit_ms: rateLimitMs,
  };

  const auditResult = await db.insert(audits).values(newAudit).returning({ id: audits.id });
  const auditId = auditResult[0].id;

  // Create page records for all URLs
  const pageRecords: NewAuditPage[] = urls.map((url) => ({
    audit_id: auditId,
    url,
    status: 'pending',
  }));

  await db.insert(auditPages).values(pageRecords);

  // Update audit status to crawling
  await db.update(audits).set({ status: 'crawling' }).where(eq(audits.id, auditId));

  // Enqueue crawl jobs for all pages
  for (const url of urls) {
    const page = await db
      .select()
      .from(auditPages)
      .where(and(eq(auditPages.audit_id, auditId), eq(auditPages.url, url)))
      .limit(1);

    if (page.length > 0) {
      await enqueueJob('crawl_page', {
        audit_id: auditId,
        page_id: page[0].id,
        url,
        rate_limit_ms: rateLimitMs,
      });
    }
  }

  console.log(`🚀 Started audit ${auditId} with ${urls.length} pages`);
  return auditId;
}

/**
 * Get audit progress
 */
export async function getAuditProgress(auditId: string) {
  const db = await getDatabase();

  const audit = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (audit.length === 0) {
    throw new Error('Audit not found');
  }

  const pages = await db
    .select({
      status: auditPages.status,
      count: sql<number>`count(*)`,
    })
    .from(auditPages)
    .where(eq(auditPages.audit_id, auditId))
    .groupBy(auditPages.status);

  const totalPages = audit[0].total_urls;
  const completedPages =
    pages.find((p) => p.status === 'completed')?.count || 0;
  const failedPages = pages.find((p) => p.status === 'failed')?.count || 0;

  return {
    audit: audit[0],
    progress: {
      total: totalPages,
      completed: Number(completedPages),
      failed: Number(failedPages),
      pending: totalPages - Number(completedPages) - Number(failedPages),
      percentage: totalPages > 0 ? Math.round((Number(completedPages) / totalPages) * 100) : 0,
    },
  };
}

/**
 * Generate CSV export for an audit
 */
export async function generateCsvExport(auditId: string): Promise<string> {
  const db = await getDatabase();

  const pages = await db
    .select({
      url: auditPages.url,
      quality_score: auditPages.quality_score,
      issues: sql<number>`count(${auditIssues.id})`,
    })
    .from(auditPages)
    .leftJoin(auditIssues, eq(auditIssues.page_id, auditPages.id))
    .where(eq(auditPages.audit_id, auditId))
    .groupBy(auditPages.id, auditPages.url, auditPages.quality_score);

  // Get issues for each page
  const pagesWithIssues = await Promise.all(
    pages.map(async (page) => {
      const pageRecord = await db
        .select()
        .from(auditPages)
        .where(eq(auditPages.url, page.url))
        .limit(1);

      if (pageRecord.length === 0) {
        return { ...page, issues_summary: '', snippets: '' };
      }

      const issues = await db
        .select()
        .from(auditIssues)
        .where(eq(auditIssues.page_id, pageRecord[0].id));

      const issuesByType: Record<string, number> = {};
      const snippets: string[] = [];

      for (const issue of issues) {
        issuesByType[issue.issue_type] = (issuesByType[issue.issue_type] || 0) + 1;
        snippets.push(issue.snippet);
      }

      const issuesSummary = Object.entries(issuesByType)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

      return {
        ...page,
        issues_summary: issuesSummary,
        snippets: snippets.join(' | '),
      };
    })
  );

  // Generate CSV
  const headers = ['url', 'quality_score', 'issue_count', 'issues_summary', 'flagged_snippets'];
  const rows = pagesWithIssues.map((page) => [
    page.url,
    page.quality_score?.toString() || '',
    page.issues?.toString() || '0',
    `"${page.issues_summary}"`,
    `"${page.snippets}"`,
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  return csv;
}

/**
 * Process a crawl_page job
 */
export async function processCrawlPageJob(job: JobQueue): Promise<void> {
  const db = await getDatabase();
  const payload = job.payload as { audit_id: string; page_id: string; url: string; rate_limit_ms: number };

  try {
    // Update page status to crawling
    await db
      .update(auditPages)
      .set({ status: 'crawling' })
      .where(eq(auditPages.id, payload.page_id));

    // Wait for rate limiting
    if (payload.rate_limit_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, payload.rate_limit_ms));
    }

    // Crawl the URL
    console.log(`🕷️ Crawling: ${payload.url}`);
    const { title, content } = await crawlUrl(payload.url);

    // Update page with crawled content
    await db
      .update(auditPages)
      .set({
        title,
        content,
        status: 'pending', // Ready for analysis
      })
      .where(eq(auditPages.id, payload.page_id));

    // Enqueue analysis job
    await enqueueJob('analyze_page', {
      audit_id: payload.audit_id,
      page_id: payload.page_id,
    });

    console.log(`✅ Crawled: ${payload.url}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Crawl failed for ${payload.url}: ${errorMessage}`);

    await db
      .update(auditPages)
      .set({
        status: 'failed',
        error_message: errorMessage,
      })
      .where(eq(auditPages.id, payload.page_id));

    throw error;
  }
}

/**
 * Process an analyze_page job
 */
export async function processAnalyzePageJob(job: JobQueue): Promise<void> {
  const db = await getDatabase();
  const payload = job.payload as { audit_id: string; page_id: string };

  try {
    // Get page data
    const page = await db
      .select()
      .from(auditPages)
      .where(eq(auditPages.id, payload.page_id))
      .limit(1);

    if (page.length === 0) {
      throw new Error('Page not found');
    }

    const pageData = page[0];
    if (!pageData.title || !pageData.content) {
      throw new Error('Page has no content to analyze');
    }

    // Update page status to analyzing
    await db
      .update(auditPages)
      .set({ status: 'analyzing' })
      .where(eq(auditPages.id, payload.page_id));

    // Analyze content
    console.log(`🤖 Analyzing: ${pageData.url}`);
    const analysis = await analyzeContent(pageData.title, pageData.content);

    // Save issues
    const issueRecords: NewAuditIssue[] = analysis.issues.map((issue) => ({
      page_id: payload.page_id,
      issue_type: issue.type,
      severity: issue.severity,
      description: issue.description,
      snippet: issue.snippet,
      suggestion: issue.suggestion,
    }));

    if (issueRecords.length > 0) {
      await db.insert(auditIssues).values(issueRecords);
    }

    // Update page with quality score
    await db
      .update(auditPages)
      .set({
        quality_score: analysis.qualityScore,
        status: 'completed',
        analyzed_at: new Date(),
      })
      .where(eq(auditPages.id, payload.page_id));

    // Update audit processed count
    const currentAudit = await db
      .select()
      .from(audits)
      .where(eq(audits.id, payload.audit_id))
      .limit(1);
    
    if (currentAudit.length > 0) {
      await db
        .update(audits)
        .set({
          processed_urls: currentAudit[0].processed_urls + 1,
        })
        .where(eq(audits.id, payload.audit_id));
    }

    // Check if all pages are done
    const allPages = await db
      .select()
      .from(auditPages)
      .where(eq(auditPages.audit_id, payload.audit_id));

    const allCompleted = allPages.every(
      (p) => p.status === 'completed' || p.status === 'failed'
    );

    if (allCompleted) {
      await db
        .update(audits)
        .set({ status: 'completed' })
        .where(eq(audits.id, payload.audit_id));
      console.log(`🎉 Audit ${payload.audit_id} completed!`);
    } else {
      // Check if we should update status to analyzing
      const hasAnalyzing = allPages.some((p) => p.status === 'analyzing');
      const hasCrawling = allPages.some((p) => p.status === 'crawling');
      if (hasAnalyzing && !hasCrawling) {
        await db
          .update(audits)
          .set({ status: 'analyzing' })
          .where(eq(audits.id, payload.audit_id));
      }
    }

    console.log(`✅ Analyzed: ${pageData.url} (Score: ${analysis.qualityScore})`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Analysis failed for page ${payload.page_id}: ${errorMessage}`);

    await db
      .update(auditPages)
      .set({
        status: 'failed',
        error_message: errorMessage,
      })
      .where(eq(auditPages.id, payload.page_id));

    throw error;
  }
}

