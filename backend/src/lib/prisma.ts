import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma__: PrismaClient | undefined;
}

const prismaClient =
  global.__prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prismaClient;
}

export const prisma: any = prismaClient;
