---
tags:
  - adr
  - architecture
  - api-documentation
  - openapi
description: ADR-027 - Zod-to-OpenAPI for Automatic API Documentation Generation
created: 2026-02-19
updated: 2026-02-19
---

# ADR-027: API Documentation with Zod-to-OpenAPI

**状态**: ✅ 已采纳  
**日期**: 2026-02-19

## 背景

项目已深度使用 Zod 进行请求/响应验证，但缺少自动化的 API 文档生成机制。手动维护文档容易与代码脱节。

### 可选方案

1. **@asteasolutions/zod-to-openapi** — 复用 Zod Schema 生成 OpenAPI 3.0 文档
2. **swagger-jsdoc** — 通过 JSDoc 注释生成文档
3. **tsoa** — 基于 TypeScript 装饰器自动生成路由和文档
4. **fastify-zod** — Fastify 框架的 Zod 集成（需要迁移框架）

## 决策

选择 **@asteasolutions/zod-to-openapi**

## 理由

### 为什么选择这个方案？

1. **与现有 Zod Schema 无缝集成** — 直接复用 `旧聚合契约包（已退役）` 中的 Schema
2. **维护成本低** — Schema 变更时文档自动同步
3. **无侵入性** — 不需要修改现有代码结构
4. **标准 OpenAPI 3.0 输出** — 兼容 Swagger UI 和其他工具

### 为什么不选其他方案？

- **swagger-jsdoc**：注释驱动，代码噪音大，与 Zod 重复
- **tsoa**：侵入性强，需要大量重构
- **fastify-zod**：需要迁移到 Fastify 框架

## 实施

### 架构

```
packages/contracts/src/openapi/
├── registry.ts            — OpenAPI Schema 注册中心
└── index.ts               — 导出

apps/api/src/shared/infrastructure/openapi/
├── generator.ts           — OpenAPI 文档生成器
└── swagger.ts             — Swagger UI 挂载
```

### 访问方式

- `GET /api/docs` — Swagger UI 交互式文档
- `GET /api/docs.json` — OpenAPI JSON 规范

## 影响

### 正面影响

- API 文档与代码自动同步
- 支持在线测试 API
- 可作为前后端 API 契约

### 负面影响

- 需要手动注册路由到 OpenAPI Registry
- 新增运行时依赖

## 相关决策

- ADR-008: API Response Format
- ADR-010: Centralized Contracts
- ADR-026: Server-Side Adapter Pattern

---

**教训**: 选择与现有技术栈匹配的文档工具，避免引入不必要的技术迁移成本。
