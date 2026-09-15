import { describe, expect, it, vi } from 'vitest';
import { useReminderTemplates } from './useReminderTemplates';
import type { ReminderContext } from './useReminderContext';
import { ref } from 'vue';

describe('useReminderTemplates timezone behavior', () => {
  it('omits timezone so the server resolves the identity-scoped Product Time context', async () => {
    const getTodayScheduleMock = vi.fn().mockResolvedValue({
      ok: true,
      data: { data: [], total: 0 },
    });

    const mockCtx = {
      store: {
        setLoading: vi.fn(),
        setError: vi.fn(),
        setTemplates: vi.fn(),
        updateTemplate: vi.fn(),
      },
      service: {
        getTodaySchedule: getTodayScheduleMock,
      },
      savingId: ref(null),
      executeReminderOperation: async (fn: () => Promise<unknown>) => {
        const data = await fn();
        return { ok: true, data };
      },
    } as unknown as ReminderContext;

    const { getTodaySchedule } = useReminderTemplates(mockCtx);

    await getTodaySchedule({ limit: 10 });

    expect(getTodayScheduleMock).toHaveBeenCalledWith({ limit: 10 });
  });

  it('preserves explicit timezone when passed to getTodaySchedule', async () => {
    const getTodayScheduleMock = vi.fn().mockResolvedValue({
      ok: true,
      data: { data: [], total: 0 },
    });

    const mockCtx = {
      store: {
        setLoading: vi.fn(),
        setError: vi.fn(),
        setTemplates: vi.fn(),
        updateTemplate: vi.fn(),
      },
      service: {
        getTodaySchedule: getTodayScheduleMock,
      },
      savingId: ref(null),
      executeReminderOperation: async (fn: () => Promise<unknown>) => {
        const data = await fn();
        return { ok: true, data };
      },
    } as unknown as ReminderContext;

    const { getTodaySchedule } = useReminderTemplates(mockCtx);

    await getTodaySchedule({ limit: 10, timezone: 'Asia/Tokyo' });

    expect(getTodayScheduleMock).toHaveBeenCalledWith({
      limit: 10,
      timezone: 'Asia/Tokyo',
    });
  });
});
