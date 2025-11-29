-- Add url_limit column to audits table
ALTER TABLE app.audits ADD COLUMN url_limit INTEGER;

-- Add comment to explain the column
COMMENT ON COLUMN app.audits.url_limit IS 'Optional limit for number of URLs to crawl from sitemap. NULL means no limit (all URLs).';

