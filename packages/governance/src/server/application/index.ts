/**
 * Governance server application layer.
 * Governance 服务端应用层。
 *
 * Organizes the module's commands, queries, and transport-neutral callable port.
 * It coordinates use cases without leaking transport or persistence details.
 *
 * 负责组织模块的命令、查询和传输无关调用门面，
 * 编排用例而不泄露传输或持久化细节。
 */

export * from './governance.application.port';
export * from './use-cases';
export * from './governance-rule-bundle';
