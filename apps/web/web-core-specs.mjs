// Ordinary owner-scoped changes run this floor. Unknown/shared/root changes
// still run the complete canonical set; nightly audits collect it independently.
export const WEB_CORE_SPECS = Object.freeze([
  'authentication/auth-login.spec.ts',
  'goal/goal-crud.spec.ts',
  'task/task-completion-loop.spec.ts',
  'schedule/planner-task-revert.spec.ts',
  'notification/notification-inbox-loop.spec.ts',
  'note/note-workspace.spec.ts',
  'routine/routine-configuration.spec.ts',
  'user-settings/data-portability.spec.ts',
  'ai/goal-workflow/goal-agent-approval.spec.ts',
  'ai/goal-workflow/knowledge.spec.ts',
]);

export const WEB_OWNER_EXTENSIONS = Object.freeze({
  account: ['authentication/'],
  'cloud-auth': ['authentication/'],
  ai: ['ai/'],
  task: ['task/'],
  goal: ['goal/'],
  schedule: ['schedule/'],
  scheduler: ['schedule/', 'notification/'],
  reminder: ['schedule/', 'notification/'],
  notification: ['notification/'],
  routine: ['routine/'],
  repository: ['note/'],
  setting: ['user-settings/'],
  'data-portability': ['user-settings/data-portability.spec.ts'],
});
