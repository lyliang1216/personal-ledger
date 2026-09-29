import type { UserRole } from '../generated/prisma/enums'

export interface AuthenticatedUser {
  userId: string
  role: UserRole
}

export interface JwtPayload {
  sub: string
  role: UserRole
}

export interface PublicUser {
  id: string
  nickname: string
  username: string | null
  role: UserRole
}

export interface LoginResult {
  accessToken: string
  user: PublicUser
}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string
  }
  user?: AuthenticatedUser
}
