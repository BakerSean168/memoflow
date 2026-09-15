/**
 * R7：Goal 模块的 code-owned ModuleManifest（试点）。
 * 宿主（apps/api）扫描注册，替代中央 switch 的增量入口。
 */

import { randomUUID } from 'node:crypto';
import type { ModuleManifest } from '@memoflow/contracts/shared';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { CreateGoalUseCase } from '../application/use-cases/commands/create-goal.use-case';
import type {
  CreateWalletAccountUseCase,
  RecordWalletTransactionUseCase,
} from '../application/use-cases/commands/wallet.use-cases';

/**
 * Builds a canonical `source: 'system'` context for manifest-driven commands
 * that have no user-facing HTTP/IPC transport. Each invocation gets a fresh,
 * independent request ID (never reused as a durable run/proposal key).
 *
 * 为无 HTTP/IPC transport 的 manifest 命令构造 `source: 'system'` 的 canonical
 * context。每次调用生成独立的新 request ID（绝不当作持久 run/proposal key）。
 */
export function createSystemExecutionContext(identityId: string): ExecutionContext {
  const requestId = randomUUID();
  return {
    requestId,
    traceId: requestId,
    startedAt: Date.now(),
    source: 'system',
    identityId,
  };
}

export interface GoalManifestDeps {
  createGoal: CreateGoalUseCase;
  wallet: {
    createAccount: CreateWalletAccountUseCase;
    recordTransaction: RecordWalletTransactionUseCase;
  };
}

export function createGoalModuleManifest(deps: GoalManifestDeps): ModuleManifest {
  return {
    module: 'goal',
    commands: [
      {
        name: 'goal.create',
        module: 'goal',
        execute: (identityId, payload) =>
          deps.createGoal.execute(payload as never, createSystemExecutionContext(identityId)),
      },
      {
        name: 'wallet.account.create',
        module: 'wallet',
        execute: (identityId, payload) =>
          deps.wallet.createAccount.execute(identityId, payload as never),
      },
      {
        name: 'wallet.transaction.record',
        module: 'wallet',
        execute: (identityId, payload) =>
          deps.wallet.recordTransaction.execute(identityId, payload as never),
      },
    ],
    activities: {
      events: [
        { event: 'goal:created', action: 'created' },
        { event: 'goal:completed', action: 'completed' },
        { event: 'goal:review-added', action: 'review-added' },
      ],
      module: 'goal',
    },
  };
}
