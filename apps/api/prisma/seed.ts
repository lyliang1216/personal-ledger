import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { argon2id, hash } from 'argon2'

import { PrismaClient } from '../src/generated/prisma/client'
import { TransactionType, UserRole, UserStatus } from '../src/generated/prisma/enums'

const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001'
const DEFAULT_LEDGER_ID = '00000000-0000-4000-8000-000000000002'
const ADMIN_USERNAME = 'admin'

const directUrl = process.env.DIRECT_URL
const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD

if (!directUrl) {
  throw new Error('DIRECT_URL 未配置，无法执行数据库种子。')
}

if (!seedAdminPassword) {
  throw new Error('SEED_ADMIN_PASSWORD 未配置，无法创建可登录管理员。')
}

const adapter = new PrismaPg(
  {
    connectionString: directUrl,
    connectionTimeoutMillis: 60_000,
  },
  {
    schema: 'public',
  },
)
const prisma = new PrismaClient({ adapter })

const seed = async () => {
  const passwordHash = await hash(seedAdminPassword, {
    type: argon2id,
  })

  await prisma.$transaction(
    [
      prisma.user.upsert({
        where: {
          id: ADMIN_USER_ID,
        },
        update: {
          nickname: 'Local Admin',
          username: ADMIN_USERNAME,
          passwordHash,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
        create: {
          id: ADMIN_USER_ID,
          nickname: 'Local Admin',
          username: ADMIN_USERNAME,
          passwordHash,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.ledger.upsert({
        where: {
          id: DEFAULT_LEDGER_ID,
        },
        update: {
          name: '默认账本',
          description: '本地开发默认账本',
          isDefault: true,
        },
        create: {
          id: DEFAULT_LEDGER_ID,
          userId: ADMIN_USER_ID,
          name: '默认账本',
          description: '本地开发默认账本',
          isDefault: true,
        },
      }),
      prisma.category.upsert({
        where: {
          id: '00000000-0000-4000-8000-000000000101',
        },
        update: {
          name: '餐饮',
          type: TransactionType.EXPENSE,
          sort: 10,
          isActive: true,
        },
        create: {
          id: '00000000-0000-4000-8000-000000000101',
          userId: ADMIN_USER_ID,
          name: '餐饮',
          type: TransactionType.EXPENSE,
          sort: 10,
        },
      }),
      prisma.category.upsert({
        where: {
          id: '00000000-0000-4000-8000-000000000102',
        },
        update: {
          name: '交通',
          type: TransactionType.EXPENSE,
          sort: 20,
          isActive: true,
        },
        create: {
          id: '00000000-0000-4000-8000-000000000102',
          userId: ADMIN_USER_ID,
          name: '交通',
          type: TransactionType.EXPENSE,
          sort: 20,
        },
      }),
      prisma.category.upsert({
        where: {
          id: '00000000-0000-4000-8000-000000000103',
        },
        update: {
          name: '工资',
          type: TransactionType.INCOME,
          sort: 10,
          isActive: true,
        },
        create: {
          id: '00000000-0000-4000-8000-000000000103',
          userId: ADMIN_USER_ID,
          name: '工资',
          type: TransactionType.INCOME,
          sort: 10,
        },
      }),
    ],
    {
      maxWait: 60_000,
      timeout: 60_000,
    },
  )
}

const main = async () => {
  try {
    await seed()
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError'

    console.error(`数据库种子执行失败：${errorName}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

void main()
