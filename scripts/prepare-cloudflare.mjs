import { readFile, writeFile } from 'node:fs/promises';
const path = 'dist/server/wrangler.json';
const config = JSON.parse(await readFile(path, 'utf8'));
const id = process.env.CF_D1_DATABASE_ID;
if (!id || !/^[0-9a-f-]{36}$/i.test(id) || id === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Set build variable CF_D1_DATABASE_ID to the ID of your Cloudflare D1 database.');
}
config.name = 'udo-panel';
config.topLevelName = 'udo-panel';
config.workers_dev = true;
config.preview_urls = false;
config.assets = { ...config.assets, binding: 'ASSETS', run_worker_first: true };
config.vars = { UDO_ADMIN_USER: 'admin' };
config.d1_databases = [{ binding: 'DB', database_name: 'udo-db', database_id: id, migrations_dir: '../../drizzle' }];
config.r2_buckets = [];
await writeFile(path, JSON.stringify(config,null,2)+'\n');
console.log('Cloudflare configuration ready. Authentication is required for all routes.');
