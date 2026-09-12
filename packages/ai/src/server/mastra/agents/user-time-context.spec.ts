import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { userTimeContextInstruction } from './user-time-context';

describe('AI canonical UserTimeContext instruction', () => {
  it('exposes the identity timezone and never falls back to server-local/UTC semantics', () => {
    const context = new RequestContext();
    context.setRaw('timeContext', { timeZone: 'Asia/Tokyo', weekStartsOn: 1 });

    const instruction = userTimeContextInstruction(context, 'en-US');

    expect(instruction).toContain('IANA timezone=Asia/Tokyo');
    expect(instruction).toContain('weekStartsOn=1');
    expect(instruction).toContain('never substitute server-local time or UTC');
  });

  it('fails closed when the host forgot to inject canonical UserTimeContext', () => {
    expect(() => userTimeContextInstruction(new RequestContext(), 'zh-CN')).toThrow(
      'AI model request requires canonical user TimeContext',
    );
  });
});
