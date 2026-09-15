import { test } from '@playwright/test';

const baseUrl = 'http://localhost:5173';

test.describe('Debug Dialog', () => {
  test.beforeEach(async ({ page }) => {
    // 1. 登录
    await page.goto(`${baseUrl}/auth`);
    await page.locator('[data-testid="login-username-input"] input').fill('Test123123');
    await page.locator('[data-testid="login-password-input"] input').fill('Llh123123!');
    await page.locator('[data-testid="login-submit-button"]').click();
    await page.waitForURL(`${baseUrl}/`);
    await page.waitForTimeout(1000);

    // 2. 导航到任务页面
    await page.goto(`${baseUrl}/tasks`);
    await page.waitForTimeout(1000);

    // 3. 切换到任务管理标签
    const managementTab = page.locator('button:has-text("任务管理")');
    await managementTab.click();
    await page.waitForTimeout(500);
  });

  test('should show dialog content', async ({ page }) => {
    // 监听控制台日志
    page.on('console', msg => {
      console.log('BROWSER CONSOLE:', msg.type(), msg.text());
    });
    
    // 监听页面错误
    page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.message);
    });

    console.log('\n=== Step 1: Check initial page ===');
    console.log('URL:', await page.url());
    
    // 点击创建按钮
    const createButton = page.locator('[data-testid="create-task-plan-button"]');
    console.log('\n=== Step 2: Try to open dialog ===');
    console.log('Clicking main create button');
    await createButton.click();
    
    await page.waitForTimeout(3000); // Wait longer for form to render
    
    console.log('\n=== Step 3: Check dialog visibility ===');
    const dialogTitle = page.locator('h3:has-text("创建任务模板")');
    console.log('Dialog title visible:', await dialogTitle.isVisible());
    
    // 查找所有 dialog 元素
    const dialogs = page.locator('[role="dialog"]');
    const dialogCount = await dialogs.count();
    console.log('Dialog elements found:', dialogCount);
    
    if (dialogCount > 0) {
      const dialogHtml = await dialogs.first().innerHTML();
      console.log('\n=== Dialog HTML (first 2000 chars) ===');
      console.log(dialogHtml.substring(0, 2000));
      
      // 检查是否有加载状态
      const loadingContainer = page.locator('.loading-container');
      console.log('\n=== Loading container visible:', await loadingContainer.isVisible());
      
      // 检查是否有错误状态
      const errorAlert = page.locator('.v-alert[type="error"]');
      console.log('Error alert visible:', await errorAlert.isVisible());
      
      // 检查表单容器
      const formContainer = page.locator('.form-container');
      console.log('Form container visible:', await formContainer.isVisible());
      console.log('Form container count:', await formContainer.count());
    }
    
    // 查找所有包含 v-card 的元素
    const vCards = page.locator('.v-card');
    console.log('\n=== V-Card elements found:', await vCards.count());
    
    // 查找所有输入框
    const inputs = page.locator('input[type="text"]');
    console.log('\n=== Text inputs found:', await inputs.count());
    for (let i = 0; i < Math.min(5, await inputs.count()); i++) {
      const input = inputs.nth(i);
      const placeholder = await input.getAttribute('placeholder');
      const dataTestId = await input.getAttribute('data-testid');
      console.log(`Input ${i}: placeholder="${placeholder}", data-testid="${dataTestId}"`);
    }
    
    // 查找所有 textarea
    const textareas = page.locator('textarea');
    console.log('\n=== Textareas found:', await textareas.count());
    
    // 查找表单sections
    const basicInfo = page.locator('text=基础信息');
    console.log('\n=== Basic Info Section visible:', await basicInfo.isVisible());
    
    // 尝试通过不同方式定位输入框
    const titleViaTestId = page.locator('[data-testid="task-plan-title-input"]');
    const titleViaTestIdInput = page.locator('[data-testid="task-plan-title-input"] input');
    console.log('\n=== Title input locators:');
    console.log('  - via data-testid:', await titleViaTestId.count());
    console.log('  - via data-testid input:', await titleViaTestIdInput.count());
    
    // 查找所有 data-testid
    const allTestIds = page.locator('[data-testid]');
    console.log('\n=== All data-testid found:', await allTestIds.count());
    for (let i = 0; i < Math.min(10, await allTestIds.count()); i++) {
      const el = allTestIds.nth(i);
      const testId = await el.getAttribute('data-testid');
      const tagName = await el.evaluate(node => node.tagName);
      console.log(`${i}: <${tagName}> data-testid="${testId}"`);
    }
    
    // 等待足够长时间以查看结果
    await page.waitForTimeout(2000);
  });
});
