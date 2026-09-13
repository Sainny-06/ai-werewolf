import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// SQLite 用绝对路径，保证无论从哪个 CWD 启动（next / tsx 脚本）都能打开同一个库文件；
// 部署到 Postgres（Neon）时只需设置 DATABASE_URL 环境变量。
function defaultSqliteUrl(): string {
  const abs = path.resolve(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
  return `file:${abs}`;
}

export const db: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? defaultSqliteUrl(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
