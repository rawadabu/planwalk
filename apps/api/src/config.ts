import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  /** Local storage root. In production this becomes an S3/R2 bucket behind the same Storage interface. */
  storageDir: process.env.STORAGE_DIR ?? path.join(root, 'storage'),
  /** Built web app, served by the API in production (single deployable). */
  webDist: process.env.WEB_DIST ?? path.join(root, 'apps/web/dist'),
  maxUploadBytes: 50 * 1024 * 1024,
  /** Postgres (local or Supabase). Supabase: Project Settings → Database → connection string. */
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://planwalk:planwalk_dev@127.0.0.1:5432/planwalk',
  /** Public origin of the app (cookies, auth callbacks). */
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:5173',
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:8787,http://localhost:8787').split(','),
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'Planwalk <no-reply@planwalk.app>',
  authSecret: process.env.BETTER_AUTH_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'dev-only-secret-change-me-32-characters'),
}
if (process.env.NODE_ENV === 'production' && !config.authSecret) throw new Error('BETTER_AUTH_SECRET is required in production')
