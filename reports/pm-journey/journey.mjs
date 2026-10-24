import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:58080';
const OUT = path.resolve('reports/pm-journey');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const runId = process.env.RUN_ID ?? 'run';
const email = `pm.tester.${runId}@example.com`;
const password = 'Test123456!';

const log = [];
const consoleErrors = [];
const failedRequests = [];

function record(step, status, detail = '') {
  log.push({ step, status, detail });
  console.log(`[${status}] ${step}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
});
page.on('requestfailed', (r) => {
  failedRequests.push({ url: r.url().slice(0, 200), err: r.failure()?.errorText });
});
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().includes('/api/')) {
    failedRequests.push({ url: r.url().slice(0, 200), status: r.status() });
  }
});

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

async function grabTimes(pageName) {
  const text = await page.evaluate(() => document.body.innerText);
  const patterns =
    /(\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}日?|\d{1,2}:\d{2}(:\d{2})?|Invalid Date|NaN|1970)/g;
  const found = [...new Set(text.match(patterns) ?? [])].slice(0, 40);
  record(`time-strings@${pageName}`, 'INFO', JSON.stringify(found));
  return found;
}

async function step(name, fn) {
  try {
    await fn();
    record(name, 'OK');
  } catch (e) {
    record(name, 'FAIL', String(e).split('\n')[0]);
    await shot(`ERR-${name.replace(/[^\w-]/g, '_')}`);
  }
}

// 1. Landing → auth redirect
await step('01-landing-redirects-to-auth', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await shot('01-landing');
  if (!page.url().includes('/auth')) throw new Error('expected /auth, got ' + page.url());
});

// 2. Probe: wrong-credential login
await step('02-probe-wrong-login', async () => {
  await page.fill('#email', 'nosuch.user@example.com');
  await page.fill('#password', 'WrongPass123!');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await shot('02-wrong-login');
});

// 3. Probe: weak password on register
await step('03-register-scene-weak-password', async () => {
  const regLink = page
    .locator('button, a')
    .filter({ hasText: /注册|Sign up|Register|创建/i })
    .first();
  await regLink.click();
  await page.waitForSelector('#reg-email', { timeout: 5000 });
  await page.fill('#reg-email', email);
  await page.fill('#reg-password', '123');
  await page.fill('#confirm-password', '123');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await shot('03-register-weak-password');
});

// 4. Real registration
await step('04-register', async () => {
  await page.fill('#reg-password', password);
  await page.fill('#confirm-password', password);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  await shot('04-after-register');
});

// 5. Verify-email scene observation
await step('05-verify-email-scene', async () => {
  const body = await page.evaluate(() => document.body.innerText);
  record('05-detail', 'INFO', body.slice(0, 300).replace(/\n+/g, ' | '));
  await shot('05-verify-scene');
});

// 6. Enter app while unverified
await step('06-enter-app-home', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot('06-home-shell');
  if (page.url().includes('/auth')) throw new Error('bounced back to /auth — tokens not kept');
  await grabTimes('home');
});

// 7-11. Core pages
for (const [name, route] of [
  ['07-goals', '/goals'],
  ['08-tasks', '/tasks'],
  ['09-schedule', '/schedule/calendar'],
  ['10-reminders', '/reminders'],
  ['11-settings', '/settings'],
]) {
  await step(name, async () => {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    await shot(name);
    await grabTimes(name);
  });
}

// 12. Try create a goal via UI
await step('12-create-goal', async () => {
  await page.goto(BASE + '/goals', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const btn = page
    .locator('button')
    .filter({ hasText: /新建|创建|添加|New|Create|Add/i })
    .first();
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  await shot('12-goal-dialog');
  const input = page.locator('input[type="text"]:visible, textarea:visible').first();
  await input.fill('PM 旅程测试目标');
  await shot('12-goal-filled');
  const submit = page
    .locator('button')
    .filter({ hasText: /保存|确定|创建|提交|Save|Confirm|Create/i })
    .last();
  await submit.click({ timeout: 5000 });
  await page.waitForTimeout(2500);
  await shot('12-goal-after-submit');
  await grabTimes('goal-after-create');
});

// 13. Try create a task via UI
await step('13-create-task', async () => {
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const btn = page
    .locator('button')
    .filter({ hasText: /新建|创建|添加|New|Create|Add/i })
    .first();
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  await shot('13-task-dialog');
});

// 14. Reload persistence probe
await step('14-reload-session-persists', async () => {
  await page.goto(BASE + '/goals', { waitUntil: 'networkidle', timeout: 30000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot('14-reload-goals');
  if (page.url().includes('/auth')) throw new Error('session lost on reload');
  await grabTimes('goals-after-reload');
});

fs.writeFileSync(
  path.join(OUT, 'journey-log.json'),
  JSON.stringify(
    {
      email,
      base: BASE,
      log,
      consoleErrors: consoleErrors.slice(0, 50),
      failedRequests: failedRequests.slice(0, 50),
    },
    null,
    2,
  ),
);
console.log(
  '\n=== console errors:',
  consoleErrors.length,
  '| failed/4xx requests:',
  failedRequests.length,
);
await browser.close();
