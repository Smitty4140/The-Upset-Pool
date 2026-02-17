import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const isDev = process.env.NODE_ENV === 'development';
const connectionString = isDev && process.env.DEV_DATABASE_URL
  ? process.env.DEV_DATABASE_URL
  : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log(`[Database] Using ${isDev && process.env.DEV_DATABASE_URL ? 'DEVELOPMENT (Neon)' : 'PRODUCTION (Replit)'} database`);

export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
