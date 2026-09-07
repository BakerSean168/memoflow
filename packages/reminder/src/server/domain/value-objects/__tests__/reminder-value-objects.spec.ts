import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannel } from '@memoflow/contracts/reminder';
import { ActiveHoursConfig } from '../active-hours-config';
import { ActiveTimeConfig } from '../active-time-config';
import { GroupStats } from '../group-stats';
import { ReminderNotificationConfig } from '../reminder-notification-config';
import { ResponseMetrics } from '../response-metrics';
import { TriggerConfig } from '../trigger-config';

describe('reminder shared value objects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T10:00:00.000Z'));
  });

  it('covers active hours validation, overnight windows, and persistence DTOs', () => {
    const defaultConfig = ActiveHoursConfig.createDefault();
    const overnight = ActiveHoursConfig.create({
      enabled: true,
      startHour: 22,
      endHour: 6,
    });

    expect(defaultConfig.isAllDay).toBe(false);
    expect(defaultConfig.durationHours).toBe(12);
    expect(overnight.isWithinActiveHours(23)).toBe(true);
    expect(overnight.isWithinActiveHours(3)).toBe(true);
    expect(overnight.isWithinActiveHours(12)).toBe(false);
    expect(overnight.durationHours).toBe(8);
    expect(ActiveHoursConfig.createAllDay().isAllDay).toBe(true);
    expect(defaultConfig.disable().isDisabled).toBe(true);
    expect(() => ActiveHoursConfig.create({ enabled: true, startHour: -1, endHour: 10 })).toThrow(
      'startHour must be between 0 and 23',
    );
    expect(() => ActiveHoursConfig.create({ enabled: true, startHour: 1, endHour: 25 })).toThrow(
      'endHour must be between 0 and 24',
    );
  });

  it('covers active time factories, formatting, and mutation helpers', () => {
    const config = ActiveTimeConfig.createAt(new Date('2026-04-25T10:00:00.000Z').getTime());

    expect(config.activatedAtDate.toISOString()).toBe('2026-04-25T10:00:00.000Z');
    expect(config.daysSinceActivation).toBe(2);
    expect(config.setActivatedAt(new Date('2026-04-26T08:00:00.000Z').getTime()).activatedAtDate.toISOString()).toBe(
      '2026-04-26T08:00:00.000Z',
    );
    expect(ActiveTimeConfig.createNow().reactivate().activatedAt).toBe(Date.now());
  });

  it('covers trigger config fixed-time and interval branches', () => {
    const fixedTime = TriggerConfig.createFixedTime('09:30', 'Asia/Shanghai');
    const interval = TriggerConfig.createInterval(120, 600);

    expect(fixedTime.isFixedTime).toBe(true);
    expect(fixedTime.setFixedTime('10:30').fixedTime?.time).toBe('10:30');
    expect(fixedTime.setIntervalMinutes(90)).toBe(fixedTime);
    expect(interval.isInterval).toBe(true);
    expect(interval.setIntervalMinutes(180).interval?.minutes).toBe(180);
    expect(interval.setFixedTime('11:00')).toBe(interval);
  });

  it('covers reminder notification config channel and sound helpers', () => {
    const config = ReminderNotificationConfig.createDefault()
      .addChannel(NotificationChannel.Push)
      .addChannel(NotificationChannel.Push)
      .setTitle('Title')
      .setBody('Body')
      .enableSound('ding')
      .with({
        actions: [{ id: 'done', label: 'Done', action: 'Complete', customAction: null }],
      });

    expect(config.channels).toEqual([NotificationChannel.InApp, NotificationChannel.Push]);
    expect(config.removeChannel(NotificationChannel.InApp).channels).toEqual([NotificationChannel.Push]);
    expect(config.hasChannels).toBe(true);
    expect(config.hasSoundEnabled).toBe(true);
    expect(config.disableSound().hasSoundEnabled).toBe(false);
    expect(config.hasVibrationEnabled).toBe(true);
    expect(config.hasActions).toBe(true);
    expect(config.toDTO().actions).toHaveLength(1);
  });

  it('covers group stats calculations and presentation helpers', () => {
    const stats = GroupStats.createEmpty().recalculate({
      total: 4,
      active: 3,
      paused: 1,
      selfEnabled: 2,
      selfPaused: 2,
    });

    expect(GroupStats.createEmpty().isEmpty).toBe(true);
    expect(stats.hasActiveTemplates).toBe(true);
    expect(stats.allPaused).toBe(false);
    expect(stats.templateCountText).toBe('4 个提醒');
    expect(stats.activeStatusText).toBe('3 个活跃');
    expect(stats.activePercentage).toBe(75);
  });

  it('covers response metrics labels, display text, and formatting', () => {
    const empty = ResponseMetrics.createEmpty();
    const updated = empty.updateMetrics({
      clickRate: 88,
      ignoreRate: 12,
      avgResponseTime: 125,
      snoozeCount: 2,
      effectivenessScore: 72,
      sampleSize: 10,
    });

    expect(updated.hasSamples).toBe(true);
    expect(updated.effectivenessLabel).toBe('high');
    expect(updated.effectivenessColor).toBe('success');
    expect(ResponseMetrics.create({ ...updated.toDTO(), effectivenessScore: 45 }).effectivenessLabel).toBe(
      'medium',
    );
    expect(ResponseMetrics.create({ ...updated.toDTO(), effectivenessScore: 20 }).effectivenessLabel).toBe(
      'low',
    );
  });

});
