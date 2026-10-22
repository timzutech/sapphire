// UI smoke test: signs in and visits pages, failing on HTTP errors, error boundaries or console errors.
// usage: node scripts/smoke.mjs <email> <path,path,...> [--shots dir]
import { chromium } from 'playwright';

const [email, pathsArg, , shotsDir] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const page = await browser.newPage({ viewport: { width: Number(process.env.VW ?? 1366), height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/login`);
await page.fill('input[name=email]', email);
await page.fill('input[name=password]', process.env.PW ?? 'Password123!');
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }), page.click('button[type=submit]')]);
let failed = 0;
for (const p of (pathsArg ?? '/dashboard').split(',')) {
  const before = errors.length;
  const res = await page.goto(`${base}${p}`, { waitUntil: 'networkidle', timeout: 60000 });
  const body = await page.textContent('body');
  const bad = !res || res.status() >= 400 || /Something went wrong|Application error|Unhandled Runtime Error/.test(body ?? '');
  const newErr = errors.slice(before);
  if (bad || newErr.length) failed++;
  console.log(`${bad || newErr.length ? 'FAIL' : 'ok  '} ${res?.status()} ${p}${newErr.length ? `\n     ${newErr.join('\n     ')}` : ''}`);
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/${p.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: true });
}
await browser.close();
process.exit(failed ? 1 : 0);
