import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

// Same-origin: the API serves /api/auth (Vite proxies it in dev).
export const authClient = createAuthClient({ basePath: '/api/auth', plugins: [organizationClient()] })
export const { useSession, signIn, signUp, signOut } = authClient
