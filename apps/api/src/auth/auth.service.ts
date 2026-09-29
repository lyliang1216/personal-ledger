import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { verify } from 'argon2'

import { UserStatus } from '../generated/prisma/enums'
import { PrismaService } from '../prisma/prisma.service'
import type { JwtPayload, LoginResult, PublicUser } from './auth.types'
import type { LoginDto } from './login.dto'

const INVALID_CREDENTIALS_MESSAGE = '用户名或密码错误'
const UNAUTHORIZED_MESSAGE = '登录状态无效'

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResult> {
    const username = loginDto.username.trim().toLowerCase()
    const user = await this.prismaService.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
        nickname: true,
        username: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    })

    if (!user || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE)
    }

    const passwordMatched = await this.verifyPassword(user.passwordHash, loginDto.password)

    if (!passwordMatched) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE)
    }

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
    }
    const accessToken = await this.jwtService.signAsync(payload)

    return {
      accessToken,
      user: this.toPublicUser(user),
    }
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        nickname: true,
        username: true,
        role: true,
        status: true,
      },
    })

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE)
    }

    return this.toPublicUser(user)
  }

  private readonly verifyPassword = async (
    passwordHash: string,
    password: string,
  ): Promise<boolean> => {
    try {
      return await verify(passwordHash, password)
    } catch (_error) {
      return false
    }
  }

  private readonly toPublicUser = (user: PublicUser): PublicUser => {
    return {
      id: user.id,
      nickname: user.nickname,
      username: user.username,
      role: user.role,
    }
  }
}
