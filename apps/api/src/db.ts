import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the connected API');
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1') ? undefined : { rejectUnauthorized: true }
});
