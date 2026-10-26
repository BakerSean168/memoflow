/**
 * R7：code-owned ModuleManifest。
 *
 * 每个模块声明自己的 commands/queries/relations/activities/tools，
 * 宿主扫描注册，消灭中央长 switch 与重复 client registry。
 * 当前为类型级契约 + Goal 试点（Wallet 作为第一个外部模块验证扩展性）。
 */

/** 模块可声明的命令（写操作，经 CommandGateway 执行）。 */
export interface ModuleCommandManifest {
  /** 命令名（如 'goal.create'）。 */
  name: string;
  /** 执行函数（identityId + 参数 → Result）。 */
  execute: (identityId: string, payload: unknown) => Promise<unknown>;
  /** 命令注册的模块（来源审计）。 */
  module: string;
}

/** 模块可声明的查询（读操作）。 */
export interface ModuleQueryManifest {
  name: string;
  query: (identityId: string, payload?: unknown) => Promise<unknown>;
  module: string;
}

/** 模块可声明的关系类型（R5 SubjectRef 扩展）。 */
export interface ModuleRelationManifest {
  subjectTypes: readonly string[];
  relationTypes: readonly string[];
  module: string;
}

/** 模块可声明的活动（R6 Activity Ledger 贡献）。 */
export interface ModuleActivityManifest {
  /** 订阅的事件名 → 活动 action 名。 */
  events: ReadonlyArray<{ event: string; action: string }>;
  module: string;
}

export interface ModuleManifest {
  module: string;
  commands?: readonly ModuleCommandManifest[];
  queries?: readonly ModuleQueryManifest[];
  relations?: ModuleRelationManifest;
  activities?: ModuleActivityManifest;
}

/** 宿主侧命令注册表（替代中央 switch）。 */
export class CommandRegistry {
  private readonly commands = new Map<string, ModuleCommandManifest>();

  register(manifest: ModuleCommandManifest): void {
    if (this.commands.has(manifest.name)) {
      throw new Error(`Command already registered: ${manifest.name}`);
    }
    this.commands.set(manifest.name, manifest);
  }

  registerModule(manifest: ModuleManifest): void {
    for (const command of manifest.commands ?? []) {
      this.register(command);
    }
  }

  get(name: string): ModuleCommandManifest | undefined {
    return this.commands.get(name);
  }

  list(): ModuleCommandManifest[] {
    return Array.from(this.commands.values());
  }
}
