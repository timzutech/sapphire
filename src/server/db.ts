import 'server-only';
import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

declare global {
  var __officehubSql: Sql | undefined;
}

export function createSql(url: string, max = 10): Sql {
  return postgres(url, {
    max,
    idle_timeout: 20,
    onnotice: () => {},
    // Keep `date` columns as plain YYYY-MM-DD strings (office-local calendar dates; no timezone shifting).
    types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
  });
}

export function getSql(): Sql {
  if (!globalThis.__officehubSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not configured');
    globalThis.__officehubSql = createSql(url);
  }
  return globalThis.__officehubSql;
}

export interface DbContext {
  userId: string;
  officeId: string;
}

/** Runs `fn` in a transaction with the RLS request context set. All application data access goes through here. */
export async function withCtx<T>(ctx: DbContext | null, fn: (tx: Tx) => Promise<T>, sql: Sql = getSql()): Promise<T> {
  return sql.begin(async (tx) => {
    if (ctx) {
      await tx`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.office_id', ${ctx.officeId}, true)`;
    }
    return fn(tx);
  }) as Promise<T>;
}
