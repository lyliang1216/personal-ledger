import { Injectable } from '@nestjs/common'

import { PrismaService } from './prisma/prisma.service'

export interface HealthStatus {
  status: 'ok'
}

@Injectable()
export class AppService {
  constructor(private readonly prismaService: PrismaService) {}

  getHello(): string {
    return 'Personal Ledger API'
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
    }
  }

  async getDatabaseHealth(): Promise<HealthStatus> {
    await this.prismaService.$queryRaw`SELECT 1`

    return {
      status: 'ok',
    }
  }
}
