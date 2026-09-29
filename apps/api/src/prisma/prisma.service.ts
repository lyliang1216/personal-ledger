import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client'

const getDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法初始化 Prisma Client。')
  }

  return databaseUrl
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg(
      {
        connectionString: getDatabaseUrl(),
        connectionTimeoutMillis: 60_000,
      },
      {
        schema: 'public',
      },
    )

    super({ adapter })
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
