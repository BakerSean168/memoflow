/**
 * Legacy Reminder template business facade.
 *
 * ROUTINE-2301 keeps this service callable by existing application code but
 * delegates effective-state truth to the canonical Routine AND-gate.
 */
import { ReminderStatus } from '@memoflow/contracts/reminder';
import type { ReminderGroup } from '../aggregates/reminder-group';
import type { ReminderTemplate } from '../aggregates/reminder-template';
import { evaluateRoutineEffectiveEnabled } from '../routine';

export interface TemplateEffectiveStatus {
  isEffectivelyEnabled: boolean;
  reason: string;
  templateStatus: ReminderStatus;
  groupStatus: ReminderStatus | null;
}

export interface GroupAssignmentValidation {
  valid: boolean;
  reason?: string;
}

export class ReminderTemplateBusinessService {
  public calculateEffectiveEnabled(
    template: ReminderTemplate,
    group: ReminderGroup | null,
    globalReminderEnabled: boolean = true,
  ): TemplateEffectiveStatus {
    const templateStatus = template.status;
    const evaluation = evaluateRoutineEffectiveEnabled({
      // The legacy account-wide master switch is migration-only and is folded
      // into the Routine gate instead of becoming another algorithm.
      routineEnabled:
        globalReminderEnabled &&
        template.selfEnabled &&
        templateStatus === ReminderStatus.Active,
      profileEnabled: group?.enabled,
      profileActive: group ? group.status === ReminderStatus.Active : undefined,
      membershipEnabled: true,
      temporaryOverrideAllowsExecution: true,
    });

    let reason: string;
    if (!globalReminderEnabled) {
      reason = '全局提醒总开关已关闭（legacy seam -> Routine gate）';
    } else if (!group) {
      reason = evaluation.effectiveEnabled
        ? '未分组，Routine 自身已启用'
        : '未分组，Routine 自身已关闭';
    } else if (!group.enabled || group.status !== ReminderStatus.Active) {
      reason = 'Profile 已关闭或未激活；成员状态保持不变';
    } else if (!template.selfEnabled || templateStatus !== ReminderStatus.Active) {
      reason = 'Routine 自身已关闭；Profile 开启不能重新启用它';
    } else {
      reason = 'Routine × Profile × Membership × TemporaryOverride 全部允许';
    }

    return {
      isEffectivelyEnabled: evaluation.effectiveEnabled,
      reason,
      templateStatus,
      groupStatus: group?.status ?? null,
    };
  }

  public calculateEffectiveEnabledBatch(
    templates: ReminderTemplate[],
    groupMap: Map<string, ReminderGroup>,
    globalReminderEnabled: boolean = true,
  ): Map<string, TemplateEffectiveStatus> {
    const resultMap = new Map<string, TemplateEffectiveStatus>();
    for (const template of templates) {
      const group = template.groupId ? groupMap.get(template.groupId) ?? null : null;
      resultMap.set(
        template.id,
        this.calculateEffectiveEnabled(template, group, globalReminderEnabled),
      );
    }
    return resultMap;
  }

  public validateGroupAssignment(
    template: ReminderTemplate,
    targetGroup: ReminderGroup | null,
  ): GroupAssignmentValidation {
    if (!targetGroup) return { valid: true };
    if (targetGroup.identityId !== template.identityId) {
      return {
        valid: false,
        reason: `分组 ${targetGroup.id} 属于账户 ${targetGroup.identityId}，与模板账户 ${template.identityId} 不一致`,
      };
    }
    return { valid: true };
  }

  public validateTemplateDeletion(
    template: ReminderTemplate,
    hardDelete: boolean,
  ): GroupAssignmentValidation {
    if (!hardDelete && template.deletedAt) {
      return {
        valid: false,
        reason: '模板已被软删除，无法再次软删除',
      };
    }
    return { valid: true };
  }
}
