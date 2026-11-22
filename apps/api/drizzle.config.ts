import { defineConfig } from 'drizzle-kit'
// Supabase: use the DIRECT connection (port 5432) for migrations; the app can use the pooler.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://planwalk:planwalk_dev@127.0.0.1:5432/planwalk' },
})
