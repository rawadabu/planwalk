import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc, ownerAc, memberAc } from 'better-auth/plugins/organization/access'

/**
 * Who can do what inside an organization. One source of truth used by Better Auth (org management)
 * and by our own routes (projects, uploads, share links).
 */
export const statements = {
  ...defaultStatements,
  project: ['read', 'create', 'update', 'delete'],
  upload: ['create'],
  unit: ['update'],
  share: ['create', 'revoke'],
} as const
export const ac = createAccessControl(statements)

export const roles = {
  owner: ac.newRole({ ...ownerAc.statements, project: ['read', 'create', 'update', 'delete'], upload: ['create'], unit: ['update'], share: ['create', 'revoke'] }),
  admin: ac.newRole({ ...adminAc.statements, project: ['read', 'create', 'update', 'delete'], upload: ['create'], unit: ['update'], share: ['create', 'revoke'] }),
  architect: ac.newRole({ ...memberAc.statements, project: ['read', 'create', 'update'], upload: ['create'], share: ['create', 'revoke'] }),
  sales: ac.newRole({ ...memberAc.statements, project: ['read'], unit: ['update'], share: ['create', 'revoke'] }),
  viewer: ac.newRole({ ...memberAc.statements, project: ['read'] }),
}
export type Role = keyof typeof roles
export type Resource = 'project' | 'upload' | 'unit' | 'share'

export function can(role: string, resource: Resource, action: string): boolean {
  const r = roles[role as Role]
  if (!r) return false
  const allowed = (r.statements as Record<string, readonly string[] | undefined>)[resource]
  return !!allowed?.includes(action)
}
