import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'

import { AuthService } from './auth.service'
import type { AuthenticatedUser, LoginResult, PublicUser } from './auth.types'
import { CurrentUser } from './current-user.decorator'
import { JwtAuthGuard } from './jwt-auth.guard'
import { LoginDto } from './login.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<LoginResult> {
    return this.authService.login(loginDto)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() currentUser: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.getCurrentUser(currentUser.userId)
  }
}
