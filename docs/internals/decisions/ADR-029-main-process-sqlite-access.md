---
tags:
  - adr
  - architecture
  - decision
  - electron
  - desktop
  - sqlite
  - database
description: ADR-029 - 主进程 SQLite 直接访问策略
created: 2025-12-06
updated: 2025-12-06
---

# ADR-029: 主进程 SQLite 直接访问策略

**状态**: ⚠️ 已过时（被 PowerSync-only Desktop Runtime 取代）  
**日期**: 2025-12-06  
**决策者**: @BakerSean168  
**关联**: ADR-004, ADR-006

> 说明：本 ADR 作为历史记录保留，不再反映当前实现。当前 desktop 主进程已切换为 PowerSync-only 本地运行时。

> 补充：文中的 `GoalContainer` / `TaskContainer` 注入示例已过时。
> 现在更推荐显式 module factories / composition roots。

## 背景

在 Desktop 应用中，主进程需要访问本地 SQLite 数据库来持久化用户数据。需要决定数据库访问的架构方式。

### 现有基础设施

- `better-sqlite3`: 已在 `apps/desktop` 中安装
- SQLite 文件位置: 用户数据目录
- 现有 Repository 实现: `repositoryFactory.ts`

### 可选方案

1. **方案 A**: 主进程直接访问
   - 在主进程中直接使用 better-sqlite3
   - 同步 API，简单直接

2. **方案 B**: Worker Thread 隔离
   - 创建专门的数据库 Worker
   - 通过消息传递访问

3. **方案 C**: 独立进程
   - 启动独立的数据库服务进程
   - 通过 IPC/Socket 通信

## 决策

选择 **方案 A: 主进程直接访问**

## 理由

### 为什么选择方案 A？

✅ **简单性**

- 无需额外进程管理
- 代码直观易维护
- 调试方便

✅ **性能足够**

- 单用户场景，并发压力小
- better-sqlite3 同步 API 足够快
- SQLite 本身支持 WAL 模式

✅ **与现有架构一致**

- 直接使用 `@memoflow/infrastructure-server` Container
- Repository 模式无需改变

✅ **事务完整性**

- 同步 API 保证事务原子性
- 无跨进程事务问题

### 为什么不选其他方案？

❌ **方案 B (Worker Thread)**

- 增加复杂度
- better-sqlite3 不支持 Worker Thread
- 需要额外的消息序列化

❌ **方案 C (独立进程)**

- 过度工程
- 进程管理复杂
- 应用启动变慢

## 实现设计

### 1. 数据库初始化

```typescript
// apps/desktop/src/main/shared/database/index.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

let db: Database.Database | null = null;

export function initializeDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'memoflow.db');

  db = new Database(dbPath, {
    // WAL 模式提升并发读性能
    // verbose: console.log, // 开发时启用
  });

  // 启用 WAL 模式
  db.pragma('journal_mode = WAL');

  // 运行迁移
  runMigrations(db);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

### 2. Repository 实现示例

```typescript
// apps/desktop/src/main/di/sqlite-adapters/goal.sqlite-repository.ts
import type { IGoalRepository } from '@memoflow/domain-server/goal';
import type { Goal } from '@memoflow/domain-server/goal';
import { getDatabase } from '../../shared/database';

export class SqliteGoalRepository implements IGoalRepository {
  async findAll(params?: { status?: string; limit?: number }): Promise<Goal[]> {
    const db = getDatabase();

    let sql = 'SELECT * FROM goals';
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params?.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    if (params?.limit) {
      sql += ' LIMIT ?';
      values.push(params.limit);
    }

    const rows = db.prepare(sql).all(...values);
    return rows.map(this.mapToEntity);
  }

  async findById(uuid: string): Promise<Goal | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM goals WHERE uuid = ?').get(uuid);
    return row ? this.mapToEntity(row) : null;
  }

  async create(goal: Goal): Promise<Goal> {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO goals (uuid, title, description, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      goal.uuid,
      goal.title,
      goal.description,
      goal.status,
      goal.progress,
      goal.createdAt.toISOString(),
      goal.updatedAt.toISOString(),
    );

    return goal;
  }

  async update(uuid: string, data: Partial<Goal>): Promise<Goal> {
    const db = getDatabase();
    // ... 实现更新逻辑
  }

  async delete(uuid: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM goals WHERE uuid = ?').run(uuid);
  }

  private mapToEntity(row: unknown): Goal {
    // 将数据库行映射为领域实体
    return {
      uuid: row.uuid,
      title: row.title,
      // ...
    };
  }
}
```

### 3. 主进程 DI 配置

旧的容器注册示例已删除。
当前推荐做法是在 bootstrap / module entry 中显式构造 repository adapter，
再把它传入对应模块的 composition root。

## 性能考虑

### WAL 模式

```sql
PRAGMA journal_mode = WAL;
```

优势:

- 读写可并行
- 写操作不阻塞读
- 崩溃恢复更快

### 预编译语句

```typescript
// 缓存常用语句
private readonly stmtFindAll = db.prepare('SELECT * FROM goals');
private readonly stmtFindById = db.prepare('SELECT * FROM goals WHERE uuid = ?');
```

### 批量操作

```typescript
async createMany(goals: Goal[]): Promise<void> {
  const db = getDatabase();
  const insert = db.prepare(`
    INSERT INTO goals (uuid, title, ...) VALUES (?, ?, ...)
  `);

  const insertMany = db.transaction((goals: Goal[]) => {
    for (const goal of goals) {
      insert.run(goal.uuid, goal.title, ...);
    }
  });

  insertMany(goals);
}
```

## 风险与缓解

| 风险       | 概率 | 影响 | 缓解措施                 |
| ---------- | ---- | ---- | ------------------------ |
| 主进程阻塞 | 低   | 中   | 大查询分页，避免全表扫描 |
| 数据损坏   | 低   | 高   | WAL 模式 + 定期备份      |
| 迁移失败   | 中   | 高   | 迁移版本化，支持回滚     |

## 未来演进

如果未来出现性能瓶颈：

1. **第一步**: 优化索引和查询
2. **第二步**: 实现查询缓存
3. **第三步**: 考虑 Worker Thread (需要 sql.js 替代 better-sqlite3)

## 相关决策

- **ADR-004**: Electron 桌面应用架构
- **ADR-006**: Desktop IPC 通信架构

## 参考

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [SQLite WAL 模式](https://sqlite.org/wal.html)
- [Electron 数据存储最佳实践](https://www.electronjs.org/docs/latest/tutorial/application-distribution)

---

**审核**: @Architect Winston  
**批准**: 2025-12-06
