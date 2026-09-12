import { test } from '@playwright/test';

test('Check tasks route', async ({ page }) => {
  const baseUrl = 'http://localhost:5173';
  const testUsername = 'Test123123';
  const testPassword = 'Llh123123!';

  // 登录
  await page.goto(`${baseUrl}/auth`);
  await page.locator('[data-testid="login-username-input"] input').fill(testUsername);
  await page.locator('[data-testid="login-password-input"] input').fill(testPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${baseUrl}/`);
  await page.waitForTimeout(1000);

  // 导航到任务模板页面
  await page.goto(`${baseUrl}/tasks`);
  await page.waitForTimeout(2000);

  // 获取页面标题
  const title = await page.title();
  console.log('Page title:', title);

  // 获取 URL
  const url = page.url();
  console.log('Current URL:', url);

  // 查找主要内容
  const h1 = await page.locator('h1, h2, h3').first().textContent().catch(() => 'No heading');
  console.log('First heading:', h1);

  // 查找 TaskPlanManagement 组件
  const managementDiv = page.locator('#task-plan-management');
  const exists = await managementDiv.count();
  console.log('TaskPlanManagement component exists:', exists > 0);

  // 打印页面文本内容（前1000字符）
  const bodyText = await page.locator('body').textContent();
  console.log('Body text (first 500 chars):', bodyText?.substring(0, 500));
});
