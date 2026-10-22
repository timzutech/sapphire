/* Applies version-controlled SQL migrations from db/migrations using the owner connection.
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --reset drop everything first (development only) */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

export async function migrate(ownerUrl: string, opts: { reset?: boolean; appPassword?: string; quiet?: boolean } = {}) {
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  const log = (m: string) => !opts.quiet && console.log(m);
  try {
    if (opts.reset) {
      log('Resetting database schemas…');
      await sql.unsafe('drop schema if exists app cascade; drop schema if exists public cascade; create schema public;');
    }
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    await sql`revoke all on schema_migrations from public`;
    const dir = path.resolve(process.cwd(), 'db/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = readFileSync(path.join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`Applied ${file}`);
    }
    if (opts.appPassword) {
      await sql.unsafe(`alter role officehub_app with login password '${opts.appPassword.replace(/'/g, "''")}'`);
      const [{ db }] = await sql<{ db: string }[]>`select current_database() as db`;
      await sql.unsafe(`grant connect on database "${db}" to officehub_app`);
    }
    log('Migrations complete.');
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('scripts', 'migrate.ts'));
if (isMain) {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) {
    console.error('DATABASE_OWNER_URL is not set');
    process.exit(1);
  }
  migrate(url, { reset: process.argv.includes('--reset'), appPassword: process.env.DATABASE_APP_PASSWORD }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
