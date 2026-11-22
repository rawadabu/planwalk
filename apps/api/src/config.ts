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
}
