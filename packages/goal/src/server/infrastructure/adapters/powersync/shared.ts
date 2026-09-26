export interface PowerSyncQueryResult {
  rowsAffected?: number;
}

export interface PowerSyncLockContext {
  execute(sql: string, parameters?: unknown[]): Promise<PowerSyncQueryResult>;
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>;
}

export interface GoalPowerSyncDatabase extends PowerSyncLockContext {
  writeTransaction<T>(callback: (tx: PowerSyncLockContext) => Promise<T>): Promise<T>;
}

export function toDbDateTime(value: Date | string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function fromDbDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function asJsonString(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
