import { chromium } from 'playwright';

const url = process.env.PLANNER_URL ?? 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function commandText() {
  return page.getByTestId('last-command').textContent();
}

async function outcomeText() {
  return page.getByTestId('last-outcome').textContent();
}

async function dragBy(locator, dx, dy) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const box = await locator.boundingBox();
  if (!box) throw new Error('target has no browser bounding box');
  const x = box.x + Math.min(Math.max(box.width * 0.35, 12), Math.max(box.width - 12, 12));
  const y = box.y + Math.min(Math.max(box.height * 0.35, 12), Math.max(box.height - 12, 12));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move(x + dx, y + dy, { steps: 18 });
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.waitForTimeout(350);
  return box;
}

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  const event = page.getByTestId('schedule-event-schedule-schedule-deep-work');
  await event.waitFor({ state: 'visible' });
  await event.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  check(
    (await event.getAttribute('role')) === 'button',
    'production event is not keyboard-actionable',
  );
  check((await event.getAttribute('tabindex')) === '0', 'production event has no tabindex');

  const beforeMove = await event.boundingBox();
  await dragBy(event, 0, 44);
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="last-command"]')?.textContent?.includes('"kind": "move"'),
  );
  const afterMove = await event.boundingBox();
  check(
    Boolean(beforeMove && afterMove && Math.abs(afterMove.y - beforeMove.y) > 10),
    'successful drag did not move event visually',
  );
  check(
    (await outcomeText()).includes('"status": "applied"'),
    'successful drag did not reach applied owner outcome',
  );

  const resizer = event.locator('.fc-ve.fc-ll').last();
  await resizer.waitFor({ state: 'visible' });
  await event.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const beforeResize = await event.boundingBox();
  const rbox = await resizer.boundingBox();
  if (!rbox) throw new Error('resize handle has no bounding box');
  await page.mouse.move(rbox.x + rbox.width / 2, rbox.y + Math.max(rbox.height / 2, 1));
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move(rbox.x + rbox.width / 2, rbox.y + 38, { steps: 18 });
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.waitForTimeout(350);
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="last-command"]')
      ?.textContent?.includes('"kind": "resize"'),
  );
  const afterResize = await event.boundingBox();
  check(
    Boolean(beforeResize && afterResize && afterResize.height > beforeResize.height + 8),
    'successful resize did not change event height',
  );
  check(
    (await outcomeText()).includes('"status": "applied"'),
    'successful resize did not reach applied owner outcome',
  );

  await page.getByTestId('fail-next-mutation').click();
  const beforeRejectedMove = await event.boundingBox();
  const previousCommand = await commandText();
  await dragBy(event, 0, 44);
  await page.waitForFunction((previous) => {
    const current = document.querySelector('[data-testid="last-command"]')?.textContent ?? '';
    const outcome = document.querySelector('[data-testid="last-outcome"]')?.textContent ?? '';
    return (
      current !== previous &&
      current.includes('"kind": "move"') &&
      outcome.includes('"status": "failed"')
    );
  }, previousCommand);
  const afterRejectedMove = await event.boundingBox();
  check(
    Boolean(
      beforeRejectedMove &&
      afterRejectedMove &&
      Math.abs(afterRejectedMove.y - beforeRejectedMove.y) < 3,
    ),
    'failed owner mutation did not visually revert',
  );

  if (failures.length) throw new Error(failures.join('; '));
  console.log('PLAN-4304 browser parity PASS: drag applied, resize applied, failed drag reverted');
} finally {
  await browser.close();
}
