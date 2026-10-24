import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AIEvaluationReportSchema, type GetAIEvaluationOverviewRes } from '@memoflow/contracts/ai';

import type {
  AIEvaluationHistoryRecord,
  AIEvaluationReportMode,
  AIEvaluationReportRecord,
  GetAIEvaluationOverviewInput,
  IAIEvaluationReportPort,
} from '../../../application/ports';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HISTORY_LIMIT = 5;

function resolveWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}

function resolveDefaultReportsRoot(): string {
  return path.join(resolveWorkspaceRoot(__dirname), 'reports', 'apps', 'ai', 'evals');
}

function buildHistoryEntry(
  fileName: string,
  report: AIEvaluationReportRecord,
): AIEvaluationHistoryRecord {
  return {
    fileName,
    generatedAt: report.generatedAt,
    mode: report.mode,
    provider: report.provider,
    model: report.model,
    passRate: report.passRate,
    totalCases: report.totalCases,
    failedCases: report.failedCases,
    gatePassed: report.gatePassed,
    archivePath: report.archivePath ?? fileName,
  };
}

export interface AIEvaluationReportFileAdapterOptions {
  /** Canonical Mastra-native report root. */
  reportsRoot?: string;
  defaultHistoryLimit?: number;
}

/**
 * Reads canonical Mastra-native evaluation reports.
 *
 * Retired Python report formats are intentionally not accepted here. Historical
 * data must be migrated explicitly instead of keeping a second runtime-era wire
 * format alive in the product read path.
 */
export class AIEvaluationReportFileAdapter implements IAIEvaluationReportPort {
  private readonly reportsRoot: string;
  private readonly defaultHistoryLimit: number;

  constructor(options: AIEvaluationReportFileAdapterOptions = {}) {
    this.reportsRoot = options.reportsRoot ?? resolveDefaultReportsRoot();
    this.defaultHistoryLimit = options.defaultHistoryLimit ?? DEFAULT_HISTORY_LIMIT;
  }

  async getOverview(input: GetAIEvaluationOverviewInput = {}): Promise<GetAIEvaluationOverviewRes> {
    const historyLimit = input.historyLimit ?? this.defaultHistoryLimit;
    const [deterministicLatest, liveLatest, deterministicHistory, liveHistory] = await Promise.all([
      this.readOptionalReport(path.join(this.reportsRoot, 'latest.json')),
      this.readOptionalReport(path.join(this.reportsRoot, 'live-latest.json')),
      this.readHistory('history', 'deterministic', historyLimit),
      this.readHistory('live-history', 'live', historyLimit),
    ]);

    return {
      latest: {
        deterministic: deterministicLatest,
        live: liveLatest,
      },
      history: {
        deterministic: deterministicHistory,
        live: liveHistory,
      },
    };
  }

  private async readOptionalReport(
    filePath: string,
  ): Promise<AIEvaluationReportRecord | undefined> {
    try {
      return await this.readReport(filePath);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return undefined;
      }
      throw error;
    }
  }

  private async readHistory(
    directoryName: string,
    mode: AIEvaluationReportMode,
    limit: number,
  ): Promise<AIEvaluationHistoryRecord[]> {
    const directoryPath = path.join(this.reportsRoot, directoryName);
    let fileNames: string[] = [];
    try {
      fileNames = await readdir(directoryPath);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }

    const reports = await Promise.all(
      fileNames
        .filter((fileName) => fileName.endsWith('.json'))
        .sort((left, right) => right.localeCompare(left))
        .map(async (fileName) => {
          try {
            const report = await this.readReport(path.join(directoryPath, fileName));
            return report.mode === mode ? buildHistoryEntry(fileName, report) : null;
          } catch {
            return null;
          }
        }),
    );

    return reports
      .filter((entry): entry is AIEvaluationHistoryRecord => entry !== null)
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
      .slice(0, limit);
  }

  private async readReport(filePath: string): Promise<AIEvaluationReportRecord> {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return AIEvaluationReportSchema.parse(raw);
  }
}
