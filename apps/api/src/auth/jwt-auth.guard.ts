import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { UserRole } from '../generated/prisma/enums'
import type { AuthenticatedRequest, JwtPayload } from './auth.types'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = this.extractBearerToken(request.headers.authorization)

    if (!token) {
      throw new UnauthorizedException()
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token)

      if (!payload.sub || !this.isUserRole(payload.role)) {
        throw new UnauthorizedException()
      }

      request.user = {
        userId: payload.sub,
        role: payload.role,
      }

      return true
    } catch (_error) {
      throw new UnauthorizedException()
    }
  }

  private readonly extractBearerToken = (authorization?: string): string | null => {
    if (!authorization) {
      return null
    }

    const parts = authorization.split(' ')

    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      return null
    }

    return parts[1]
  }

  private readonly isUserRole = (role: UserRole): boolean => {
    return role === UserRole.ADMIN || role === UserRole.USER
  }
}
