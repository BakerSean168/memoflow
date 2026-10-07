import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import enErrors from '../../../locales/en-US/errors';
import zhErrors from '../../../locales/zh-CN/errors';
import { getAIWorkflowTerminalFailureMessage } from './error';

describe('unsupported workflow state presentation', () => {
  it.each([
    ['en-US', 'This workflow state is no longer supported. Start a new workflow.'],
    ['zh-CN', '此工作流状态已不受支持，请重新创建工作流。'],
  ])('uses the %s public translation without internal diagnostics', (locale, expected) => {
    const i18n = createI18n({
      legacy: false,
      locale,
      messages: {
        'en-US': { errors: enErrors },
        'zh-CN': { errors: zhErrors },
      },
    });
    expect(
      getAIWorkflowTerminalFailureMessage(
        { code: 'AI_WORKFLOW_STATUS_UNSUPPORTED', message: 'secret runtime diagnostics' },
        (key) => i18n.global.t(key),
      ),
    ).toBe(expected);
  });
});
