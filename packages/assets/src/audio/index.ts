/**
 * 音频资源导出
 *
 * 资源清单保留稳定相对路径，渲染进程导出使用静态 import，
 * 这样 Vite 生产构建会发射音频文件而不是保留运行时 URL 计算。
 */

import alertSoundUrl from './notifications/alert.wav';
import defaultSoundUrl from './notifications/default.wav';
import errorSoundUrl from './notifications/error.wav';
import reminderSoundUrl from './notifications/reminder.wav';
import successSoundUrl from './notifications/success.wav';

export const audioAssetPaths = {
  alertSound: './notifications/alert.wav',
  defaultSound: './notifications/default.wav',
  errorSound: './notifications/error.wav',
  reminderSound: './notifications/reminder.wav',
  successSound: './notifications/success.wav',
} as const;

export type AudioAssetKey = keyof typeof audioAssetPaths;

// 通知音效
export const alertSound = alertSoundUrl;
export const defaultSound = defaultSoundUrl;
export const errorSound = errorSoundUrl;
export const reminderSound = reminderSoundUrl;
export const successSound = successSoundUrl;

// 导出所有音效作为对象（可选）
export const sounds = {
  alert: alertSound,
  default: defaultSound,
  error: errorSound,
  reminder: reminderSound,
  success: successSound,
} as const;

// 导出类型
export type SoundType = keyof typeof sounds;
