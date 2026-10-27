/**
 * Residual 645: shared dual error-response schema and unused pagination helpers retired.
 * HTTP/API errors use Result/HttpResponse envelopes; pagination lives module-side.
 */

/**
 * 设备信息类型
 */
export type ClientInfo = {
  deviceId: string;
  deviceName: string;
  userAgent: string;
  ipAddress?: string;
};

// UserAgreement 已随 account 域迁入 @memoflow/account-contracts（Issue #630 §2.2/§4.8）。
