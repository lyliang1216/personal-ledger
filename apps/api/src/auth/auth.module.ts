import { Module } from '@nestjs/common'
import { JwtModule, type JwtModuleOptions, type JwtSignOptions } from '@nestjs/jwt'

import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'

const getRequiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name]

  if (!value?.trim()) {
    throw new Error(`${name} 未配置，无法初始化身份认证。`)
  }

  return value
}

const getJwtModuleOptions = (): JwtModuleOptions => {
  const secret = getRequiredEnvironmentVariable('JWT_SECRET')
  const expiresIn = getRequiredEnvironmentVariable('JWT_EXPIRES_IN').trim()

  return {
    secret,
    signOptions: {
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    },
  }
}

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: getJwtModuleOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
