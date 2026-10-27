import { ResultErrorException } from '@memoflow/transport-contracts/result';

/**
 * 业务规则违规错误
 * 当领域操作违反业务规则时抛出
 */
export class BusinessRuleViolationError extends ResultErrorException {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BUSINESS_ERROR', undefined, context, 400);
  }
}
