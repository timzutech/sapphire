import postgres from 'postgres';
import { migrate } from '../scripts/migrate';
import { createSql, type Sql, type Tx } from '@/server/db';
import { bootstrapOffice } from '@/server/services/office';

const ownerBase = process.env.DATABASE_OWNER_URL!;
const appBase = process.env.DATABASE_URL!;
const testDb = process.env.TEST_DATABASE_NAME ?? 'officehub_test';
const swapDb = (url: string) => {
  const u = new URL(url);
  u.pathname = `/${testDb}`;
  return u.toString();
};
export const OWNER_URL = swapDb(ownerBase);
export const APP_URL = swapDb(appBase);

export interface Fixture {
  owner: Sql;
  app: Sql;
  officeA: string;
  officeB: string;
  adminA: string;
  memberA1: string;
  memberA2: string;
  adminB: string;
}

export async function setupDb(): Promise<Fixture> {
  await migrate(OWNER_URL, { reset: true, appPassword: process.env.DATABASE_APP_PASSWORD, quiet: true });
  const owner = createSql(OWNER_URL, 2);
  const app = createSql(APP_URL, 4);
  const mkUser = async (email: string, name: string) =>
    (await owner`insert into users (email, full_name, password_hash) values (${email}, ${name}, app.hash_password('Password123')) returning id`)[0].id as string;
  const [{ id: officeA }] = await owner`insert into offices (name, slug, timezone) values ('Office A', 'office-a', 'Africa/Lagos') returning id`;
  const [{ id: officeB }] = await owner`insert into offices (name, slug, timezone) values ('Office B', 'office-b', 'Africa/Lagos') returning id`;
  await owner.begin((tx) => bootstrapOffice(tx, officeA));
  await owner.begin((tx) => bootstrapOffice(tx, officeB));
  const adminA = await mkUser('admin.a@test.dev', 'Admin A');
  const memberA1 = await mkUser('m1.a@test.dev', 'Member One');
  const memberA2 = await mkUser('m2.a@test.dev', 'Member Two');
  const adminB = await mkUser('admin.b@test.dev', 'Admin B');
  await owner`insert into memberships (office_id, user_id, role, joined_on) values
    (${officeA}, ${adminA}, 'admin', '2026-01-01'), (${officeA}, ${memberA1}, 'member', '2026-01-01'),
    (${officeA}, ${memberA2}, 'member', '2026-01-01'), (${officeB}, ${adminB}, 'admin', '2026-01-01')`;
  return { owner, app, officeA, officeB, adminA, memberA1, memberA2, adminB };
}

export async function teardown(f: Fixture) {
  await f.app.end();
  await f.owner.end();
}

/** Runs fn as `userId` in `officeId` through the RLS-restricted app role; optional fake clock. */
export function as<T>(f: Fixture, userId: string, officeId: string, fn: (tx: Tx) => Promise<T>, fakeNow?: string): Promise<T> {
  return f.app.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true), set_config('app.office_id', ${officeId}, true), set_config('app.fake_now', ${fakeNow ?? ''}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export async function expectDbError(p: Promise<unknown>, match?: RegExp | string): Promise<string> {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (match && !(typeof match === 'string' ? msg.includes(match) : match.test(msg))) {
      throw new Error(`Expected error matching ${match}, got: ${msg}`);
    }
    return msg;
  }
  throw new Error('Expected the operation to fail, but it succeeded');
}

export { postgres };
