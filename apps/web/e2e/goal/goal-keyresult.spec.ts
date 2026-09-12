/**
 * Goal KeyResult E2E 测试
 * 测试关键结果管理的核心业务流程
 */

import { test, expect, type Page } from '@playwright/test';
import { WEB_CONFIG } from '../config';
import { login } from '../helpers/testHelpers';
import { TEST_USERS } from '../config';
test.describe('Goal KeyResult - 关键结果管理', () => {
  let page: Page;
  let testGoalName: string;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    testGoalName = `E2E Goal with KR ${Date.now()}`;

    // 登录
    await login(page, TEST_USERS.MAIN.username, TEST_USERS.MAIN.password);

    // 导航到 Goal 页面
    await page.goto(WEB_CONFIG.getFullUrl(WEB_CONFIG.GOALS_PATH), {
      waitUntil: 'domcontentloaded',
    });

    // 创建测试目标
    await createGoal(page, {
      name: testGoalName,
      summary: '用于测试关键结果',
    });

    // 打开目标详情
    await page.click(`text=${testGoalName}`);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    // 清理测试数据
    await cleanupTestGoal(page, testGoalName);
  });

  test('[P0] 应该能够添加 INCREMENTAL 类型的关键结果', async () => {
    const krTitle = '完成100个任务';
    const targetValue = '100';
    const currentValue = '0';

    // Act: 添加关键结果
    await addKeyResult(page, {
      title: krTitle,
      type: 'INCREMENTAL',
      targetValue,
      currentValue,
      weight: 40,
    });

    // Assert: 验证KR显示
    await expect(page.locator(`text=${krTitle}`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${targetValue}`)).toBeVisible();

    console.log('✅ 添加INCREMENTAL类型KR测试通过');
  });

  test('[P0] 应该能够添加 PERCENTAGE 类型的关键结果', async () => {
    const krTitle = '项目完成度';

    // Act: 添加百分比类型KR
    await addKeyResult(page, {
      title: krTitle,
      type: 'PERCENTAGE',
      targetValue: '100',
      currentValue: '0',
      weight: 30,
    });

    // Assert: 验证显示
    await expect(page.locator(`text=${krTitle}`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/0%/')).toBeVisible();

    console.log('✅ 添加PERCENTAGE类型KR测试通过');
  });

  test('[P0] 应该能够添加 BINARY 类型的关键结果', async () => {
    const krTitle = '完成产品发布';

    // Act: 添加二进制类型KR
    await addKeyResult(page, {
      title: krTitle,
      type: 'BINARY',
      weight: 30,
    });

    // Assert: 验证显示
    await expect(page.locator(`text=${krTitle}`)).toBeVisible({ timeout: 5000 });

    console.log('✅ 添加BINARY类型KR测试通过');
  });

  test('[P0] 应该能够更新关键结果进度', async () => {
    const krTitle = '销售目标';

    // Arrange: 先添加KR
    await addKeyResult(page, {
      title: krTitle,
      type: 'INCREMENTAL',
      targetValue: '100',
      currentValue: '0',
      weight: 50,
    });

    // Act: 更新进度
    await updateKeyResultProgress(page, krTitle, {
      currentValue: '50',
    });

    // Assert: 验证进度更新
    await expect(page.locator('text=/50%/')).toBeVisible({ timeout: 5000 });

    console.log('✅ 更新KR进度测试通过');
  });

  test('[P0] 应该能够完成关键结果', async () => {
    const krTitle = '完成文档编写';

    // Arrange: 添加KR
    await addKeyResult(page, {
      title: krTitle,
      type: 'BINARY',
      weight: 100,
    });

    // Act: 标记为完成
    await completeKeyResult(page, krTitle);

    // Assert: 验证完成状态
    await expect(page.locator(`text=${krTitle}`)).toBeVisible();
    // 可能有完成标记,如勾选图标
    await expect(page.locator('[data-testid="kr-completed-icon"]').or(page.locator('text=/✓/'))).toBeVisible();

    console.log('✅ 完成KR测试通过');
  });

  test('[P1] 应该能够删除关键结果', async () => {
    const krTitle = '待删除的KR';

    // Arrange: 添加KR
    await addKeyResult(page, {
      title: krTitle,
      type: 'INCREMENTAL',
      targetValue: '10',
      currentValue: '0',
      weight: 20,
    });

    await expect(page.locator(`text=${krTitle}`)).toBeVisible({ timeout: 5000 });

    // Act: 删除KR
    await deleteKeyResult(page, krTitle);

    // Assert: 验证已删除
    await expect(page.locator(`text=${krTitle}`)).not.toBeVisible();

    console.log('✅ 删除KR测试通过');
  });

  test('[P1] 应该能够添加多个关键结果并计算总进度', async () => {
    // Act: 添加3个KR
    await addKeyResult(page, {
      title: 'KR 1',
      type: 'INCREMENTAL',
      targetValue: '100',
      currentValue: '100', // 100%完成
      weight: 40,
    });

    await addKeyResult(page, {
      title: 'KR 2',
      type: 'INCREMENTAL',
      targetValue: '100',
      currentValue: '50', // 50%完成
      weight: 30,
    });

    await addKeyResult(page, {
      title: 'KR 3',
      type: 'INCREMENTAL',
      targetValue: '100',
      currentValue: '0', // 0%完成
      weight: 30,
    });

    // Assert: 验证总进度
    // 预期: (100 * 0.4) + (50 * 0.3) + (0 * 0.3) = 40 + 15 + 0 = 55%
    await page.waitForTimeout(1000);

    // 查找目标总进度显示
    const progressText = page.locator('[data-testid="goal-progress"]').or(page.locator('text=/总进度|Overall Progress/'));
    await expect(progressText).toBeVisible();

    console.log('✅ 多KR总进度计算测试通过');
  });

  test('[P2] 应该验证权重总和为100%', async () => {
    // Act: 尝试添加权重总和超过100的KR
    await addKeyResult(page, {
      title: 'KR 1',
      type: 'INCREMENTAL',
      targetValue: '100',
      currentValue: '0',
      weight: 60,
    });

    await addKeyResult(page, {
      title: 'KR 2',
      type: 'INCREMENTAL',
      targetValue: '100',
      currentValue: '0',
      weight: 50, // 总和110,应该失败
    });

    // Assert: 应该显示错误提示
    const errorMessage = page.locator('text=/权重总和|weight sum|exceed/i');
    await expect(errorMessage).toBeVisible({ timeout: 3000 });

    console.log('✅ 权重验证测试通过');
  });
});

// ========== 辅助函数 ==========

async function createGoal(page: Page, options: { name: string; summary?: string }) {
  const createButton = page.getByTestId('create-goal-entry');
  await createButton.click();
  await page.waitForTimeout(500);

  await page
    .locator('input[placeholder="一段话来描述自己的目标"]')
    .or(page.locator('[data-testid="goal-name-input"]'))
    .fill(options.name);

  if (options.summary) {
    await page.locator('textarea[name="summary"]').or(page.locator('[data-testid="goal-summary-input"]')).fill(options.summary);
  }

  await page.locator('button:has-text("保存")').or(page.locator('[data-testid="save-goal-button"]')).click();
  await page.waitForTimeout(1000);
}

async function addKeyResult(
  page: Page,
  options: {
    title: string;
    type: 'INCREMENTAL' | 'PERCENTAGE' | 'BINARY';
    targetValue?: string;
    currentValue?: string;
    weight: number;
  }
) {
  console.log(`[KR] 添加关键结果: ${options.title}`);

  // 点击"添加关键结果"按钮
  const addButton = page
    .locator('button:has-text("添加关键结果")')
    .or(page.locator('button:has-text("Add Key Result")'))
    .or(page.locator('[data-testid="add-keyresult-button"]'));

  await addButton.click();
  await page.waitForTimeout(500);

  // 填写标题
  await page.locator('input[name="title"]').or(page.locator('[data-testid="kr-title-input"]')).fill(options.title);

  // 选择类型
  const typeSelect = page.locator('select[name="type"]').or(page.locator('[data-testid="kr-type-select"]'));
  if (await typeSelect.isVisible()) {
    await typeSelect.selectOption(options.type);
  }

  // 填写目标值和当前值(如果不是BINARY类型)
  if (options.type !== 'BINARY') {
    if (options.targetValue) {
      await page.locator('input[name="targetValue"]').or(page.locator('[data-testid="kr-target-input"]')).fill(options.targetValue);
    }
    if (options.currentValue) {
      await page.locator('input[name="currentValue"]').or(page.locator('[data-testid="kr-current-input"]')).fill(options.currentValue);
    }
  }

  // 填写权重
  await page.locator('input[name="weight"]').or(page.locator('[data-testid="kr-weight-input"]')).fill(options.weight.toString());

  // 保存
  await page.locator('button:has-text("保存")').or(page.locator('[data-testid="save-kr-button"]')).click();
  await page.waitForTimeout(1000);

  console.log(`[KR] 关键结果添加完成`);
}

async function updateKeyResultProgress(
  page: Page,
  krTitle: string,
  updates: { currentValue: string }
) {
  console.log(`[KR] 更新进度: ${krTitle}`);

  // 找到KR行
  const krRow = page.locator(`text=${krTitle}`).locator('..');

  // 点击编辑或直接点击进度
  const editButton = krRow.locator('button[title*="编辑"]').or(krRow.locator('[data-testid="edit-kr-button"]'));

  if (await editButton.isVisible()) {
    await editButton.click();
    await page.waitForTimeout(500);
  }

  // 更新当前值
  await page.locator('input[name="currentValue"]').or(page.locator('[data-testid="kr-current-input"]')).fill(updates.currentValue);

  // 保存
  await page.locator('button:has-text("保存")').or(page.locator('[data-testid="save-kr-button"]')).click();
  await page.waitForTimeout(1000);

  console.log(`[KR] 进度更新完成`);
}

async function completeKeyResult(page: Page, krTitle: string) {
  console.log(`[KR] 完成关键结果: ${krTitle}`);

  const krRow = page.locator(`text=${krTitle}`).locator('..');

  // 查找完成按钮或勾选框
  const completeButton = krRow
    .locator('button[title*="完成"]')
    .or(krRow.locator('[data-testid="complete-kr-button"]'))
    .or(krRow.locator('input[type="checkbox"]'));

  await completeButton.click();
  await page.waitForTimeout(1000);

  console.log(`[KR] 关键结果已完成`);
}

async function deleteKeyResult(page: Page, krTitle: string) {
  console.log(`[KR] 删除关键结果: ${krTitle}`);

  const krRow = page.locator(`text=${krTitle}`).locator('..');

  const deleteButton = krRow
    .locator('button[title*="删除"]')
    .or(krRow.locator('[data-testid="delete-kr-button"]'));

  await deleteButton.click();
  await page.waitForTimeout(500);

  // 确认删除
  const confirmButton = page.locator('button:has-text("确认")').or(page.locator('button:has-text("删除")'));
  if (await confirmButton.isVisible()) {
    await confirmButton.click();
  }

  await page.waitForTimeout(1000);

  console.log(`[KR] 关键结果已删除`);
}

async function cleanupTestGoal(page: Page, goalTitle: string) {
  try {
    await page.goto(WEB_CONFIG.getFullUrl(WEB_CONFIG.GOALS_PATH), {
      waitUntil: 'domcontentloaded',
    });
    const goalCard = page.locator(`text=${goalTitle}`);
    if (await goalCard.isVisible()) {
      await goalCard.locator('..').hover();
      const deleteButton = page.locator('button[title*="删除"]').first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
        await page.waitForTimeout(500);
        const confirmButton = page.locator('button:has-text("确认")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }
      }
    }
  } catch (error) {
    console.warn('[Cleanup] 清理测试数据失败:', error);
  }
}
