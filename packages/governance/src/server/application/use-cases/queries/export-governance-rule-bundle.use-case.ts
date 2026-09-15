/**
 * Read-only Governance rule-bundle export query (GOV-1903).
 *
 * Owner: Governance application layer. It reads Active Rule/RuleRevision state
 * through domain repository ports and delegates canonical projection/hash work
 * to the bundle projector. It must not write repositories or let CI/tooling read
 * the live Governance database directly.
 *
 * 治理应用层通过领域仓储端口只读导出 Active Rule/RuleRevision，并委托 bundle projector 完成规范化与哈希；不得写仓储，也不得让 CI 直接读取 live Governance DB。
 */
import {
  RuleStatus,
  type GovernanceRuleBundle,
  type GovernanceRuleBundleEntry,
} from '@memoflow/contracts/governance';
import type { Result } from '@memoflow/contracts/result';
import { resultify } from '@memoflow/utils/result';
import type { IRuleRepository } from '../../../domain/repositories/i-rule-repository';
import type { IRuleRevisionRepository } from '../../../domain/repositories/i-rule-revision-repository';
import {
  createGovernanceRuleBundle,
  projectGovernanceRuleBundleEntry,
} from '../../governance-rule-bundle';

/**
 * Read-only explicit publish/export boundary for repository-pinnable Governance rules.
 * 面向可固定进仓库的 Governance rules 的显式只读发布/导出边界。
 * @param ruleRepository - Rule read repository. Rule 只读仓储端口。
 * @param revisionRepository - RuleRevision read repository. RuleRevision 只读仓储端口。
 */
export class ExportGovernanceRuleBundleUseCase {
  constructor(
    private readonly ruleRepository: IRuleRepository,
    private readonly revisionRepository: IRuleRevisionRepository,
  ) {}

  async execute(): Promise<Result<GovernanceRuleBundle>> {
    return resultify(async () => {
      const rules = await this.ruleRepository.findAll({ status: RuleStatus.Active });
      const entries: GovernanceRuleBundleEntry[] = [];

      for (const rule of rules) {
        const revisions = await this.revisionRepository.findByRuleId(rule.id);
        entries.push(projectGovernanceRuleBundleEntry(rule, revisions));
      }

      return createGovernanceRuleBundle(entries);
    }, 'Failed to export Governance rule bundle');
  }
}
