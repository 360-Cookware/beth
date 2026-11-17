import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (PostgreSQL connection string).');
  }
  // Rust-free client: queries run through the pg driver adapter.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const prisma = globalThis.prismaGlobal ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
