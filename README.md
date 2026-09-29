# Personal Ledger

个人多端账本系统。

当前仓库只包含可运行的工程基础骨架，不包含账本业务实现。

## 项目介绍

项目采用 pnpm workspace 与 Turborepo 管理，由三个独立应用组成：

- 微信小程序：基于 uni-app、Vue 3 与 TypeScript。
- PC Web：基于 Vue 3、Vite、Vue Router、Pinia 与 Ant Design Vue。
- API：基于 Node.js、TypeScript 与 NestJS。

三个应用共享 TypeScript 类型、常量、Schema 占位与通用工具。

## 目录结构

```text
personal-ledger/
├── apps/
│   ├── miniapp/          # 微信小程序
│   ├── admin/            # PC Web 账本端
│   └── api/              # NestJS API 服务
├── packages/
│   ├── types/            # 共享 TypeScript 类型
│   ├── constants/        # 共享常量
│   ├── schemas/          # Schema 包占位
│   └── utils/            # 共享工具
└── docs/                 # 产品、数据库、API、架构与开发文档
```

## 环境要求

- Node.js >= 22
- pnpm 10

## 安装

```bash
pnpm install
```

## 全部开发启动

```bash
pnpm dev
```

该命令会通过 Turborepo 同时启动三个应用的开发任务。

## PC Web

```bash
pnpm --filter @ledger/admin dev
```

默认访问地址：`http://localhost:5173/login`。

## API

```bash
pnpm --filter @ledger/api dev
```

默认访问地址：`http://localhost:3000`，健康检查地址为
`http://localhost:3000/health`。

### PostgreSQL 与 Prisma

API 需要 PostgreSQL。先复制示例环境变量并填写真实连接信息；`DATABASE_URL` 用于 NestJS 运行时，`DIRECT_URL` 用于 Prisma CLI、migration 与 seed：

```bash
cp apps/api/.env.example apps/api/.env
```

生成 Prisma Client、应用迁移并写入最小开发数据：

```bash
pnpm --filter @ledger/api prisma:generate
pnpm --filter @ledger/api prisma:migrate:deploy
pnpm --filter @ledger/api prisma:seed
```

数据库健康检查地址为 `http://localhost:3000/health/database`。数据库模型与时间规范详见 [数据库设计](docs/database/README.md)。

## 微信小程序

```bash
pnpm --filter @ledger/miniapp dev:mp-weixin
```

编译产物位于 `apps/miniapp/dist/dev/mp-weixin`，可使用微信开发者工具导入该目录。

生产构建命令：

```bash
pnpm --filter @ledger/miniapp build:mp-weixin
```

生产构建产物位于 `apps/miniapp/dist/build/mp-weixin`。

## 构建

```bash
pnpm build
```

## 代码检查

```bash
pnpm lint
pnpm typecheck
```

格式化全部文件：

```bash
pnpm format
```

## 当前范围

当前只完成工程基础骨架。用户体系、数据库、账单、导入、分类、标签、账本、统计与权限等业务均未实现。
