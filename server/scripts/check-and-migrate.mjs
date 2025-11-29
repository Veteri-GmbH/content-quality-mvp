#!/usr/bin/env node

/**
 * Check if url_limit column exists and run migration if needed
 * This should be called automatically when the server starts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function checkAndMigrate() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5702/postgres';
  
  console.log('🔍 Checking database schema...');
  const sql = postgres(dbUrl, { max: 1 });
  
  try {
    // Check if url_limit column exists
    const result = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'app' 
        AND table_name = 'audits' 
        AND column_name = 'url_limit'
    `;
    
    if (result.length > 0) {
      console.log('✅ Database schema is up to date (url_limit column exists)');
      return;
    }
    
    console.log('⚠️  url_limit column not found, running migration...');
    
    // Read and execute migration
    const migrationPath = join(__dirname, '..', 'drizzle', '0003_url_limit.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration check/execution failed:', error.message);
    // Don't exit - let the server start anyway
  } finally {
    await sql.end();
  }
}

// Only run if called directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  checkAndMigrate().catch(console.error);
}

export { checkAndMigrate };

