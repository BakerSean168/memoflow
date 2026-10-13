import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import enErrors from '../../../locales/en-US/errors';
import zhErrors from '../../../locales/zh-CN/errors';
import { getAIErrorMessage, getAIWorkflowTerminalFailureMessage } from './error';

describe('AI public failure presentation', () => {
  it.each([
    ['PROVIDER_AUTH_FAILED', '模型服务拒绝访问，请检查 Provider 的密钥和访问权限。'],
    ['MODEL_NOT_AVAILABLE', '当前模型不可用，请切换模型或检查 Provider 配置。'],
    ['RATE_LIMITED', '请求过于频繁，请稍后再试'],
    ['TIMEOUT', '请求超时，请稍后再试'],
    ['SERVICE_UNAVAILABLE', '服务暂不可用，请稍后再试'],
  ])('presents %s without raw upstream text', (code, expected) => {
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { errors: zhErrors } },
    });
    expect(
      getAIErrorMessage(
        { code, message: 'private upstream response' },
        (key) => i18n.global.t(key),
        'fallback',
      ),
    ).toBe(expected);
  });
});

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
