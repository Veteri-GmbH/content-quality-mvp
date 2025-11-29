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
  rateLimitMs: number = 1000,
  urlLimit?: number
): Promise<string> {
  const db = await getDatabase();

  // Parse sitemap to get all URLs
  console.log(`📋 Parsing sitemap: ${sitemapUrl}`);
  let urls = await parseSitemap(sitemapUrl);
  const originalCount = urls.length;
  
  if (urls.length === 0) {
    throw new Error('No URLs found in sitemap');
  }

  // Apply URL limit if specified
  if (urlLimit && urlLimit > 0 && urlLimit < urls.length) {
    urls = urls.slice(0, urlLimit);
    console.log(`✅ Found ${originalCount} URLs in sitemap, limiting to ${urls.length} URLs`);
  } else {
    console.log(`✅ Found ${urls.length} URLs in sitemap`);
  }

  // Create audit record
  const newAudit: NewAudit = {
    user_id: userId,
    sitemap_url: sitemapUrl,
    status: 'pending',
    total_urls: urls.length,
    processed_urls: 0,
    rate_limit_ms: rateLimitMs,
    url_limit: urlLimit,
  };

  const auditResult = await db.insert(audits).values(newAudit).returning();
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
  const completedPages = Number(pages.find((p) => p.status === 'completed')?.count || 0);
  const failedPages = Number(pages.find((p) => p.status === 'failed')?.count || 0);
  const crawlingPages = Number(pages.find((p) => p.status === 'crawling')?.count || 0);
  const analyzingPages = Number(pages.find((p) => p.status === 'analyzing')?.count || 0);
  const pendingPages = Number(pages.find((p) => p.status === 'pending')?.count || 0);
  
  // Calculate how many pages have been crawled (all non-pending pages)
  // pending = waiting for crawl, everything else = crawled or in progress
  const crawledPages = totalPages - pendingPages;
  
  // Calculate overall progress percentage (weighted: crawling = 50%, analyzing = 100%)
  const crawlProgress = crawledPages / totalPages;
  const analyzeProgress = completedPages / totalPages;
  const overallPercentage = totalPages > 0 
    ? Math.round(((crawlProgress * 0.5) + (analyzeProgress * 0.5)) * 100) 
    : 0;

  console.log('[DEBUG] getAuditProgress:', {
    auditId,
    totalPages,
    statusCounts: pages.map(p => ({ status: p.status, count: Number(p.count) })),
    calculated: {
      completed: completedPages,
      failed: failedPages,
      crawling: crawlingPages,
      analyzing: analyzingPages,
      pending: pendingPages,
      crawled: crawledPages,
      percentage: overallPercentage,
    },
  });

  return {
    audit: audit[0],
    progress: {
      total: totalPages,
      completed: completedPages,
      failed: failedPages,
      crawling: crawlingPages,
      analyzing: analyzingPages,
      pending: pendingPages,
      crawled: crawledPages,
      percentage: overallPercentage,
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
        return { ...page, issues_summary: '', snippets: '', suggestions: '' };
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

      // Collect suggestions
      const suggestions: string[] = [];
      for (const issue of issues) {
        if (issue.suggestion) {
          suggestions.push(issue.suggestion);
        }
      }

      return {
        ...page,
        issues_summary: issuesSummary,
        snippets: snippets.join(' | '),
        suggestions: suggestions.join(' | '),
      };
    })
  );

  // Helper function to escape CSV values
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  // Generate CSV
  const headers = ['url', 'quality_score', 'issue_count', 'issues_summary', 'flagged_snippets', 'suggestions'];
  const rows = pagesWithIssues.map((page) => [
    escapeCSV(page.url),
    page.quality_score?.toString() || '',
    page.issues?.toString() || '0',
    escapeCSV(page.issues_summary),
    escapeCSV(page.snippets),
    escapeCSV(page.suggestions),
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  return csv;
}

/**
 * Process a crawl_page job
 */
export async function processCrawlPageJob(job: JobQueue): Promise<void> {
  const db = await getDatabase();
  
  console.log('[DEBUG] processCrawlPageJob received job:', {
    jobId: job.id,
    jobType: job.job_type,
    payloadType: typeof job.payload,
    payloadValue: job.payload,
    payloadIsString: typeof job.payload === 'string',
  });
  
  // Parse payload if it's a string
  let parsedPayload = job.payload;
  if (typeof parsedPayload === 'string') {
    try {
      parsedPayload = JSON.parse(parsedPayload);
    } catch (e) {
      console.error('[DEBUG] Failed to parse payload in processCrawlPageJob:', {
        payload: parsedPayload,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
      throw new Error('Invalid payload format');
    }
  }
  
  const payload = parsedPayload as { audit_id: string; page_id: string; url: string; rate_limit_ms: number };

  console.log('[DEBUG] processCrawlPageJob started:', {
    jobId: job.id,
    pageId: payload.page_id,
    url: payload.url,
    auditId: payload.audit_id,
    rateLimitMs: payload.rate_limit_ms,
  });

  try {
    // Update page status to crawling
    await db
      .update(auditPages)
      .set({ status: 'crawling' })
      .where(eq(auditPages.id, payload.page_id));
    
    console.log('[DEBUG] Updated page to crawling:', {
      pageId: payload.page_id,
    });

    // Wait for rate limiting (ensure non-negative delay)
    const delay = Math.max(0, payload.rate_limit_ms || 0);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Crawl the URL
    console.log(`🕷️ Crawling: ${payload.url}`);
    const { title, content } = await crawlUrl(payload.url);

    console.log('[DEBUG] Crawl successful:', {
      url: payload.url,
      titleLength: title?.length || 0,
      contentLength: content?.length || 0,
    });

    // Update page with crawled content
    await db
      .update(auditPages)
      .set({
        title,
        content,
        status: 'analyzing', // Crawled, ready for analysis
      })
      .where(eq(auditPages.id, payload.page_id));

    console.log('[DEBUG] Updated page to analyzing:', {
      pageId: payload.page_id,
    });

    // Enqueue analysis job
    const analyzeJobId = await enqueueJob('analyze_page', {
      audit_id: payload.audit_id,
      page_id: payload.page_id,
    });

    console.log('[DEBUG] Enqueued analyze job:', {
      analyzeJobId,
      pageId: payload.page_id,
    });

    console.log(`✅ Crawled: ${payload.url}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DEBUG] Crawl failed:', {
      url: payload.url,
      pageId: payload.page_id,
      error: errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
    });

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
  
  // Parse payload if it's a string
  let parsedPayload = job.payload;
  if (typeof parsedPayload === 'string') {
    try {
      parsedPayload = JSON.parse(parsedPayload);
    } catch (e) {
      console.error('[DEBUG] Failed to parse payload in processAnalyzePageJob:', {
        payload: parsedPayload,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
      throw new Error('Invalid payload format');
    }
  }
  
  const payload = parsedPayload as { audit_id: string; page_id: string };

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

