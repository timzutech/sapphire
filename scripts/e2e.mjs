// End-to-end flows through the real UI (requires the demo seed and a running server).
// usage: node scripts/e2e.mjs
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const stamp = Date.now().toString().slice(-6);
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };

async function session(email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${base}/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'Password123!');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
  return { ctx, page };
}

async function submitDialog(page, triggerName, fill) {
  await page.getByRole('button', { name: triggerName }).first().click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  await fill(dlg);
  await dlg.locator('button[type=submit]').click();
  await dlg.waitFor({ state: 'detached' }).catch(() => {});
  await page.waitForTimeout(800);
}

// ---------- member flows
{
  const { ctx, page } = await session('ada@demo.officehub.test');
  // wrong login is rejected (separate context)
  const anon = await browser.newPage();
  await anon.goto(`${base}/login`); await anon.fill('input[name=email]', 'ada@demo.officehub.test'); await anon.fill('input[name=password]', 'wrong-pass1');
  await anon.click('button[type=submit]'); await anon.waitForTimeout(1500);
  check(anon.url().includes('/login') && (await anon.textContent('body')).includes('Incorrect email or password'), 'invalid password is rejected with a message');
  await anon.close();

  // record income
  await page.goto(`${base}/money`, { waitUntil: 'networkidle' });
  await submitDialog(page, 'Record transaction', async (d) => {
    await d.locator('input[name=amount]').fill('12,345.67');
    await d.locator('input[name=description]').fill(`E2E commission ${stamp}`);
  });
  await page.reload({ waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`E2E commission ${stamp}`), 'personal income persists after reload');
  check((await page.textContent('body')).includes('12,345.67'), 'amount formatted in NGN');

  // validation error stays in the form
  await page.getByRole('button', { name: 'Record transaction' }).first().click();
  let d = page.locator('dialog[open]');
  await d.locator('input[name=amount]').fill('abc');
  await d.locator('button[type=submit]').click();
  await page.waitForTimeout(1000);
  check((await d.textContent()).includes('must be a number'), 'invalid amount shows a field error');
  await d.getByRole('button', { name: 'Cancel' }).click();

  // add a prospect, then a duplicate phone is refused
  await page.goto(`${base}/prospects`, { waitUntil: 'networkidle' });
  const phone = `0809${stamp}1`;
  await submitDialog(page, 'Add prospect', async (dl) => { await dl.locator('input[name=name]').fill(`E2E Lead ${stamp}`); await dl.locator('input[name=phone]').fill(phone); });
  await page.reload({ waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`E2E Lead ${stamp}`), 'prospect persists');
  await page.getByRole('button', { name: 'Add prospect' }).first().click();
  d = page.locator('dialog[open]');
  await d.locator('input[name=name]').fill('Dup'); await d.locator('input[name=phone]').fill(phone);
  await d.locator('button[type=submit]').click();
  await page.waitForTimeout(1500);
  check((await page.textContent('body')).includes('already exists in this office'), 'duplicate prospect phone is refused');
  await d.getByRole('button', { name: 'Cancel' }).click();

  // personal task
  await page.goto(`${base}/tasks`, { waitUntil: 'networkidle' });
  await submitDialog(page, 'Add task', async (dl) => { await dl.locator('input[name=title]').fill(`E2E task ${stamp}`); });
  await page.reload({ waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`E2E task ${stamp}`), 'personal task persists');

  // access control
  await page.goto(`${base}/admin/finances`, { waitUntil: 'networkidle' });
  const h1 = await page.textContent('h1');
  check(!h1.includes('Office finances') && !(await page.textContent('body')).includes('Recorded cash balance'), 'member gets no admin page content (redirected to dashboard)');
  const exp = await page.request.get(`${base}/api/export/fines`);
  check(exp.status() === 403, 'member cannot download admin exports (403)');
  await ctx.close();
}

// ---------- admin flows
{
  const { ctx, page } = await session('admin@demo.officehub.test');
  await page.goto(`${base}/admin/tasks`, { waitUntil: 'networkidle' });
  await submitDialog(page, 'Assign task', async (d) => {
    await d.locator('input[name=title]').fill(`E2E assigned ${stamp}`);
    await d.getByLabel('Ada Okafor').check();
  });
  await page.reload({ waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`E2E assigned ${stamp}`), 'assigned task visible to admin');

  await page.goto(`${base}/admin/expenses?status=pending`, { waitUntil: 'networkidle' });
  const approve = page.getByRole('button', { name: 'Approve' }).first();
  if (await approve.count()) {
    await approve.click(); await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    check(true, 'expense approval submitted');
  }

  await page.goto(`${base}/admin/fines`, { waitUntil: 'networkidle' });
  await submitDialog(page, 'Issue fine', async (d) => {
    await d.getByLabel('Emeka Nwosu').check();
    await d.locator('input[name=amount]').fill('750');
    await d.locator('textarea[name=reason]').fill(`E2E fine ${stamp}`);
  });
  await page.reload({ waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`E2E fine ${stamp}`), 'fine issued and listed');

  await page.goto(`${base}/admin/audit`, { waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`E2E fine ${stamp}`) || (await page.textContent('body')).includes('Issued fine of 750'), 'fine issuance is in the audit log');

  const csv = await page.request.get(`${base}/api/export/fines`);
  check(csv.status() === 200 && (await csv.text()).includes(`E2E fine ${stamp}`), 'admin CSV export contains the new fine');
  await ctx.close();
}

// ---------- member sees admin-created data
{
  const { ctx, page } = await session('ada@demo.officehub.test');
  await page.goto(`${base}/tasks`, { waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`E2E assigned ${stamp}`), 'member sees the task assigned to them');
  await page.goto(`${base}/notifications`, { waitUntil: 'networkidle' });
  check((await page.textContent('body')).includes(`New task: E2E assigned ${stamp}`), 'member got an in-app notification');
  await ctx.close();
}
{
  const { ctx, page } = await session('kunle@demo.officehub.test');
  await page.goto(`${base}/prospects?view=all`, { waitUntil: 'networkidle' });
  check(!(await page.textContent('body')).includes(`E2E Lead ${stamp}`), 'another member cannot see Ada’s private prospect');
  await page.goto(`${base}/fines`, { waitUntil: 'networkidle' });
  check(!(await page.textContent('body')).includes(`E2E fine ${stamp}`), 'members only see their own fines');
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll E2E checks passed');
process.exit(failures ? 1 : 0);
