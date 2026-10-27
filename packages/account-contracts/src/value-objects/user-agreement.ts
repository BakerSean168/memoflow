/**
 * 用户协议同意信息 —— 账户域值对象。
 *
 * 真身自 @memoflow/transport-contracts.ts 迁入（Issue #630 §2.2 / §4.8）。
 */
export type UserAgreement = {
  agreedToTerms: boolean;
  agreedToPrivacy: boolean;
  termsVersion: string; // 协议版本号，如 "1.0.0"
  privacyVersion: string; // 隐私政策版本号
  agreedAt: number; // 数字格式
  ipAddress?: string; // 同意时的IP地址
};
