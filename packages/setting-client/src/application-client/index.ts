/**
 * Setting Application Client Layer
 * 设置模块客户端应用层
 *
 * Transport-agnostic Setting client seam. The extracted package holds DTO
 * types and the port interface only: the old `SettingClientService`
 * pass-through aggregate re-declared every port method just to forward the
 * same `Result<T>` and added no behaviour, so it is dropped instead of moved
 * (goal-client G-2 / notification-client precedent).
 *
 * 抽取后的包只保留 DTO 类型与端口接口：旧 `SettingClientService` 伪聚合只是
 * 逐方法转调同一个 `Result<T>`，没有任何行为，故删除而不是搬运。
 */

// ===== Port Interface / 端口接口 =====
export type {
  ISettingApiClient,
  ISettingApiClient as SettingClientPort,
} from './ports/setting-api-client.port';

export { createSettingServiceFromHttpClient } from './setting-http-service-factory';
