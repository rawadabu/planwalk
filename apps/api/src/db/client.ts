import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as schema from './schema.js'
import { config } from '../config.js'

// Works with local Postgres and Supabase (set DATABASE_URL; Supabase requires SSL).
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: /supabase\.(co|com)/.test(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
})
export const db = drizzle(pool, { schema })
export type Db = typeof db

export async function runMigrations() {
  const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')
  await migrate(db, { migrationsFolder: folder })
}
