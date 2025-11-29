/**
 * Automatic database migration checker and runner
 * Checks if required columns exist and runs migrations if needed
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getDatabase } from '../lib/db';
import { sql as rawSql } from 'drizzle-orm';

async function waitForDatabase(maxRetries = 10, delayMs = 2000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const db = await getDatabase();
      // Try a simple query to check if database is ready
      await db.execute(rawSql`SELECT 1`);
      console.log('[DEBUG] Database is ready');
      return;
    } catch (error: any) {
      if (error?.code === 'ECONNREFUSED' || error?.code === '57P03' || error?.message?.includes('starting up')) {
        console.log(`[DEBUG] Database not ready yet, retrying in ${delayMs}ms... (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Database did not become ready after maximum retries');
}

export async function checkAndMigrate(): Promise<void> {
  console.log('🔍 Checking database schema...');
  
  try {
    // Wait for database to be ready
    await waitForDatabase();
    
    const db = await getDatabase();
    
    // Check if url_limit column exists in audits table
    const result = await db.execute(rawSql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'app' 
        AND table_name = 'audits' 
        AND column_name = 'url_limit'
    `);
    
    // Handle different return types
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    
    if (rows.length > 0) {
      console.log('✅ Database schema is up to date');
      return;
    }
    
    console.log('⚠️  Running migration 0003_url_limit...');
    
    // Read migration file
    const migrationPath = join(__dirname, '../../drizzle/0003_url_limit.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      await db.execute(rawSql.raw(statement));
    }
    
    console.log('✅ Migration 0003_url_limit completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration check/execution failed:', error instanceof Error ? error.message : error);
    // Don't throw - let the server start anyway
    console.log('⚠️  Server will start, but the url_limit feature may not work until migration is run manually');
  }
}

