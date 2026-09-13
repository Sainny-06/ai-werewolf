import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
