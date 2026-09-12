/**
 * Account Controller
 *
 * Encapsulates Zod validation and use case orchestration.
 * Shared by both Express (HTTP) and IPC transport layers.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { UpdateAccountSchema, CloseAccountSchema } from '@memoflow/contracts/account';
import type { GetAccountRes, UpdateAccountRes } from '@memoflow/contracts/account';
import { formatZodErrors } from '@memoflow/utils/result';
import type { AccountApplicationPort } from '../application';

export class AccountController {
  constructor(private readonly api: AccountApplicationPort) {}

  async getProfile(cx: ExecutionContext): Promise<Result<GetAccountRes>> {
    const result = await this.api.getProfile(cx);
    if (!result.ok) {
      return result;
    }
    if (result.data === null) {
      return fail({ code: 'NOT_FOUND', message: 'Account not found' });
    }
    return ok(result.data);
  }

  async updateProfile(input: unknown, cx: ExecutionContext): Promise<Result<UpdateAccountRes>> {
    const parsed = UpdateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.api.updateProfile(parsed.data, cx);
  }

  async closeAccount(
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<import('@memoflow/contracts/account').CloseAccountRes>> {
    const parsed = CloseAccountSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.api.closeAccount(parsed.data, cx);
  }

  // ==================== W7 Operation Timeline / Replay / Audit ====================

  async queryClosureTimeline(cx: ExecutionContext): Promise<Result<unknown>> {
    return this.api.queryClosureTimeline(cx);
  }

  async replayClosure(operationId: string, cx: ExecutionContext): Promise<Result<unknown>> {
    return this.api.replayClosure(operationId, cx);
  }

  async getOperationAudit(cx: ExecutionContext): Promise<Result<unknown>> {
    return this.api.getOperationAudit(cx);
  }
}
