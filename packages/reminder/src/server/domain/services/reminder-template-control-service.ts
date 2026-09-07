/**
 * Routine effective-state facade exposed through the legacy Reminder package.
 *
 * ProfileMembership is the canonical ownership/gating truth. A Routine with no
 * memberships uses neutral Profile gates; with memberships, any enabled path
 * through an enabled + active Profile is sufficient for execution.
 */
import { ReminderStatus, type RoutineProfileMembershipView } from '@memoflow/contracts/reminder';
import type { ReminderTemplate } from '../aggregates/reminder-template';
import type { IReminderTemplateRepository } from '../repositories/i-reminder-template-repository';
import type { IUserReminderPreferenceRepository } from '../repositories/i-user-reminder-preference-repository';
import type { RoutineProfileStore } from '../ports';
import type { ProfileMembership, RoutineProfile } from '../routine';
import { evaluateRoutineEffectiveEnabled } from '../routine';

interface RoutineMembershipPath {
  readonly membership: ProfileMembership;
  readonly profile: RoutineProfile | null;
}

export interface ITemplateEffectiveStatus {
  templateId: string;
  templateStatus: ReminderStatus;
  effectiveStatus: ReminderStatus;
  isEffectivelyEnabled: boolean;
  statusReason: string;
  lifecycleSource: 'global' | 'profile' | 'routine';
  globalReminderEnabled: boolean;
  profileMemberships: RoutineProfileMembershipView[];
}

export class ReminderTemplateControlService {
  constructor(
    private readonly templateRepository: IReminderTemplateRepository,
    private readonly preferenceRepository?: IUserReminderPreferenceRepository,
    private readonly routineProfileStore?: RoutineProfileStore,
  ) {}

  private async getGlobalReminderEnabled(identityId: string): Promise<boolean> {
    if (!this.preferenceRepository) return true;
    const preferences = await this.preferenceRepository.findByIdentityId(identityId);
    return preferences?.globalReminderEnabled ?? true;
  }

  async calculateEffectiveStatus(template: ReminderTemplate): Promise<ITemplateEffectiveStatus> {
    const [result] = await this.calculateEffectiveStatusBatch([template]);
    if (!result) {
      throw new TypeError(`Could not calculate effective state for Routine '${template.id}'`);
    }
    return result;
  }

  async calculateEffectiveStatusBatch(
    templates: ReminderTemplate[],
  ): Promise<ITemplateEffectiveStatus[]> {
    if (templates.length === 0) return [];

    const identities = Array.from(
      new Set(templates.map((template) => String(template.identityId))),
    );
    const globalEntries = await Promise.all(
      identities.map(
        async (identityId) =>
          [identityId, await this.getGlobalReminderEnabled(identityId)] as const,
      ),
    );
    const globalByIdentity = new Map(globalEntries);
    const pathsByRoutine = await this.loadMembershipPaths(templates);

    return templates.map((template) => {
      const identityId = String(template.identityId);
      return this.buildEffectiveStatus(
        template,
        globalByIdentity.get(identityId) ?? true,
        pathsByRoutine.get(`${identityId}:${template.id}`) ?? [],
      );
    });
  }

  async isTemplateEffectivelyEnabled(template: ReminderTemplate): Promise<boolean> {
    return (await this.calculateEffectiveStatus(template)).isEffectivelyEnabled;
  }

  async getEffectivelyEnabledTemplatesByIdentityId(
    identityId: string,
  ): Promise<ReminderTemplate[]> {
    const templates = await this.templateRepository.findByIdentityId(identityId);
    const statusResults = await this.calculateEffectiveStatusBatch(templates);
    const enabledIds = new Set(
      statusResults
        .filter((result) => result.isEffectivelyEnabled)
        .map((result) => result.templateId),
    );
    return templates.filter((template) => enabledIds.has(template.id));
  }

  private async loadMembershipPaths(
    templates: readonly ReminderTemplate[],
  ): Promise<Map<string, RoutineMembershipPath[]>> {
    const result = new Map<string, RoutineMembershipPath[]>();
    if (!this.routineProfileStore || templates.length === 0) return result;

    const routineIdsByIdentity = new Map<string, string[]>();
    for (const template of templates) {
      const identityId = String(template.identityId);
      const ids = routineIdsByIdentity.get(identityId) ?? [];
      ids.push(template.id);
      routineIdsByIdentity.set(identityId, ids);
    }

    for (const [identityId, routineIds] of routineIdsByIdentity) {
      const memberships = await this.routineProfileStore.listMembershipsForRoutines({
        identityId,
        routineIds,
      });
      const profileIds = Array.from(new Set(memberships.map((membership) => membership.profileId)));
      const profiles = await this.routineProfileStore.findProfilesByIds({ identityId, profileIds });
      const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

      for (const membership of memberships) {
        const key = `${identityId}:${membership.routineId}`;
        const paths = result.get(key) ?? [];
        paths.push({
          membership,
          profile: profilesById.get(membership.profileId) ?? null,
        });
        result.set(key, paths);
      }
    }

    return result;
  }

  private buildEffectiveStatus(
    template: ReminderTemplate,
    globalReminderEnabled: boolean,
    paths: readonly RoutineMembershipPath[],
  ): ITemplateEffectiveStatus {
    const routineEnabled =
      globalReminderEnabled && template.selfEnabled && template.status === ReminderStatus.Active;

    const profileMemberships = paths.map(({ membership, profile }) => {
      const evaluation = evaluateRoutineEffectiveEnabled({
        routineEnabled,
        profileEnabled: profile?.enabled ?? false,
        profileActive: profile?.active ?? false,
        membershipEnabled: membership.enabled,
      });
      return {
        profileId: membership.profileId as RoutineProfileMembershipView['profileId'],
        profileName: profile?.name ?? null,
        enabled: membership.enabled,
        profileEnabled: profile?.enabled ?? false,
        profileActive: profile?.active ?? false,
        effectiveEnabled: evaluation.effectiveEnabled,
      } satisfies RoutineProfileMembershipView;
    });

    const unprofiledEvaluation = evaluateRoutineEffectiveEnabled({ routineEnabled });
    const isEffectivelyEnabled =
      profileMemberships.length === 0
        ? unprofiledEvaluation.effectiveEnabled
        : profileMemberships.some((membership) => membership.effectiveEnabled);

    let statusReason: string;
    let lifecycleSource: ITemplateEffectiveStatus['lifecycleSource'];
    if (!globalReminderEnabled) {
      statusReason = '全局提醒总开关已关闭（folded into Routine gate）';
      lifecycleSource = 'global';
    } else if (!template.selfEnabled || template.status !== ReminderStatus.Active) {
      statusReason = 'Routine 自身已关闭；Profile 开启不能重新启用它';
      lifecycleSource = 'routine';
    } else if (profileMemberships.length === 0) {
      statusReason = '未加入 Profile，使用 Routine 自身 enabled 状态';
      lifecycleSource = 'routine';
    } else if (isEffectivelyEnabled) {
      statusReason = '至少一个 ProfileMembership 路径处于启用状态';
      lifecycleSource = 'profile';
    } else {
      statusReason = '所有 ProfileMembership 路径均被 membership 或 Profile gate 阻止';
      lifecycleSource = 'profile';
    }

    return {
      templateId: template.id,
      templateStatus: template.status,
      effectiveStatus: isEffectivelyEnabled ? ReminderStatus.Active : ReminderStatus.Paused,
      isEffectivelyEnabled,
      statusReason,
      lifecycleSource,
      globalReminderEnabled,
      profileMemberships,
    };
  }
}
