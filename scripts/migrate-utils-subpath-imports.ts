/**
 * Codemod: Migrate `@memoflow/utils` root barrel imports to subpath imports.
 *
 * Usage: npx tsx scripts/migrate-utils-subpath-imports.ts [--dry-run]
 *
 * For each file that imports from `@memoflow/utils`, this script:
 * 1. Maps each imported symbol to its correct subpath
 * 2. Splits mixed imports into multiple subpath-specific import statements
 * 3. Preserves type-only imports and formatting
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');

// ═══════════════════════════════════════════════════════════════
// Symbol → Subpath mapping
// ═══════════════════════════════════════════════════════════════

const SYMBOL_TO_SUBPATH: Record<string, string> = {};

function map(subpath: string, symbols: string[]) {
  for (const s of symbols) {
    SYMBOL_TO_SUBPATH[s] = subpath;
  }
}

// Logger
map('@memoflow/utils/logger', [
  'createLogger',
  'ILogger',
  'LoggerFactory',
  'Logger',
  'ConsoleTransport',
  'HttpTransport',
  'LogLevel',
  'LogLevelString',
  'LogMetadata',
  'LogEntry',
  'LogTransport',
  'LoggerConfig',
]);

// Domain
map('@memoflow/utils/domain', [
  'Entity',
  'AggregateRoot',
  'ValueObject',
  'eventBus',
  'createIdType',
]);

// Errors
map('@memoflow/utils/errors', [
  'DomainError',
  'BusinessRuleViolationError',
  'NotFoundError',
  'ValidationError',
  'UnauthorizedError',
  'ForbiddenError',
  'ConflictError',
  'InternalServerError',
  'isDomainError',
  'extractErrorInfo',
  'mapPrismaError',
  'PrismaErrorMapping',
  'isPrismaError',
  'mapInfraErrorToResultError',
]);

// Shared
map('@memoflow/utils/shared', [
  'generateUUID',
  'newId',
  'isValidUUID',
  'generateShortId',
  'ensureDate',
  'toDayStart',
  'toDayEnd',
  'formatDateToInput',
  'formatTimeToInput',
  'updateDateKeepTime',
  'updateTimeKeepDate',
  'nowIso',
  'toIso',
  'IEnvConfig',
  'EnvConfig',
  'envConfig',
  'extractErrorMessage',
  'withCause',
  'fromDbDate',
  'toDate',
  'toDateOrNull',
  'parseJson',
  'parseStringArray',
  'parseRecord',
  'escapeSqlLike',
]);

// Result
map('@memoflow/utils/result', [
  // Core Result
  'ok',
  'fail',
  'error',
  'isOk',
  'isFail',
  'unwrap',
  'unwrapOrThrowError',
  'unwrapOr',
  'toResultErrorException',
  'map',
  'mapError',
  'flatMap',
  'tryCatch',
  'tryCatchSync',
  'extractStructuredResultError',
  'ResultCode',
  'ResultErrors',
  'ResultErrorException',
  'okPaged',
  'okBatch',
  // HTTP
  'toHttpResponse',
  'fromHttpResponse',
  'getHttpStatusCode',
  'errorCodeToHttpStatus',
  'HttpResponseBuilder',
  'createHttpResponseBuilder',
  'ResultCodeToHttpStatus',
  'isClientError',
  'isServerError',
  // IPC
  'toIpcResult',
  'fromIpcResult',
  // Types
  'Result',
  'SuccessResult',
  'FailureResult',
  'ResultError',
  'ResultErrorDetail',
  'ResultMeta',
  'StructuredResultError',
  'AsyncResult',
  'PageInfo',
  'PagedList',
  'BatchResult',
  'IpcResult',
  'HttpResponse',
  'HttpResponseOptions',
  // Local adapters
  'expressAdapter',
  'formatZodErrors',
  'ExpressAdapterOptions',
  'ipcAdapter',
  'IpcAdapterOptions',
  'resultify',
  'RouteRegistrar',
  'OpenApiRegistryLike',
  'HttpMethod',
  'ApiRouteDefinition',
  'RouteRegistrarConfig',
  'successResponse',
  'errorResponse',
  'OpenApiErrorResponseSchema',
]);

// Frontend
map('@memoflow/utils/frontend', [
  'EnvironmentConfig',
  'getEnvironmentConfig',
  'createAuthHeader',
  'isDevelopment',
  'isProduction',
  'safeParseJSON',
  'formatFileSize',
  'validateFileType',
  'validateFileSize',
  'generateRequestId',
  'createQueryString',
  'delay',
  'exponentialBackoff',
  'isNetworkError',
  'shouldRetry',
  'createCacheKey',
  'isCacheExpired',
  'cleanExpiredCache',
  'deepClone',
  'createDebounce',
  'createDebouncePromise',
  'createBatchDebounce',
  'debounceDecorator',
  'createThrottle',
  'createWindowThrottle',
  'createRAFThrottle',
  'createThrottleDebounce',
  'throttleDecorator',
  'LoadingState',
  'LoadingStateSnapshot',
  'createLoadingWrapper',
  'combineLoadingStates',
  'createPollingLoader',
  'createCachedLoader',
  'CacheEntry',
  'CacheInfo',
]);

// Validation
map('@memoflow/utils/validation', [
  'FormValidator',
  'BuiltinValidators',
  'createSimpleValidator',
  'validators',
  'defaultConfig',
  'version',
  'ValidationRule',
  'RequiredRule',
  'LengthRule',
  'PatternRule',
  'NumberRule',
  'RangeRule',
  'ValidationResult',
  'FieldValidationResult',
  'FormValidationResult',
  'ValidationTrigger',
  'ValidationSeverity',
  'FieldConfig',
  'FormConfig',
  'IFormValidator',
  'ValidationEventType',
  'ValidationEvent',
  'ValidationEventListener',
]);

// Lifecycle (initialization managers)
map('@memoflow/utils/lifecycle', [
  'InitializationPhase',
  'InitializationTask',
  'InitializationManager',
  'ModuleLoader',
  'ModuleDefinition',
  'LoadingProgress',
  'ModuleGroup',
  'WebInitializationManager',
]);

// ═══════════════════════════════════════════════════════════════
// Parser & Transformer
// ═══════════════════════════════════════════════════════════════

interface ImportClause {
  isType: boolean;
  name: string; // local name
  alias?: string; // imported name (for `import { X as Y }`)
}

interface ImportStatement {
  fullMatch: string;
  startIndex: number;
  endIndex: number;
  isTypeOnly: boolean; // `import type { ... }`
  clauses: ImportClause[];
}

function parseImportClauses(clauseStr: string): ImportClause[] {
  const clauses: ImportClause[] = [];
  // Split by comma, handling nested braces (shouldn't appear in imports but be safe)
  const parts = clauseStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const typeMatch = part.match(/^type\s+/);
    const isType = !!typeMatch;
    const clean = isType ? part.slice(typeMatch![0].length).trim() : part;

    const aliasMatch = clean.match(/^(\w+)\s+as\s+(\w+)$/);
    if (aliasMatch) {
      clauses.push({ isType, name: aliasMatch[2]!, alias: aliasMatch[1] });
    } else {
      clauses.push({ isType, name: clean });
    }
  }

  return clauses;
}

function findImportStatements(source: string, moduleName: string): ImportStatement[] {
  const statements: ImportStatement[] = [];
  // Match both `import type { ... }` and `import { ... }`
  // Also match re-exports: `export { ... } from '...'`
  // Include optional trailing semicolon in the match to avoid doubling on replacement
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(?:import\\s+(type\\s+)?\\{([^}]+)\\}\\s+from\\s+['"]${escaped}['"];?` +
      `|export\\s+\\{([^}]+)\\}\\s+from\\s+['"]${escaped}['"];?)`,
    'g',
  );

  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const isTypeOnly = !!match[1];
    const clauseStr = match[2] ?? match[3]!;
    const clauses = parseImportClauses(clauseStr);

    statements.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      isTypeOnly,
      clauses,
    });
  }

  return statements;
}

function buildImportLine(symbols: ImportClause[], subpath: string, isTypeOnly: boolean): string {
  const typePrefix = isTypeOnly ? 'import type' : 'import';
  const parts = symbols.map((s) => {
    if (s.alias) return `${s.name} as ${s.alias}`;
    return s.name;
  });

  if (parts.length === 1) {
    return `${typePrefix} { ${parts[0]} } from '${subpath}';`;
  }

  return `${typePrefix} { ${parts.join(', ')} } from '${subpath}';`;
}

function buildExportLine(symbols: ImportClause[], subpath: string): string {
  const parts = symbols.map((s) => {
    if (s.alias) return `${s.name} as ${s.alias}`;
    return s.name;
  });

  if (parts.length === 1) {
    return `export { ${parts[0]} } from '${subpath}';`;
  }

  return `export { ${parts.join(', ')} } from '${subpath}';`;
}

function transformFile(source: string): {
  transformed: string;
  changed: boolean;
  stats: { total: number; migrated: number; unmapped: string[] };
} {
  const statements = findImportStatements(source, '@memoflow/utils');
  if (statements.length === 0) {
    return { transformed: source, changed: false, stats: { total: 0, migrated: 0, unmapped: [] } };
  }

  const allUnmapped: string[] = [];
  let allMigrated = 0;
  let result = source;
  let offset = 0;

  for (const stmt of statements) {
    // Group clauses by subpath
    const bySubpath = new Map<string, { typed: ImportClause[]; untyped: ImportClause[] }>();
    const unmapped: ImportClause[] = [];

    for (const clause of stmt.clauses) {
      const subpath = SYMBOL_TO_SUBPATH[clause.name];
      if (subpath) {
        if (!bySubpath.has(subpath)) {
          bySubpath.set(subpath, { typed: [], untyped: [] });
        }
        const group = bySubpath.get(subpath)!;
        if (clause.isType || stmt.isTypeOnly) {
          group.typed.push(clause);
        } else {
          group.untyped.push(clause);
        }
        allMigrated++;
      } else {
        unmapped.push(clause);
        allUnmapped.push(clause.name);
      }
    }

    // Build replacement lines
    const lines: string[] = [];
    const isExport = stmt.fullMatch.startsWith('export');

    // Sort subpaths for deterministic output
    const sortedSubpaths = [...bySubpath.entries()].sort(([a], [b]) => a.localeCompare(b));

    for (const [subpath, { typed, untyped }] of sortedSubpaths) {
      if (isExport) {
        const allClauses = [...untyped, ...typed];
        lines.push(buildExportLine(allClauses, subpath));
      } else {
        if (untyped.length > 0) {
          lines.push(buildImportLine(untyped, subpath, false));
        }
        if (typed.length > 0) {
          lines.push(buildImportLine(typed, subpath, true));
        }
      }
    }

    // Keep unmapped symbols as original import
    if (unmapped.length > 0) {
      if (isExport) {
        lines.push(buildExportLine(unmapped, '@memoflow/utils'));
      } else {
        lines.push(buildImportLine(unmapped, '@memoflow/utils', stmt.isTypeOnly));
      }
    }

    const replacement = lines.join('\n');
    result =
      result.slice(0, stmt.startIndex + offset) +
      replacement +
      result.slice(stmt.endIndex + offset);
    offset += replacement.length - stmt.fullMatch.length;
  }

  return {
    transformed: result,
    changed: true,
    stats: {
      total: statements.reduce((sum, s) => sum + s.clauses.length, 0),
      migrated: allMigrated,
      unmapped: allUnmapped,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  const files = await glob('**/*.{ts,tsx,vue}', {
    cwd: 'D:\\home\\projects\\memoflow',
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.nx/**',
      '**/scripts/migrate-utils-subpath-imports.ts',
      'packages/utils/src/**', // Don't modify the utils package itself
    ],
    absolute: true,
  });

  let totalFiles = 0;
  let modifiedFiles = 0;
  let totalImports = 0;
  let migratedImports = 0;
  const allUnmapped = new Set<string>();

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const { transformed, changed, stats } = transformFile(source);

    if (changed) {
      totalFiles++;
      totalImports += stats.total;
      migratedImports += stats.migrated;
      stats.unmapped.forEach((s) => allUnmapped.add(s));

      if (DRY_RUN) {
        console.log(
          `[DRY RUN] Would modify: ${filePath} (${stats.migrated}/${stats.total} symbols migrated)`,
        );
        if (stats.unmapped.length > 0) {
          console.log(`  Unmapped: ${stats.unmapped.join(', ')}`);
        }
      } else {
        fs.writeFileSync(filePath, transformed, 'utf-8');
        modifiedFiles++;
        console.log(
          `Modified: ${path.relative('D:\\home\\projects\\memoflow', filePath)} (${stats.migrated}/${stats.total})`,
        );
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`Files processed: ${totalFiles}`);
  console.log(`Imports migrated: ${migratedImports}/${totalImports}`);
  if (allUnmapped.size > 0) {
    console.log(`Unmapped symbols (${allUnmapped.size}): ${[...allUnmapped].sort().join(', ')}`);
  }
  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files were modified. Remove --dry-run to apply changes.');
  }
}

main().catch(console.error);
