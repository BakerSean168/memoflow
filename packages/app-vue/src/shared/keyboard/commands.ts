import type { KeyboardCommandId } from '@memoflow/contracts/shared';
export type { KeyboardCommandId } from '@memoflow/contracts/shared';

export type ShortcutScope = 'app' | 'workspace' | 'preview' | 'list';
export interface KeyboardHost {
  platform: 'mac' | 'windows' | 'linux';
  desktop: boolean;
}
export interface KeyboardCommand {
  id: KeyboardCommandId;
  title: string;
  scope: ShortcutScope;
  keys: readonly string[];
  repeat?: boolean;
  editable?: boolean;
}
export const keyboardModules = [
  { id: 'goal', digit: '1', title: '目标', route: '/goals' },
  { id: 'task', digit: '2', title: '任务', route: '/tasks' },
  { id: 'routine', digit: '3', title: '例程', route: '/routines' },
  { id: 'note', digit: '4', title: '笔记', route: '/repository' },
  { id: 'schedule', digit: '9', title: '日程', route: '/schedule' },
  { id: 'notification', digit: '0', title: '通知', route: '/notifications' },
] as const;

export function commandDefinitions(host: KeyboardHost): KeyboardCommand[] {
  return [
    ...keyboardModules.flatMap((module): KeyboardCommand[] => [
      {
        id: `module.${module.id}.preview`,
        title: `预览${module.title}`,
        scope: 'workspace',
        keys: [module.digit],
      },
      {
        id: `module.${module.id}.activate`,
        title: `进入${module.title}`,
        scope: 'workspace',
        keys: [`Alt+${module.digit}`],
      },
    ]),
    { id: 'app.palette', title: '命令面板', scope: 'app', keys: ['Mod+K'], editable: true },
    { id: 'app.help', title: '快捷键帮助', scope: 'app', keys: ['?'] },
    { id: 'app.shortcuts', title: '快捷键设置', scope: 'app', keys: [] },
    {
      id: 'layout.sidebar',
      title: '显示 / 隐藏左侧栏',
      scope: 'app',
      keys: ['Mod+B'],
      editable: true,
    },
    {
      id: 'layout.panel',
      title: '显示 / 隐藏业务面板',
      scope: 'app',
      keys: ['Mod+Backslash'],
      editable: true,
    },
    {
      id: 'conversation.new',
      title: '创建新 AI 对话',
      scope: 'workspace',
      keys: host.desktop ? ['N', 'Mod+Shift+O'] : ['N'],
      editable: true,
    },
    { id: 'conversation.search', title: '搜索会话', scope: 'workspace', keys: ['/'] },
    { id: 'tab.next', title: '下一个业务 Tab', scope: 'workspace', keys: ['Alt+J'] },
    { id: 'tab.previous', title: '上一个业务 Tab', scope: 'workspace', keys: ['Alt+K'] },
    ...(['preview', 'list'] as const).flatMap((scope): KeyboardCommand[] => [
      { id: `${scope}.next`, title: '下一项', scope, keys: ['J', 'ArrowDown'], repeat: true },
      { id: `${scope}.previous`, title: '上一项', scope, keys: ['K', 'ArrowUp'], repeat: true },
      { id: `${scope}.open`, title: '打开当前项', scope, keys: ['Enter'] },
    ]),
    { id: 'preview.close', title: '关闭预览', scope: 'preview', keys: ['Escape'] },
    { id: 'list.toggle', title: '选择 / 取消选择', scope: 'list', keys: ['X'] },
    {
      id: 'list.extendNext',
      title: '向下扩展选择',
      scope: 'list',
      keys: ['Shift+J'],
      repeat: true,
    },
    {
      id: 'list.extendPrevious',
      title: '向上扩展选择',
      scope: 'list',
      keys: ['Shift+K'],
      repeat: true,
    },
    { id: 'list.clear', title: '清除列表选择', scope: 'list', keys: ['Escape'] },
    { id: 'list.expand', title: '展开目录 / 下一层', scope: 'list', keys: ['ArrowRight'] },
    { id: 'list.collapse', title: '收起目录 / 上一层', scope: 'list', keys: ['ArrowLeft'] },
  ];
}
