import { readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
if(!connectionString)throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
const pool=new pg.Pool({connectionString,max:1,ssl:connectionString.includes('localhost')||connectionString.includes('127.0.0.1')?undefined:{rejectUnauthorized:true}});
const sql = await readFile(new URL('./schema.sql',import.meta.url),'utf8');
await pool.query(sql);
await pool.end();
console.log('Schema applied');
