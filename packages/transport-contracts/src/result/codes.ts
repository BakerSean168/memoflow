/**
 * Result Codes
 *
 * 核心错误码定义，被其他 result 模块文件使用
 * 此文件不应导入任何其他 result 模块文件，以避免循环依赖
 *
 * @module @memoflow/contracts/result/codes
 */

/**
 * 错误码枚举
 * 统一所有端的错误码定义
 */
export const ResultCode = {
  // 成功
  OK: 'OK',

  // 客户端错误
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',

  // 服务端错误
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',

  // 业务错误
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  DOMAIN_ERROR: 'DOMAIN_ERROR',

  // 未知错误
  UNKNOWN: 'UNKNOWN',
} as const;

export type ResultCode = (typeof ResultCode)[keyof typeof ResultCode];
