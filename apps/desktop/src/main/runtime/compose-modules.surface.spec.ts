import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Desktop runtime composer surface (Batch Step D).
 * desktop runtime composer 表面契约（Batch Step D）。
 *
 * Locks the Step D wiring: apps/desktop/src/main/main.ts must compose all
 * remaining business modules (account / ai / data-portability / notification /
 * reminder / repository / schedule / setting) through the runtime composers and
 * must no longer reference the retired electron transport factories or electron
 * repository accessors. Each composer must only touch the narrow seams the plan
 * allows — package root + package electron seam, never `/server` — and must
 * never pass `ctx.db` to a module factory.
 *
 * 锁定 Step D 接线：apps/desktop/src/main/main.ts 必须通过 runtime composer 组装
 * 全部剩余业务模块（account / ai / data-portability / notification / reminder /
 * repository / schedule / setting），且不再引用已退役的 electron transport 工厂或
 * electron 仓储 accessor。每个 composer 只允许接触计划允许的窄 seam——包根 + 包
 * electron seam，绝不使用 `/server`——且绝不把 `ctx.db` 传给模块工厂。
 */
describe('desktop runtime composer surface (Batch Step D)', () => {
  const mainDir = resolve(__dirname, '..');
  const main = readFileSync(resolve(mainDir, 'main.ts'), 'utf8');
  const composerDir = resolve(__dirname);

  const composers = [
    { file: 'compose-account.ts', pkg: '@memoflow/account' },
    { file: 'compose-ai.ts', pkg: '@memoflow/ai' },
    { file: 'compose-data-portability.ts', pkg: '@memoflow/data-portability' },
    { file: 'compose-notification.ts', pkg: '@memoflow/notification' },
    { file: 'compose-reminder.ts', pkg: '@memoflow/reminder' },
    { file: 'compose-repository.ts', pkg: '@memoflow/repository' },
    { file: 'compose-schedule.ts', pkg: '@memoflow/schedule' },
    { file: 'compose-setting.ts', pkg: '@memoflow/setting' },
  ] as const;

  it('main.ts imports all eight composers from ./runtime/', () => {
    for (const { file } of composers) {
      expect(main).toContain(`from './runtime/${file.replace(/\.ts$/, '')}'`);
    }
  });

  it('main.ts no longer references retired electron transport factories or module consts', () => {
    expect(main).not.toMatch(/\bcreateScheduleElectronModule\b/);
    expect(main).not.toMatch(/\bcreateAccountElectronModule\b/);
    expect(main).not.toMatch(/\bcreateAIElectronModule\b/);
    expect(main).not.toMatch(/\bcreateRepositoryElectronModule\b/);
    expect(main).not.toMatch(/\bReminderElectronModule\b/);
    expect(main).not.toMatch(/\bNotificationElectronModule\b/);
    expect(main).not.toMatch(/\bSettingElectronModule\b/);
    expect(main).not.toMatch(/\bDataPortabilityElectronModule\b/);
    expect(main).not.toMatch(/\bcreateNotificationPowerSyncScheduleNotificationPort\b/);
    expect(main).not.toMatch(/\bPowerSyncScheduleTaskRepository\b/);
  });

  it('main.ts no longer imports electron repository accessors', () => {
    expect(main).not.toMatch(/\bgetScheduleRepository\b/);
    expect(main).not.toMatch(/\bgetScheduleTaskRepository\b/);
    expect(main).not.toMatch(/\bgetReminderTemplateRepository\b/);
    expect(main).not.toMatch(/\bgetNotificationRepository\b/);
    expect(main).not.toMatch(/\bstartScheduleRuntime\b/);
    expect(main).not.toMatch(/\bstopScheduleRuntime\b/);
  });

  it('main.ts registers the composed modules in the plan order', () => {
    const registerBody = main.slice(main.indexOf('.register(accountComposed.module)'));
    const order = [
      '.register(accountComposed.module)',
      '.register(settingElectronModule)',
      '.register(notificationComposed.module)',
      '.register(dataPortabilityElectronModule)',
      '.register(goalComposed.module)',
      '.register(taskElectronModule)',
      '.register(scheduleComposed.calendarModule)',
      '.register(scheduleComposed.schedulerModule)',
      '.register(reminderComposed.module)',
      '.register(interventionWindowElectronModule)',
      '.register(focusWindowElectronModule)',
      '.register(AIElectronModule)',
      '.register(governanceElectronModule)',
      '.register(repositoryElectronModule)',
    ];
    let cursor = 0;
    for (const entry of order) {
      const index = registerBody.indexOf(entry, cursor);
      expect(index, `expected ${entry} in order`).toBeGreaterThanOrEqual(0);
      cursor = index + entry.length;
    }
  });

  for (const { file, pkg } of composers) {
    const name = file.replace(/\.ts$/, '').replace('compose-', '');
    const source = readFileSync(resolve(composerDir, file), 'utf8');

    it(`${name} composer only touches package root + electron seam (no /server)`, () => {
      expect(source).toMatch(/interface Compose\w*Dependencies/);
      if (name === 'repository') {
        // Repository desktop composer is a host-port composer: it imports only
        // the electron seam's port types, never the package root.
        expect(source).toContain(`from '${pkg}/electron'`);
        expect(source).not.toContain(`from '${pkg}'`);
      } else {
        expect(source).toContain(`from '${pkg}'`);
      }
      expect(source).not.toMatch(
        new RegExp(`@memoflow\\/${pkg.replace('@memoflow/', '')}\\/server`),
      );
      expect(source).not.toMatch(/@memoflow\/[a-z-]+\/server\/infrastructure/);
    });

    it(`${name} composer never passes ctx.db / context.db to a module factory`, () => {
      expect(source).not.toMatch(/ctx\.db/);
      expect(source).not.toMatch(/context\.db/);
      expect(source).not.toMatch(/create\w*PowerSyncModule\(/);
    });

    it(`${name} composer imports no electron repository accessor`, () => {
      expect(source).not.toMatch(
        /\bget(Notification|Reminder|Schedule|ScheduleTask)\w*Repository\b/,
      );
      expect(source).not.toMatch(/\bstartScheduleRuntime\b/);
      expect(source).not.toMatch(/\bstopScheduleRuntime\b/);
    });
  }

  it('repository composer carries the five host ports and no PowerSync DB assembly', () => {
    const repository = readFileSync(resolve(composerDir, 'compose-repository.ts'), 'utf8');
    for (const port of [
      'localVaultPort',
      'knowledgeRepositoryConnectionPort',
      'knowledgeRepositoryReconciliationPort',
      'knowledgeRepositorySyncPort',
      'knowledgeRepositoryAutoSyncScheduler',
    ]) {
      expect(repository).toContain(port);
    }
    expect(repository).not.toMatch(/create\w*PowerSyncModule\(/);
    expect(repository).not.toMatch(/createRepositoryModule\(/);
  });

  it('schedule composer returns sibling Calendar/Scheduler handles and one bound runtime controller', () => {
    const schedule = readFileSync(resolve(composerDir, 'compose-schedule.ts'), 'utf8');
    expect(schedule).toMatch(/interface ScheduleRuntimeController/);
    expect(schedule).toContain('runtimeController');
    expect(schedule).toContain('calendarModule');
    expect(schedule).toContain('schedulerModule');
    expect(schedule).toContain("from '@memoflow/scheduler'");
    expect(schedule).toContain('createSchedulerRuntimeContribution');
    expect(schedule).toContain('schedulerRepositories.scheduleTaskRepository');
  });

  it('reminder composer owns one per-profile InterventionRuntime and main wires both Routine windows through bootstrapper', () => {
    const reminder = readFileSync(resolve(composerDir, 'compose-reminder.ts'), 'utf8');
    expect(reminder).toContain('createInterventionRuntime');
    expect(reminder).toContain('readonly interventionRuntime: InterventionRuntime');
    expect(reminder).toContain('const interventionRuntime = createInterventionRuntime()');
    expect(reminder).toContain('readonly activityRuntime: RoutineActivitySensorRuntime');
    expect(reminder).toContain('readonly activeUsageRuntime: ActiveUsageRuntime');
    expect(main).toContain('runtime: reminderComposed.interventionRuntime');
    expect(main).toContain('await reminderComposed.refreshLocalRoutineRegistrations()');
    expect(main.indexOf('await reminderComposed.refreshLocalRoutineRegistrations()')).toBeLessThan(
      main.indexOf('reminderComposed.activityRuntime.start()'),
    );
    expect(main).toContain('reminderComposed.activityRuntime.start()');
    expect(main).toContain('reminderComposed.activeUsageRuntime.start()');
    expect(reminder).toContain('loadPowerSyncRoutineLocalRegistrations');
    expect(reminder).not.toContain('onOccurrenceDue: () => {}');
    expect(main).toContain('.register(interventionWindowElectronModule)');
    expect(main).toContain('.register(focusWindowElectronModule)');
  });

  it('notification composer exposes the durable NotificationRequested writer from the SAME repository set', () => {
    const notification = readFileSync(resolve(composerDir, 'compose-notification.ts'), 'utf8');
    expect(notification).toContain('requestedWriter: NotificationRequestedWriterPort');
    expect(notification).toContain('requestedWriter: repositories.requestedWriter');
  });

  it('dashboard-read-service no longer reads electron accessors', () => {
    const dashboard = readFileSync(resolve(mainDir, 'services/dashboard-read-service.ts'), 'utf8');
    expect(dashboard).not.toMatch(/get(Schedule|ReminderTemplate|Notification)Repository/);
    expect(dashboard).toContain('scheduleRepository');
    expect(dashboard).toContain('reminderTemplateRepository');
    expect(dashboard).toContain('notificationRepository');
  });

  it('window-manager and profile runtime drive the bound schedule runtime controller', () => {
    const windowManager = readFileSync(resolve(mainDir, 'lifecycle/window-manager.ts'), 'utf8');
    const profileManager = readFileSync(
      resolve(mainDir, 'profile/desktop-profile-runtime-manager.ts'),
      'utf8',
    );
    expect(windowManager).toContain('setScheduleRuntimeController');
    expect(windowManager).toContain('this.scheduleRuntimeController?.start()');
    expect(windowManager).toContain('this.scheduleRuntimeController?.stop()');
    expect(windowManager).not.toMatch(/\bstartScheduleRuntime\b/);
    expect(windowManager).not.toMatch(/\bstopScheduleRuntime\b/);
    expect(profileManager).toContain('setScheduleRuntimeController');
    expect(profileManager).toContain('scheduleController?.stop()');
    expect(profileManager).not.toMatch(/\bstopScheduleRuntime\b/);
    expect(profileManager).not.toMatch(/\bPowerSyncAccountRepository\b/);
  });
});
