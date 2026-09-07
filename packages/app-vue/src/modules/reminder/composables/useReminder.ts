/**
 * useReminder - 提醒模块主 composable
 *
 * 薄编排层，组合 useReminderTemplates / useReminderGroups / useReminderPreferences。
 * 所有具体逻辑由子 composable 承载。
 */

import { computed } from 'vue';
import { createReminderContext } from './useReminderContext';
import { useReminderTemplates } from './useReminderTemplates';
import { useReminderGroups } from './useReminderGroups';
import { useReminderPreferences } from './useReminderPreferences';

export function useReminder() {
  const ctx = createReminderContext();
  const templateOps = useReminderTemplates(ctx);
  const groupOps = useReminderGroups(ctx);
  const preferenceOps = useReminderPreferences(ctx);

  async function reloadReminderScene() {
    await Promise.all([
      templateOps.fetchTemplates(),
      groupOps.fetchGroups(),
      preferenceOps.fetchPreferences(),
    ]);
  }

  // Wrap mutations to trigger scene reload after success
  async function createTemplate(...args: Parameters<typeof templateOps.createTemplate>) {
    const result = await templateOps.createTemplate(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function updateTemplate(...args: Parameters<typeof templateOps.updateTemplate>) {
    const result = await templateOps.updateTemplate(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function deleteTemplate(...args: Parameters<typeof templateOps.deleteTemplate>) {
    const result = await templateOps.deleteTemplate(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function toggleTemplate(...args: Parameters<typeof templateOps.toggleTemplate>) {
    const result = await templateOps.toggleTemplate(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function moveTemplateToGroup(...args: Parameters<typeof templateOps.moveTemplateToGroup>) {
    const result = await templateOps.moveTemplateToGroup(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function createGroup(...args: Parameters<typeof groupOps.createGroup>) {
    const result = await groupOps.createGroup(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function updateGroup(...args: Parameters<typeof groupOps.updateGroup>) {
    const result = await groupOps.updateGroup(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function deleteGroup(...args: Parameters<typeof groupOps.deleteGroup>) {
    const result = await groupOps.deleteGroup(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function toggleGroup(...args: Parameters<typeof groupOps.toggleGroup>) {
    const result = await groupOps.toggleGroup(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  async function updatePreferences(...args: Parameters<typeof preferenceOps.updatePreferences>) {
    const result = await preferenceOps.updatePreferences(...args);
    if (result) await reloadReminderScene();
    return result;
  }

  return {
    // State
    templates: computed(() => ctx.store.templates),
    groups: computed(() => ctx.store.groups),
    preferences: computed(() => ctx.store.preferences),
    isLoading: computed(() => ctx.store.isLoading),
    isSaving: templateOps.isSaving,
    error: computed(() => ctx.store.error),
    // Template operations (wrapped with reload)
    fetchTemplates: templateOps.fetchTemplates,
    getTodaySchedule: templateOps.getTodaySchedule,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    toggleTemplate,
    moveTemplateToGroup,
    // Group operations (wrapped with reload)
    fetchGroups: groupOps.fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    toggleGroup,
    // Preferences (wrapped with reload)
    fetchPreferences: preferenceOps.fetchPreferences,
    updatePreferences,
    // Scene reload
    reloadReminderScene,
  };
}
