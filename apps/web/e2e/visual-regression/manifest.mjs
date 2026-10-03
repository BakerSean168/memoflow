export const requiredSurfaces = [
  'collection.goal',
  'collection.task',
  'collection.routine',
  'collection.notification',
  'entity.goal',
  'entity.task-plan',
  'specialized.schedule-day',
  'specialized.schedule-week',
  'specialized.schedule-month',
  'specialized.knowledge-wide',
  'specialized.knowledge-narrow',
  'specialized.settings',
  'specialized.ai-native',
  'overlay.goal-record',
  'overlay.goal-kr',
  'overlay.goal-review',
  'overlay.task-inspect',
  'overlay.task-measurement',
  'overlay.schedule-day',
  'overlay.schedule-event',
  'overlay.routine-editor',
  'shell.split',
  'shell.narrow',
  'shell.focus',
  'shell.capsules',
];
const cases = [
  ['collection.goal', 'goal', 'surface=collection', 'goal-list', 'light', 'en-US', 'wide'],
  ['collection.task', 'task', 'surface=collection', 'task-page-toolbar', 'dark', 'zh-CN', 'narrow'],
  [
    'collection.routine',
    'pages',
    'surface=routine',
    'routine-card-routine-1',
    'light',
    'en-US',
    'wide',
  ],
  [
    'collection.notification',
    'pages',
    'surface=notification',
    'notification-list',
    'dark',
    'zh-CN',
    'narrow',
  ],
  ['entity.goal', 'goal', '', 'goal-detail-view', 'dark', 'zh-CN', 'narrow'],
  ['entity.task-plan', 'task', '', 'task-detail-metadata', 'light', 'en-US', 'wide'],
  [
    'specialized.schedule-day',
    'schedule',
    'view=day',
    'schedule-presentation-acceptance',
    'light',
    'en-US',
    'wide',
  ],
  [
    'specialized.schedule-week',
    'schedule',
    'view=week',
    'schedule-presentation-acceptance',
    'dark',
    'zh-CN',
    'wide',
  ],
  [
    'specialized.schedule-month',
    'schedule',
    'view=month',
    'schedule-presentation-acceptance',
    'light',
    'en-US',
    'narrow',
  ],
  [
    'specialized.knowledge-wide',
    'pages',
    'surface=knowledge',
    'knowledge-projection-preview',
    'light',
    'en-US',
    'wide',
  ],
  [
    'specialized.knowledge-narrow',
    'pages',
    'surface=knowledge',
    'knowledge-projection-preview',
    'dark',
    'zh-CN',
    'narrow',
  ],
  [
    'specialized.settings',
    'pages',
    'surface=settings',
    'appearance-settings-card',
    'light',
    'en-US',
    'wide',
  ],
  ['specialized.ai-native', 'pages', 'surface=ai', 'task-plan-dialog', 'light', 'en-US', 'wide'],
  ['overlay.goal-record', 'goal', '', 'goal-detail-view', 'light', 'en-US', 'narrow'],
  ['overlay.goal-kr', 'goal', '', 'goal-detail-view', 'dark', 'zh-CN', 'wide'],
  [
    'overlay.goal-review',
    'goal',
    'state=review',
    'goal-review-create-dialog',
    'light',
    'en-US',
    'wide',
  ],
  [
    'overlay.task-inspect',
    'task',
    'surface=collection',
    'task-occurrence-body',
    'light',
    'en-US',
    'wide',
  ],
  [
    'overlay.task-measurement',
    'schedule',
    'surface=task-quick&prompt=1',
    'schedule-event-task-task-occurrence-1',
    'dark',
    'zh-CN',
    'narrow',
  ],
  [
    'overlay.schedule-day',
    'schedule',
    'surface=day-detail',
    'planner-day-dialog',
    'dark',
    'zh-CN',
    'wide',
  ],
  [
    'overlay.schedule-event',
    'schedule',
    'surface=event-detail&source=schedule',
    'planner-event-sheet',
    'light',
    'en-US',
    'narrow',
  ],
  [
    'overlay.routine-editor',
    'pages',
    'surface=routine',
    'routine-card-routine-1',
    'dark',
    'zh-CN',
    'narrow',
  ],
  ['shell.split', 'pages', 'surface=shell-split', 'app-shell', 'light', 'en-US', 'wide'],
  ['shell.narrow', 'pages', 'surface=shell-narrow', 'app-shell', 'dark', 'zh-CN', 'wide'],
  ['shell.focus', 'pages', 'surface=shell-focus', 'app-shell', 'light', 'en-US', 'wide'],
  ['shell.capsules', 'pages', 'surface=shell-split', 'app-shell', 'dark', 'zh-CN', 'wide'],
  ['foundation.goal-create', 'goal', 'state=create', 'goal-dialog', 'light', 'en-US', 'narrow'],
  ['foundation.task-create', 'task', 'state=create', 'task-plan-dialog', 'dark', 'zh-CN', 'wide'],
];
export const matrix = cases.map(([surface, owner, query, ready, theme, locale, width]) => ({
  id: `${surface}.${theme}.${locale === 'en-US' ? 'en' : 'zh'}.${width}`,
  surface,
  owner,
  query,
  ready,
  theme,
  locale,
  width,
}));
export const desktopRunner = {
  target: 'web:e2e:desktop-screenshots',
  config: 'apps/web/playwright.desktop-screenshot.config.ts',
  acceptance: false,
  reason:
    'Electron/backend host capture; debug/thesis artifacts are separate from deterministic Web acceptance.',
};
export function validateMatrix(entries) {
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate case: ${entry.id}`);
    ids.add(entry.id);
    if (
      !entry.ready ||
      !entry.owner ||
      !['light', 'dark'].includes(entry.theme) ||
      !['en-US', 'zh-CN'].includes(entry.locale) ||
      !['wide', 'narrow'].includes(entry.width)
    )
      throw new Error(`Invalid fixture: ${entry.id}`);
  }
  for (const surface of requiredSurfaces) {
    if (entries.filter((entry) => entry.surface === surface).length !== 1)
      throw new Error(`Required canonical surface missing or duplicated: ${surface}`);
  }
}
