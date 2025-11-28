import { getEnv } from '../lib/env';

interface JinaResponse {
  title?: string;
  content?: string;
  markdown?: string;
  text?: string;
}

/**
 * Crawl a URL using Jina Reader API
 * Returns extracted title and content (main content without navigation/footer)
 */
export async function crawlUrl(url: string): Promise<{ title: string; content: string }> {
  try {
    const jinaApiKey = getEnv('JINA_API_KEY');
    // Jina Reader API expects the URL directly without encoding
    const jinaUrl = `https://r.jina.ai/${url}`;

    const headers: HeadersInit = {
      'Accept': 'application/json',
      'User-Agent': 'Content-Quality-Auditor/1.0',
    };

    // Add API key if available (increases rate limits)
    if (jinaApiKey) {
      headers['X-API-Key'] = jinaApiKey;
    }

    const response = await fetch(jinaUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Jina API error (${response.status}): ${errorText}`);
    }

    // Get raw response text first for debugging
    const rawText = await response.text();
    console.log(`📄 Jina response for ${url}:`, rawText.substring(0, 500));

    // Try to parse as JSON, otherwise use raw text as content
    let data: JinaResponse;
    let content: string;
    let title: string;

    try {
      data = JSON.parse(rawText);
      // Jina JSON response has data.content or data.data.content
      const responseData = (data as any).data || data;
      title = responseData.title || 'Untitled';
      content = responseData.content || responseData.markdown || responseData.text || '';
    } catch {
      // Not JSON - Jina returns plain text/markdown by default
      title = 'Untitled';
      content = rawText;
    }

    if (!content || content.trim().length === 0) {
      throw new Error('No content extracted from page');
    }

    return {
      title: title.trim(),
      content: content.trim(),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Crawling failed for ${url}: ${error.message}`);
    }
    throw error;
  }
}

