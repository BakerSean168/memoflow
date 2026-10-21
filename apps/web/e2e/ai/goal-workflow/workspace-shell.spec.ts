import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../../config';
import { bootstrapGoalWorkflowSession, sendComposerMessage } from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
  test('[P0] loads the AI Agent Workspace from the root route', async ({ page }) => {
    await bootstrapGoalWorkflowSession(page);

    await expect(page.getByTestId('ai-chat-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('ai-chat-composer')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page).toHaveURL(/\/$/);
  });

  test('[P0] keeps the AI Agent Workspace usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapGoalWorkflowSession(page, { expectAiVisible: false });

    const shell = page.getByTestId('app-shell');
    const panelToggle = page.getByTestId('shell-right-panel-toggle');
    await expect(shell).toHaveAttribute('data-shell-state', 'focus');
    await expect(page.getByTestId('business-panel')).toBeVisible();
    await expect(page.getByTestId('ai-chat-view')).toBeHidden();

    await panelToggle.click();
    await expect(shell).toHaveAttribute('data-shell-state', 'chat');
    await expect(page.getByTestId('business-panel')).toBeHidden();

    await expect(page.getByTestId('ai-chat-view')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });
    await expect(page.getByTestId('ai-chat-composer')).toBeVisible({
      timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
    });

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > window.innerWidth + 1 ||
        document.body.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await sendComposerMessage(
      page,
      'Ask my knowledge base how knowledge answers stay grounded in citations.',
    );

    // #569 retired the context sheet: grounded knowledge answers are now
    // directly readable inline with the mobile conversation.
    const answer = page.getByTestId('knowledge-answer-panel');
    await expect(answer).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(answer).toContainText('MemoFlow grounding policy');
    await expect(page.getByTestId('ai-context-panel')).toHaveCount(0);
    // Workspace navigation must not erase the conversation or its citations.
    await panelToggle.click();
    await expect(shell).toHaveAttribute('data-shell-state', 'focus');
    await panelToggle.click();
    await expect(shell).toHaveAttribute('data-shell-state', 'chat');
    await expect(answer).toBeVisible();
  });
});
