#!/usr/bin/env node

/**
 * Simple migration runner
 * Run this when the database is running
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  // Read DATABASE_URL from environment or use default local connection
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5502/postgres';
  
  console.log('🔗 Connecting to database...');
  const sql = postgres(dbUrl);
  
  try {
    // Test connection
    await sql`SELECT 1`;
    console.log('✅ Connected to database');
    
    // Read migration file
    const migrationPath = join(__dirname, '..', 'drizzle', '0003_url_limit.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    
    console.log('\n📄 Running migration:');
    console.log(migrationSql);
    console.log('');
    
    // Execute migration (split by semicolon for multiple statements)
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    
    console.log('✅ Migration executed successfully!');
    
    // Verify the column was added
    const result = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'app' 
        AND table_name = 'audits' 
        AND column_name = 'url_limit'
    `;
    
    if (result.length > 0) {
      console.log('✅ Verified: url_limit column exists');
      console.log(`   Column: ${result[0].column_name} (${result[0].data_type})`);
    } else {
      console.log('⚠️  Warning: url_limit column not found');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();

