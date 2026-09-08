/**
 * AI Module - Domain Server
 * AI 模块 - 领域服务端
 *
 * 【模块职责】
 * 管理 AI 功能的核心业务逻辑，包括对话管理、内容生成和提供商配置。
 *
 * 【包含内容】
 * - 聚合根（Aggregates）：AIConversation, AIProviderConfig
 * - 实体（Entities）：Message
 * - 值对象（Value Objects）：TokenUsage
 * - 仓储接口（Repositories）：IAIConversationRepository, IAIProviderConfigRepository
 * - 领域服务（Domain Services）：AIGenerationValidationService
 * - 领域错误（Domain Errors）：AIErrors - AI 相关业务异常
 * - 适配器接口（Adapter Interfaces）：定义与 AI 提供商的集成接口
 *
 * 【业务特性】
 * - AI 对话：多轮对话管理、上下文维护
 * - 内容生成：Mastra workflow + canonical contracts；legacy Goal/Task generation validator 已退休
 * - 提供商管理：OpenAI-compatible provider 配置与选择
 *
 * 【DDD 原则】
 * - 纯业务逻辑：只包含领域层的业务规则
 * - 基础设施分离：不包含 Prompt 模板、Adapter 实现
 * - 接口隔离：通过 Adapter 接口与外部 AI 服务集成
 *
 * 【依赖规则】
 * ✅ 允许依赖：
 * - @memoflow/utils（基类：AggregateRoot, Entity）
 * - @memoflow/contracts（DTO 接口、事件 Map）
 * - @memoflow/domain-shared（共享身份值对象）
 *
 * ❌ 禁止依赖：
 * - domain-client（客户端领域模型）
 * - @memoflow/infrastructure-*（基础设施层）
 * - @memoflow/application-*（应用层）
 * - 外部 I/O 库（axios, openai-sdk 等）
 */

// ===== Aggregates =====
export * from './aggregates';

// ===== Entities =====
export * from './entities';

// ===== Value Objects =====
export * from './value-objects';

// ===== Repositories =====
export * from './repositories';

// ===== Domain Services =====
export * from './services';

// ===== Domain Errors =====
export * from './errors/ai-errors';
