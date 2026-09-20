import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../..');
const read = (relative: string) => readFileSync(resolve(appRoot, relative), 'utf8');

describe('MemoFlow product surface polish', () => {
  it('keeps Goal detail on the shared module header and a flat identity surface', () => {
    const goal = read('modules/goal/views/GoalDetailView.vue');
    expect(goal).toContain('<ModuleHeader data-testid="goal-detail-toolbar">');
    expect(goal).toContain('data-testid="goal-detail-identity"');
    expect(goal).toContain('class="space-y-5 border-b border-border/70 pb-5"');
    expect(goal).not.toContain('class="space-y-5 rounded-xl border bg-card p-5"');
  });

  it('presents Task plan properties as rows instead of four card tiles', () => {
    const task = read('modules/task/views/TaskDetailView.vue');
    expect(task).toContain('data-testid="task-detail-property-list"');
    expect(task).toContain('class="divide-y border-y border-border/70"');
    expect(task).not.toContain('@3xl/panel:grid-cols-4');
  });

  it('keeps inbox rows compact without the old high-chroma unread chrome', () => {
    const item = read('modules/notification/components/NotificationItem.vue');
    expect(item).toContain('data-density="compact"');
    expect(item).not.toContain('border-l-4');
    expect(item).not.toContain('ring-4 ring-info/12');
  });

  it('keeps Schedule day and event details on compact row surfaces', () => {
    const day = read('modules/schedule/components/DayDetailSheet.vue');
    const detail = read('modules/schedule/components/EventDetailSheet.vue');
    expect(day).toContain('data-testid="schedule-day-event-list"');
    expect(day).toContain('class="divide-y border-y border-border/70"');
    expect(detail).toContain('data-testid="event-detail-properties"');
  });

  it('uses the shared Linear sidebar item for wide settings navigation', () => {
    const settings = read('modules/setting/views/UserSettingsView.vue');
    expect(settings).toContain('LinearSidebarItem');
    expect(settings).toContain('v-if="isNarrow"');
    expect(settings).toContain('v-else');
  });
});
