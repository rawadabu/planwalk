import { pgTable, text, timestamp, boolean, integer, real, doublePrecision, pgEnum, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core'

// ───────────────────────── Better Auth (core + organization plugin) ─────────────────────────
// Field names must match Better Auth's expectations (checked against better-auth 1.7 getAuthTables).
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id'),
}, t => [index('session_user_idx').on(t.userId)])
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('account_user_idx').on(t.userId)])
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: text('metadata'),            // JSON: { kind: 'developer' | 'architect' | 'private' }
})
export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),          // owner | admin | architect | sales | viewer
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('member_org_user_uq').on(t.organizationId, t.userId)])
export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  inviterId: text('inviter_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

// ───────────────────────── Planwalk domain ─────────────────────────
// organization → project → (building →) unit → house (the 1:1 3D model a unit type uses)
export const projectKind = pgEnum('project_kind', ['development', 'private'])
export const unitStatus = pgEnum('unit_status', ['available', 'reserved', 'sold'])
export const uploadStatus = pgEnum('upload_status', ['uploaded', 'extracting', 'review', 'furnishing', 'ready', 'failed'])
export const sharePermission = pgEnum('share_permission', ['view', 'comment'])

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: projectKind('kind').notNull().default('private'),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  northDeg: real('north_deg'),           // plan "up" relative to true north, for the real sun path
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('project_org_idx').on(t.organizationId)])

export const building = pgTable('building', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  floors: integer('floors'),
  sort: integer('sort').notNull().default(0),
}, t => [index('building_project_idx').on(t.projectId)])

/** A walkable 3D model (house.json in storage at houses/<id>/). Public houses (demo) need no login. */
export const house = pgTable('house', {
  id: text('id').primaryKey(),           // url-safe slug, also the storage folder
  projectId: text('project_id').references(() => project.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  public: boolean('public').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('house_project_idx').on(t.projectId)])

export const unit = pgTable('unit', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  buildingId: text('building_id').references(() => building.id, { onDelete: 'set null' }),
  houseId: text('house_id').references(() => house.id, { onDelete: 'set null' }),
  number: text('number').notNull(),      // "14", "B-3"
  floor: integer('floor'),
  rooms: real('rooms'),                  // 4.5 rooms
  areaM2: real('area_m2'),
  status: unitStatus('status').notNull().default('available'),
  priceIls: integer('price_ils'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('unit_project_idx').on(t.projectId)])

export const planUpload = pgTable('plan_upload', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  fileKey: text('file_key').notNull(),   // storage key of the PDF
  fileName: text('file_name').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  status: uploadStatus('status').notNull().default('uploaded'),
  houseId: text('house_id').references(() => house.id, { onDelete: 'set null' }),     // the model built from these plans
  error: text('error'),                                                              // why the build failed
  report: jsonb('report'),                                                           // what the pipeline understood (scale, storeys, warnings)
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('upload_project_idx').on(t.projectId)])

/** Share links: the raw token is shown once; only its SHA-256 is stored. */
export const shareLink = pgTable('share_link', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  houseId: text('house_id').notNull().references(() => house.id, { onDelete: 'cascade' }),
  permission: sharePermission('permission').notNull().default('view'),
  label: text('label'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [index('share_house_idx').on(t.houseId)])

/** A note pinned to a spot in a house (floor + plan px + height). Threads: replies have parentId. */
export const comment = pgTable('comment', {
  id: text('id').primaryKey(),
  houseId: text('house_id').notNull().references(() => house.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),            // signed-in name, or the name a share-link guest typed
  shareLinkId: text('share_link_id').references(() => shareLink.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  floor: integer('floor').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  h: real('h').notNull().default(0),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('comment_house_idx').on(t.houseId)])

/** A design: finishes and options layered over a house's base model (design@1 in `data`). The base is never edited. */
export const design = pgTable('design', {
  id: text('id').primaryKey(),
  houseId: text('house_id').notNull().references(() => house.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  version: integer('version').notNull().default(1),        // optimistic concurrency: PUT must send the version it edited
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('design_house_idx').on(t.houseId)])

/** Every saved version of a design, so any earlier state can be restored. */
export const designRevision = pgTable('design_revision', {
  id: text('id').primaryKey(),
  designId: text('design_id').notNull().references(() => design.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('design_rev_unique').on(t.designId, t.version)])

/** An organisation's prices (over the default example prices). One row per organisation. */
export const priceBook = pgTable('price_book', {
  organizationId: text('organization_id').primaryKey().references(() => organization.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A client of one project: sees only that project's houses, comments, and works on their own designs. */
export const projectMember = pgTable('project_member', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('client'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('project_member_unique').on(t.projectId, t.userId), index('project_member_user_idx').on(t.userId)])

/** An invitation for a client. The raw token is in the link only; its SHA-256 is stored. One use. */
export const projectInvite = pgTable('project_invite', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [index('project_invite_project_idx').on(t.projectId)])

/** "Send to the architect": a snapshot of what the client changed (the change report) at one design version. */
export const feedback = pgTable('feedback', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  houseId: text('house_id').notNull().references(() => house.id, { onDelete: 'cascade' }),
  designId: text('design_id').references(() => design.id, { onDelete: 'set null' }),
  designVersion: integer('design_version'),
  authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
  message: text('message'),
  report: jsonb('report').notNull(),
  status: text('status').notNull().default('sent'),      // sent | seen | done
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp('seen_at', { withTimezone: true }),
}, t => [index('feedback_project_idx').on(t.projectId)])
