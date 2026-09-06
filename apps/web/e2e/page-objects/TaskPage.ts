import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Task List and Task Detail pages
 * Provides methods for interacting with task plans and occurrences
 */
export class TaskPage {
  readonly page: Page;

  // Locators
  readonly createTaskButton: Locator;
  readonly taskList: Locator;
  readonly taskSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators - prefer data-testid for stability
    this.createTaskButton = page
      .getByTestId('create-task-button')
      .or(page.getByRole('button', { name: /创建任务|Create Task|新建/i }));
    this.taskList = page.getByTestId('task-list').or(page.locator('.task-list'));
    this.taskSearchInput = page.getByPlaceholder(/搜索任务|Search tasks/i);
  }

  // Navigation
  async goto() {
    // V2 shell: task library lives at /tasks inside the business panel
    await this.page.goto('/tasks');
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.getByTestId('business-panel').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      console.log('[TaskPage] business-panel not found; auth or shell may not be ready');
    });

    // Prefer the stable create button testid used by TaskManagementView
    const createBtn = this.page
      .getByTestId('create-task-template-button')
      .or(this.createTaskButton);
    await createBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      console.log('[TaskPage] Create button not found, page might need authentication or different route');
    });
  }

  // Task Card Locators
  taskCard(taskIdentifier: string | number): Locator {
    // Can search by UUID, title, or index
    if (typeof taskIdentifier === 'number') {
      return this.page.getByTestId('task-plan-card').nth(taskIdentifier);
    }

    // Try UUID first
    const byId = this.page.locator(`[data-task-id="${taskIdentifier}"]`);
    if (byId) return byId;

    // Then try title
    return this.page.locator(`[data-testid="task-plan-card"]:has-text("${taskIdentifier}")`);
  }

  taskCardById(id: string): Locator {
    return this.page.locator(`[data-task-id="${id}"]`);
  }

  taskCardByTitle(title: string): Locator {
    return this.page.locator(`[data-testid="task-plan-card"]:has-text("${title}")`);
  }

  // Actions
  async createTask(taskData: {
    title: string;
    description?: string;
    duration?: number;
    status?: string;
  }) {
    console.log(`[TaskPage] Creating task: ${taskData.title}`);

    // Wait for button to be visible and enabled
    await this.createTaskButton.waitFor({ state: 'visible', timeout: 15000 });
    await this.page.waitForTimeout(500);
    
    await this.createTaskButton.click();

    // Wait for dialog
    await this.page.waitForSelector('[role="dialog"], .v-dialog', { timeout: 5000 });

    // Fill title
    await this.page.fill(
      'input[name="title"], input[placeholder*="标题"], input[label*="标题"]',
      taskData.title,
    );

    // Fill description if provided
    if (taskData.description) {
      await this.page.fill(
        'textarea[name="description"], textarea[placeholder*="描述"]',
        taskData.description,
      );
    }

    // Fill duration if provided
    if (taskData.duration !== undefined) {
      await this.page.fill(
        'input[name="duration"], input[type="number"]',
        taskData.duration.toString(),
      );
    }

    // Submit
    await this.page.click(
      'button[type="submit"], button:has-text("确定"), button:has-text("保存")',
    );

    // Wait for task to appear
    await this.page.waitForTimeout(1000);

    console.log('[TaskPage] Task created successfully');
  }

  async searchTasks(query: string) {
    await this.taskSearchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
  }

  // Assertions
  async expectTaskVisible(taskIdentifier: string | number) {
    const card = this.taskCard(taskIdentifier);
    await expect(card).toBeVisible();
  }

  async expectTaskNotVisible(taskIdentifier: string | number) {
    const card = this.taskCard(taskIdentifier);
    await expect(card).not.toBeVisible();
  }

  async expectTaskCount(count: number) {
    const cards = this.page.getByTestId('task-plan-card');
    await expect(cards).toHaveCount(count);
  }

  async expectTaskStatus(taskIdentifier: string | number, status: string) {
    const card = this.taskCard(taskIdentifier);
    const statusChip = card.locator(
      `[data-status="${status}"], .status-chip:has-text("${status}")`,
    );
    await expect(statusChip).toBeVisible();
  }

  // State Checks
  async getTaskStatus(taskIdentifier: string | number): Promise<string> {
    const card = this.taskCard(taskIdentifier);
    const statusElement = card.locator('[data-status]').first();
    const status = await statusElement.getAttribute('data-status');
    return status || 'unknown';
  }

  async getTaskCount(): Promise<number> {
    const cards = this.page.getByTestId('task-plan-card');
    return await cards.count();
  }
}
