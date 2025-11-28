import { XMLParser } from 'fast-xml-parser';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

interface SitemapIndex {
  sitemap: SitemapUrl | SitemapUrl[];
}

interface Sitemap {
  urlset?: {
    url: SitemapUrl | SitemapUrl[];
  };
  sitemapindex?: {
    sitemap: SitemapUrl | SitemapUrl[];
  };
}

/**
 * Parse a sitemap XML and extract all URLs
 * Supports both regular sitemaps and sitemap indexes
 */
export async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'Content-Quality-Auditor/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });

    const parsed: Sitemap = parser.parse(xmlText);

    // Check if it's a sitemap index
    if (parsed.sitemapindex) {
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];

      // Recursively fetch all sitemaps
      const allUrls: string[] = [];
      for (const sitemap of sitemaps) {
        if (sitemap.loc) {
          const urls = await parseSitemap(sitemap.loc);
          allUrls.push(...urls);
        }
      }
      return allUrls;
    }

    // Regular sitemap
    if (parsed.urlset?.url) {
      const urls = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];

      return urls
        .map((url) => url.loc)
        .filter((loc): loc is string => typeof loc === 'string' && loc.length > 0);
    }

    throw new Error('Invalid sitemap format: no urlset or sitemapindex found');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Sitemap parsing failed: ${error.message}`);
    }
    throw error;
  }
}

