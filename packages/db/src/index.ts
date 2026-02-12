import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export * from './schema.js';
export * from './queries.js';
export * from './meilisearch.js';

// Re-export sql from drizzle-orm for use in API routes
export { sql } from 'drizzle-orm';

// Connection pool configuration
const POOL_CONFIG = {
  max: 50, // Maximum connections in pool (increased for scalability)
  idle_timeout: 30, // Close idle connections after 30 seconds
  connect_timeout: 10, // Connection timeout in seconds
  max_lifetime: 60 * 30, // Max connection lifetime (30 minutes)
};

// Singleton database instance (prevents connection exhaustion in serverless)
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let clientInstance: ReturnType<typeof postgres> | null = null;

/**
 * Create a database connection with connection pooling
 * Uses singleton pattern to reuse connections across requests
 */
export function createDb(connectionString?: string) {
  // Return existing instance if available (singleton)
  if (dbInstance && !connectionString) {
    return dbInstance;
  }

  const connString = connectionString || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/skillhub';

  // Create new client with pooling configuration
  clientInstance = postgres(connString, POOL_CONFIG);
  dbInstance = drizzle(clientInstance, { schema });

  return dbInstance;
}

/**
 * Close database connections gracefully
 * Call this during graceful shutdown
 */
export async function closeDb(): Promise<void> {
  if (clientInstance) {
    await clientInstance.end();
    clientInstance = null;
    dbInstance = null;
  }
}

/**
 * Type for the database instance
 */
export type Database = ReturnType<typeof createDb>;
