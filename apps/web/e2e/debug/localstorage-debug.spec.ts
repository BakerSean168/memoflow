import { test } from '@playwright/test';
import { login } from '../helpers/testHelpers';
import { WEB_CONFIG, TEST_USERS } from '../config';

test('检查 localStorage 中的 goal-store 数据', async ({ page }) => {
  // 监听浏览器控制台
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('setGoals') || text.includes('goalStore') || text.includes('goals.length')) {
      console.log('浏览器控制台:', text);
    }
  });

  // 导航到首页
  await page.goto(WEB_CONFIG.BASE_URL);

  // 登录
  await login(page, TEST_USERS.MAIN.username, TEST_USERS.MAIN.password);

  // 导航到 Goals 页面
  await page.goto(`${WEB_CONFIG.BASE_URL}/goals`);
  await page.waitForLoadState('domcontentloaded');

  // 等待 3 秒确保数据加载
  await page.waitForTimeout(3000);

  // 检查 localStorage
  const goalStore = await page.evaluate(() => {
    return localStorage.getItem('goal-store');
  });

  console.log('\n=== localStorage goal-store 内容 ===');
  if (goalStore) {
    const parsed = JSON.parse(goalStore);
    console.log('✅ goal-store 存在');
    console.log('Goals 数量:', parsed.goals?.length || 0);
    console.log('Is Initialized:', parsed.isInitialized);
    console.log('Last Sync Time:', parsed.lastSyncTime);
    console.log('\n完整数据:');
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    console.log('❌ goal-store 不存在于 localStorage');
  }

  // 获取所有 localStorage keys
  const allKeys = await page.evaluate(() => {
    return Object.keys(localStorage);
  });
  console.log('\n所有 localStorage keys:', allKeys);
});
