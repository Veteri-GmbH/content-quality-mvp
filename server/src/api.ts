import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth';
import { getDatabase, testDatabaseConnection } from './lib/db';
import { setEnvContext, clearEnvContext, getDatabaseUrl } from './lib/env';
import * as schema from './schema/users';
import { audits, auditPages, auditIssues, systemSettings } from './schema/audits';
import { eq, and, desc, sql } from 'drizzle-orm';
import { startAudit, getAuditProgress, generateCsvExport, processCrawlPageJob, processAnalyzePageJob } from './services/audit-service';
import { startJobProcessor } from './services/job-queue';

type Env = {
  RUNTIME?: string;
  [key: string]: any;
};

const app = new Hono<{ Bindings: Env }>();

// In Node.js environment, set environment context from process.env
if (typeof process !== 'undefined' && process.env) {
  setEnvContext(process.env);
}

// Environment context middleware - detect runtime using RUNTIME env var
app.use('*', async (c, next) => {
  if (c.env?.RUNTIME === 'cloudflare') {
    setEnvContext(c.env);
  }
  
  await next();
  // No need to clear context - env vars are the same for all requests
  // In fact, clearing the context would cause the env vars to potentially be unset for parallel requests
});

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check route - public
app.get('/', (c) => c.json({ status: 'ok', message: 'API is running' }));

// API routes
const api = new Hono();

// Public routes go here (if any)
api.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Hono!',
  });
});

// Database test route - public for testing
api.get('/db-test', async (c) => {
  try {
    // Use external DB URL if available, otherwise use local PostgreSQL database server
    // Note: In development, the port is dynamically allocated by port-manager.js
    const defaultLocalConnection = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5502/postgres';
    const dbUrl = getDatabaseUrl() || defaultLocalConnection;
    
    const db = await getDatabase(dbUrl);
    const isHealthy = await testDatabaseConnection();
    
    if (!isHealthy) {
      return c.json({
        error: 'Database connection is not healthy',
        timestamp: new Date().toISOString(),
      }, 500);
    }
    
    const result = await db.select().from(schema.users).limit(5);
    
    return c.json({
      message: 'Database connection successful!',
      users: result,
      connectionHealthy: isHealthy,
      usingLocalDatabase: !getDatabaseUrl(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database test error:', error);
    return c.json({
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Protected routes - require authentication
const protectedRoutes = new Hono();

protectedRoutes.use('*', authMiddleware);

protectedRoutes.get('/me', (c) => {
  const user = c.get('user');
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      photo_url: user.photo_url,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    message: 'You are authenticated!',
  });
});

// Mount the protected routes under /protected
api.route('/protected', protectedRoutes);

// Audit routes - optionally authenticated
const auditRoutes = new Hono();

// Optional auth middleware for audits (allows anonymous if configured)
auditRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // User is authenticated, set user context
    try {
      await authMiddleware(c, async () => {
        // User is set in context by authMiddleware
        await next();
      });
    } catch {
      // Auth failed, continue as anonymous
      await next();
    }
  } else {
    // No auth header, continue as anonymous
    await next();
  }
});

// Helper to get user ID from context (if authenticated)
const getUserId = (c: any): string | undefined => {
  try {
    return c.get('user')?.id;
  } catch {
    return undefined;
  }
};

// POST /audits - Start new audit
auditRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { sitemap_url, rate_limit_ms, url_limit } = body;

    if (!sitemap_url || typeof sitemap_url !== 'string') {
      return c.json({ error: 'sitemap_url is required' }, 400);
    }

    // Validate URL format
    try {
      new URL(sitemap_url);
    } catch {
      return c.json({ error: 'Invalid sitemap URL format' }, 400);
    }

    // Validate url_limit if provided
    if (url_limit !== undefined && url_limit !== null) {
      if (typeof url_limit !== 'number' || url_limit <= 0) {
        return c.json({ error: 'url_limit must be a positive number' }, 400);
      }
    }

    const userId = getUserId(c);
    const rateLimit = rate_limit_ms && typeof rate_limit_ms === 'number' ? rate_limit_ms : 1000;
    const urlLimit = url_limit && typeof url_limit === 'number' ? url_limit : undefined;

    const auditId = await startAudit(sitemap_url, userId, rateLimit, urlLimit);

    return c.json({ id: auditId, message: 'Audit started' }, 201);
  } catch (error) {
    console.error('Error starting audit:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to start audit' },
      500
    );
  }
});

