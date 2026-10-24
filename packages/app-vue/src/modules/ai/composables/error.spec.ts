import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import enErrors from '../../../locales/en-US/errors';
import zhErrors from '../../../locales/zh-CN/errors';
import zhAI from '../../../locales/zh-CN/aiAssistant';
import enAI from '../../../locales/en-US/aiAssistant';
import {
  getNativeAgentExecutionFailureMessage,
  getAIErrorMessage,
  getAIWorkflowTerminalFailureMessage,
  getGoalWorkflowInterruptionMessage,
} from './error';

describe('AI public failure presentation', () => {
  it('keeps an unconfirmed transport interruption distinct from a stopped run and names the requested model', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { errors: zhErrors, aiAssistant: zhAI } },
    });
    const message = getGoalWorkflowInterruptionMessage(
      {
        confirmation: 'unconfirmed',
        draftPreserved: true,
        requestedModel: { name: 'Gemini 2.5 Flash', provider: 'Google' },
        failure: { code: 'TIMEOUT', message: 'PRIVATE_RESPONSE' },
      },
      i18n.global.t,
    );
    expect(message).toContain('暂时无法确认');
    expect(message).toContain('Gemini 2.5 Flash');
    expect(message).toContain('Google');
    expect(message).toContain('草稿已保留');
    expect(message).not.toContain('已停止');
    expect(message).not.toContain('PRIVATE_RESPONSE');
  });
  it.each(['zh-CN', 'en-US'])('presents safe quota and retry hints in %s', (locale) => {
    const i18n = createI18n({
      legacy: false,
      locale,
      messages: {
        'zh-CN': { errors: zhErrors, aiAssistant: zhAI },
        'en-US': { errors: enErrors, aiAssistant: enAI },
      },
    });
    const message = getAIWorkflowTerminalFailureMessage(
      {
        code: 'RATE_LIMITED',
        message: 'PRIVATE_RESPONSE',
        details: { limitKind: 'quota_exhausted' },
        retryHint: { kind: 'after', afterMs: 30250 },
      },
      i18n.global.t,
    );
    expect(message).toContain('31');
    expect(message).toContain(locale === 'zh-CN' ? '配额不足' : 'insufficient quota');
    expect(message).not.toContain('PRIVATE_RESPONSE');
  });
  it.each([
    ['PROVIDER_AUTH_FAILED', '模型服务拒绝访问，请检查 Provider 的密钥和访问权限。'],
    ['MODEL_NOT_AVAILABLE', '当前模型不可用，请切换模型或检查 Provider 配置。'],
    ['RATE_LIMITED', '请求或配额受限，请稍后再试。'],
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

it.each(['en-US', 'zh-CN'])(
  'uses the same safe native limit summary in Settings and Composer for %s',
  (locale) => {
    const i18n = createI18n({
      legacy: false,
      locale,
      messages: {
        'en-US': { errors: enErrors, aiAssistant: enAI },
        'zh-CN': { errors: zhErrors, aiAssistant: zhAI },
      },
    });
    for (const code of ['LOCAL_AGENT_RATE_LIMITED', 'LOCAL_AGENT_QUOTA_EXHAUSTED'] as const) {
      const text = getNativeAgentExecutionFailureMessage(
        { code, modelId: 'exact-model', occurredAt: 1 },
        i18n.global.t,
      );
      expect(text).toContain('exact-model');
      expect(text).toContain(locale === 'zh-CN' ? '当前 Agent 渠道' : 'This Agent channel');
      expect(text).not.toContain('配置');
      expect(text).not.toContain('login');
    }
  },
);
