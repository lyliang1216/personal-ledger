import 'dotenv/config'
import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

const bootstrap = async () => {
  try {
    const app = await NestFactory.create(AppModule)

    app.enableCors({
      origin: process.env.ADMIN_ORIGIN?.trim() || 'http://localhost:5173',
    })
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    )
    app.enableShutdownHooks()
    await app.listen(process.env.PORT ?? 3000)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

void bootstrap()