// GET /audits - List all audits (for authenticated user or all if anonymous)
auditRoutes.get('/', async (c) => {
  try {
    const db = await getDatabase();
    const userId = getUserId(c);

    let auditList;
    if (userId) {
      auditList = await db
        .select()
        .from(audits)
        .where(eq(audits.user_id, userId))
        .orderBy(desc(audits.created_at));
    } else {
      // Anonymous users see all audits (for MVP simplicity)
      auditList = await db.select().from(audits).orderBy(desc(audits.created_at));
    }

    return c.json({ audits: auditList });
  } catch (error) {
    console.error('Error fetching audits:', error);
    return c.json({ error: 'Failed to fetch audits' }, 500);
  }
});

// GET /audits/:id - Get audit status and progress
auditRoutes.get('/:id', async (c) => {
  try {
    const auditId = c.req.param('id');
    const progress = await getAuditProgress(auditId);
    return c.json(progress);
  } catch (error) {
    console.error('Error fetching audit:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Audit not found' },
      404
    );
  }
});

// GET /audits/:id/pages - Get paginated list of pages
auditRoutes.get('/:id/pages', async (c) => {
  try {
    const auditId = c.req.param('id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const issueType = c.req.query('issue_type');
    const minScore = c.req.query('min_score');

    const db = await getDatabase();
    const offset = (page - 1) * limit;

    let query = db
      .select({
        id: auditPages.id,
        url: auditPages.url,
        status: auditPages.status,
        title: auditPages.title,
        quality_score: auditPages.quality_score,
        error_message: auditPages.error_message,
        created_at: auditPages.created_at,
        analyzed_at: auditPages.analyzed_at,
        issue_count: sql<number>`count(${auditIssues.id})`,
      })
      .from(auditPages)
      .leftJoin(auditIssues, eq(auditIssues.page_id, auditPages.id))
      .where(eq(auditPages.audit_id, auditId))
      .groupBy(auditPages.id)
      .orderBy(desc(auditPages.created_at))
      .limit(limit)
      .offset(offset);

    // Apply filters
    if (issueType) {
      // This would require a subquery, simplified for now
      // For MVP, we'll filter in memory
    }

    const pages = await query;

    // Filter by issue type and min score if needed
    let filteredPages = pages;
    if (issueType || minScore) {
      const pagesWithFiltering = await Promise.all(
        pages.map(async (page) => {
          const issues = await db
            .select()
            .from(auditIssues)
            .where(eq(auditIssues.page_id, page.id));

          if (issueType && !issues.some((i) => i.issue_type === issueType)) {
            return null;
          }

          if (minScore && (page.quality_score === null || page.quality_score < parseInt(minScore))) {
            return null;
          }

          return {
            ...page,
            issues,
          };
        })
      );
      filteredPages = pagesWithFiltering.filter((p): p is NonNullable<typeof p> => p !== null);
    } else {
      // Load issues for all pages
      filteredPages = await Promise.all(
        pages.map(async (page) => {
          const issues = await db
            .select()
            .from(auditIssues)
            .where(eq(auditIssues.page_id, page.id));
          return {
            ...page,
            issues,
          };
        })
      );
    }

    return c.json({
      pages: filteredPages,
      pagination: {
        page,
        limit,
        total: pages.length,
      },
    });
  } catch (error) {
    console.error('Error fetching pages:', error);
    return c.json({ error: 'Failed to fetch pages' }, 500);
  }
});

// GET /audits/:id/export - Export CSV
auditRoutes.get('/:id/export', async (c) => {
  try {
    const auditId = c.req.param('id');
    const csv = await generateCsvExport(auditId);

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="audit-${auditId}.csv"`);
    return c.text(csv);
  } catch (error) {
    console.error('Error exporting audit:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to export audit' },
      500
    );
  }
});

// DELETE /audits/:id - Delete audit
auditRoutes.delete('/:id', async (c) => {
  try {
    const auditId = c.req.param('id');
    const db = await getDatabase();
    const userId = getUserId(c);

    // Check if audit exists and belongs to user (if authenticated)
    const audit = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
    if (audit.length === 0) {
      return c.json({ error: 'Audit not found' }, 404);
    }

    if (userId && audit[0].user_id !== userId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Delete audit (cascade will delete pages and issues)
    await db.delete(audits).where(eq(audits.id, auditId));

    return c.json({ message: 'Audit deleted' });
  } catch (error) {
    console.error('Error deleting audit:', error);
    return c.json({ error: 'Failed to delete audit' }, 500);
  }
});

// Mount audit routes
api.route('/audits', auditRoutes);

// Settings routes
const settingsRoutes = new Hono();

// Default analysis prompt (fallback)
const DEFAULT_ANALYSIS_PROMPT = `Analysiere den folgenden Website-Content auf Textqualitätsprobleme.

Titel: {title}
Content:
{content}

Prüfe auf:
1. Grammatik/Rechtschreibung - Fehler in Sprache
2. Redundanz - Wiederholte Phrasen oder Absätze
3. Widersprüche - Inkonsistente Informationen (z.B. verschiedene Material-Angaben)
4. Platzhalter - Lorem Ipsum, TODO, "[hier einfügen]", etc.
5. Leere Inhalte - Fehlende Beschreibungen

Antworte NUR mit einem gültigen JSON-Array im folgenden Format (kein zusätzlicher Text):
[{ "type": "grammar|redundancy|contradiction|placeholder|empty", 
   "severity": "low|medium|high",
   "description": "...",
   "snippet": "betroffener Text",
   "suggestion": "Verbesserungsvorschlag" }]

Berechne zusätzlich einen Quality Score (0-100) basierend auf der Anzahl und Schwere der gefundenen Probleme.`;

// GET /settings/prompt - Get current analysis prompt
settingsRoutes.get('/prompt', async (c) => {
  try {
    const db = await getDatabase();
    const result = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'analysis_prompt'))
      .limit(1);

    const prompt = result.length > 0 ? result[0].value : DEFAULT_ANALYSIS_PROMPT;
    return c.json({ prompt, isDefault: result.length === 0 });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return c.json({ error: 'Failed to fetch prompt' }, 500);
  }
});

// PUT /settings/prompt - Update analysis prompt
settingsRoutes.put('/prompt', async (c) => {
  try {
    const body = await c.req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return c.json({ error: 'prompt is required' }, 400);
    }

    if (prompt.trim().length < 50) {
      return c.json({ error: 'Prompt muss mindestens 50 Zeichen lang sein' }, 400);
    }

    const db = await getDatabase();
    
    // Upsert the prompt
    await db
      .insert(systemSettings)
      .values({
        key: 'analysis_prompt',
        value: prompt.trim(),
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: prompt.trim(),
          updated_at: new Date(),
        },
      });

    return c.json({ message: 'Prompt updated successfully' });
  } catch (error) {
    console.error('Error updating prompt:', error);
    return c.json({ error: 'Failed to update prompt' }, 500);
  }
});

// GET /settings/prompt/default - Get default prompt
settingsRoutes.get('/prompt/default', (c) => {
  return c.json({ prompt: DEFAULT_ANALYSIS_PROMPT });
});

// Mount settings routes
api.route('/settings', settingsRoutes);

// Mount the protected routes under /protected
api.route('/protected', protectedRoutes);

// Mount the API router
app.route('/api/v1', api);

// Check and run database migrations on startup (only in Node.js environment)
if (typeof process !== 'undefined') {
  // Import and run migration check, then start job processor
  import('./migrations/auto-migrate').then(async (module) => {
    try {
      await module.checkAndMigrate();
      console.log('[DEBUG] Migration check completed, starting job processor...');
      
      // Start job processor after migration check completes
      startJobProcessor(async (job) => {
        if (job.job_type === 'crawl_page') {
          await processCrawlPageJob(job);
        } else if (job.job_type === 'analyze_page') {
          await processAnalyzePageJob(job);
        }
      }).catch((error) => {
        console.error('[DEBUG] Failed to start job processor:', {
          code: error?.code,
          message: error?.message,
        });
      });
    } catch (error) {
      console.error('Migration check failed:', error);
      // Still try to start job processor after delay
      setTimeout(() => {
        console.log('[DEBUG] Starting job processor after migration failure...');
        startJobProcessor(async (job) => {
          if (job.job_type === 'crawl_page') {
            await processCrawlPageJob(job);
          } else if (job.job_type === 'analyze_page') {
            await processAnalyzePageJob(job);
          }
        }).catch((error) => {
          console.error('[DEBUG] Failed to start job processor:', {
            code: error?.code,
            message: error?.message,
          });
        });
      }, 10000); // Wait 10 seconds if migration failed
    }
  }).catch((error) => {
    console.log('⚠️  Auto-migration not available:', error.message);
  });
}

export default app; 