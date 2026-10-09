import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { serialize } from 'node:v8';
import matter from 'gray-matter';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import {
  KnowledgeDocumentIdSchema,
  LocalVaultBindingClientDTOSchema,
} from '@memoflow/contracts/repository';
import type {
  ConfirmedLocalVaultWriteReq,
  ConfirmedLocalVaultWriteRes,
  KnowledgeRepositoryContentState,
  LocalVaultBindingClientDTO,
  LocalVaultBindingSnapshotDTO,
  LocalVaultHealthDTO,
  LocalVaultNoteDTO,
  LocalVaultNoteSummaryDTO,
  OpenLocalVaultInObsidianReq,
  ReadLocalVaultNoteReq,
  ScanLocalVaultRes,
  SearchLocalVaultReq,
  SearchLocalVaultRes,
  SelectLocalVaultReq,
} from '@memoflow/contracts/repository';
// Residual 957: isMissing/isTemporaryFile duals retired — sole vault-fs-guards.
import { isMissing, isTemporaryFile } from './vault-fs-guards';

const MAX_NOTE_BYTES = 2 * 1024 * 1024;
const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_SCAN_ENTRIES = 100_000;
const MAX_SEARCH_RESULTS = 200;
// Budget serialized payloads at 2x their size to allow for JS string/object overhead.
const MAX_CACHED_NOTE_BYTES = 128 * 1024 * 1024;
const NOTE_READ_CONCURRENCY = 8;
const IGNORED_DIRECTORIES = new Set(['.git', '.obsidian', '.trash', '.Trash', 'node_modules']);
const SYNC_IGNORED_DIRECTORIES = new Set([...IGNORED_DIRECTORIES, '.memory-flow']);

function normalizeSearchValue(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function tokenizeSearchQuery(query: string): string[] {
  return [...new Set(query.normalize('NFKC').trim().split(/\s+/u).filter(Boolean))].slice(0, 8);
}

const searchSegments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function displayedSearchMatch(line: string, start: number, length: number) {
  let originalStart = start;
  let originalEnd = start + length;
  if (line.normalize('NFKC') !== line || line.toLowerCase().length !== line.length) {
    let offset = 0;
    let foundStart = false;
    for (const { segment, index } of searchSegments.segment(line)) {
      const next = offset + normalizeSearchValue(segment).length;
      if (!foundStart && next > start) {
        originalStart = index;
        foundStart = true;
      }
      if (next >= start + length) {
        originalEnd = index + segment.length;
        break;
      }
      offset = next;
    }
  }
  const excerptStart = Math.max(0, originalStart - 120);
  const lineContent = line.slice(excerptStart, excerptStart + 500);
  return {
    lineContent,
    startIndex: originalStart - excerptStart,
    endIndex: Math.min(originalEnd - excerptStart, lineContent.length),
  };
}

interface StoredBindingFile {
  schemaVersion: 2;
  binding: LocalVaultBindingClientDTO;
}

interface VaultReadScope {
  binding: LocalVaultBindingClientDTO;
  root: string;
  generation: number;
  signal?: AbortSignal;
}

interface CachedVaultNote {
  absolutePath: string;
  version: string;
  note: LocalVaultNoteDTO;
  bytes: number;
}

interface VaultCatalog {
  scope: VaultReadScope;
  scan: ScanLocalVaultRes;
  byId: Map<string, LocalVaultNoteSummaryDTO[]>;
  incomplete: LocalVaultRuntimeError | null;
}

interface WriteLedgerEntry {
  requestId: string;
  proposalId: string;
  proposalRevision: number;
  knowledgeDocumentId: string;
  relativePath: string;
  createdAt: number;
}

interface WriteLedger {
  schemaVersion: 2;
  entries: WriteLedgerEntry[];
}

export interface LocalVaultPlatform {
  selectDirectory(options: { suggestedPath?: string }): Promise<string | null>;
  openExternal(uri: string): Promise<void>;
}

export interface LocalVaultRuntimeOptions {
  bindingFilePath: string;
  writeLedgerFilePath: string;
  /** Stable host-owned Desktop profile identity; never a cloud account id. */
  localProfileId: string;
  platform?: LocalVaultPlatform;
  now?: () => number;
}

export class LocalVaultRuntimeError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT' | 'FORBIDDEN' | 'INTERNAL_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'LocalVaultRuntimeError';
  }
}

export interface LocalVaultElectronPort {
  getBinding(): Promise<LocalVaultBindingSnapshotDTO | null>;
  selectVault(request?: SelectLocalVaultReq): Promise<LocalVaultBindingSnapshotDTO | null>;
  detachVault(): Promise<void>;
  scanVault(): Promise<ScanLocalVaultRes>;
  readNote(request: ReadLocalVaultNoteReq): Promise<LocalVaultNoteDTO>;
  findNoteById(documentId: KnowledgeDocumentId): Promise<{
    binding: LocalVaultBindingClientDTO;
    note: LocalVaultNoteDTO;
  } | null>;
  searchVault(
    request: SearchLocalVaultReq,
    options?: { signal?: AbortSignal },
  ): Promise<SearchLocalVaultRes>;
  openInObsidian(request: OpenLocalVaultInObsidianReq): Promise<void>;
  writeConfirmedNote(request: ConfirmedLocalVaultWriteReq): Promise<ConfirmedLocalVaultWriteRes>;
  inspectSyncContent(): Promise<KnowledgeRepositoryContentState>;
  dispose(): Promise<void>;
}

/**
 * Default external-URI opener. Used only when no capability port is injected;
 * the desktop composition root injects a registry-backed `ExternalEditorPort`
 * so consumers never reach this Electron `shell` call directly.
 */
async function defaultOpenExternal(uri: string): Promise<void> {
  const { shell } = await import('electron');
  await shell.openExternal(uri);
}

/**
 * Builds the Electron-backed Local Vault platform.
 *
 * `selectDirectory` always uses Electron's native directory dialog (vault
 * selection is host-specific and not part of the external-editor capability).
 * `openExternal` defaults to Electron's `shell.openExternal` but can be
 * overridden — the desktop composition root injects the registry-owned
 * `ExternalEditorPort.openExternal` here, so `openInObsidian` routes through the
 * single capability registry instead of constructing a second Electron shell
 * provider.
 */
export function createElectronLocalVaultPlatform(
  override?: Partial<Pick<LocalVaultPlatform, 'openExternal'>>,
): LocalVaultPlatform {
  return {
    async selectDirectory({ suggestedPath }) {
      const { dialog } = await import('electron');
      const result = await dialog.showOpenDialog({
        title: 'Select Obsidian vault',
        defaultPath: suggestedPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async openExternal(uri) {
      await (override?.openExternal ?? defaultOpenExternal)(uri);
    },
  };
}

function toPortablePath(value: string): string {
  return value.split(path.sep).join('/');
}

function normalizeRelativeMarkdownPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').trim().replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new LocalVaultRuntimeError('VALIDATION_ERROR', 'Vault note path must be relative');
  }

  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || /[\u0000<>:"|?*]/.test(segment),
    )
  ) {
    throw new LocalVaultRuntimeError('VALIDATION_ERROR', 'Vault note path is invalid');
  }
  if (!/\.md$/i.test(normalized)) {
    throw new LocalVaultRuntimeError('VALIDATION_ERROR', 'Vault notes must use the .md extension');
  }
  return segments.join('/');
}

function assertContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new LocalVaultRuntimeError('FORBIDDEN', 'Path escapes the selected Vault');
  }
}

function extractOutgoingLinks(markdown: string): string[] {
  const links = new Set<string>();
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const match of withoutCode.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = match[1]?.split('|', 1)[0]?.split('#', 1)[0]?.trim();
    if (target) links.add(target);
  }
  return [...links];
}

function extractTitle(
  relativePath: string,
  markdownBody: string,
  frontmatter: Record<string, unknown>,
) {
  if (typeof frontmatter['title'] === 'string' && frontmatter['title'].trim()) {
    return frontmatter['title'].trim();
  }
  const heading = markdownBody.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.basename(relativePath, path.extname(relativePath));
}

function readStableKnowledgeDocumentId(
  frontmatter: Record<string, unknown>,
): LocalVaultNoteDTO['knowledgeDocumentId'] {
  const marker = frontmatter['memoflow_id'];
  if (marker === undefined || marker === null) return null;

  const parsed = KnowledgeDocumentIdSchema.safeParse(marker);
  if (!parsed.success) {
    throw new LocalVaultRuntimeError(
      'CONFLICT',
      'Vault note contains an invalid memoflow_id marker',
    );
  }
  return parsed.data;
}

function extractTags(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter['tags'];
  const tags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [
    ...new Set(
      tags
        .filter((item): item is string => typeof item === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function buildExcerpt(markdownBody: string): string {
  return markdownBody
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.promises.rename(temporaryPath, filePath);
}

export class LocalVaultRuntime implements LocalVaultElectronPort {
  private readonly platform: LocalVaultPlatform;
  private readonly now: () => number;
  private generation = 0;
  private disposed = false;
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly noteCache = new Map<string, CachedVaultNote>();
  private cachedNoteBytes = 0;
  private catalogFlight: { generation: number; promise: Promise<VaultCatalog | null> } | null =
    null;

  constructor(private readonly options: LocalVaultRuntimeOptions) {
    this.platform = options.platform ?? createElectronLocalVaultPlatform();
    this.now = options.now ?? Date.now;
  }

  async getBinding(): Promise<LocalVaultBindingSnapshotDTO | null> {
    await this.mutationTail;
    const generation = this.generation;
    this.assertGeneration(generation);
    const stored = await this.loadBinding();
    this.assertGeneration(generation);
    if (!stored || stored.binding.detachedAt !== null) return null;
    const health = await this.observeHealth(stored.binding);
    this.assertGeneration(generation);
    return {
      binding: stored.binding,
      health,
    };
  }

  async selectVault(
    request: SelectLocalVaultReq = {},
  ): Promise<LocalVaultBindingSnapshotDTO | null> {
    this.assertGeneration(this.generation);
    const selectedPath = await this.platform.selectDirectory({
      suggestedPath: request.suggestedPath,
    });
    if (!selectedPath) return this.getBinding();

    const canonicalRoot = await fs.promises.realpath(selectedPath);
    const stat = await fs.promises.stat(canonicalRoot);
    if (!stat.isDirectory()) {
      throw new LocalVaultRuntimeError('VALIDATION_ERROR', 'Selected Vault must be a directory');
    }

    return this.runMutation(() => this.bindDirectory(canonicalRoot));
  }

  private async bindDirectory(canonicalRoot: string): Promise<LocalVaultBindingSnapshotDTO> {
    const existing = await this.loadBinding();
    if (
      existing?.binding.detachedAt === null &&
      existing.binding.rootPath === canonicalRoot &&
      existing.binding.localProfileId === this.options.localProfileId
    ) {
      return {
        binding: existing.binding,
        health: await this.observeHealth(existing.binding),
      };
    }

    const timestamp = this.now();
    const binding: LocalVaultBindingClientDTO = {
      id: `LocalVaultBindingId_${randomUUID()}` as LocalVaultBindingClientDTO['id'],
      knowledgeSpaceId:
        existing?.binding.knowledgeSpaceId ??
        (`KnowledgeSpaceId_${randomUUID()}` as LocalVaultBindingClientDTO['knowledgeSpaceId']),
      localProfileId: this.options.localProfileId,
      rootPath: canonicalRoot,
      displayName: path.basename(canonicalRoot),
      boundAt: timestamp,
      detachedAt: null,
    };
    await this.saveBinding(binding);
    return {
      binding,
      health: {
        bindingId: binding.id,
        state: 'Available',
        observedAt: timestamp,
        detail: null,
      },
    };
  }

  async detachVault(): Promise<void> {
    await this.runMutation(async () => {
      const stored = await this.loadBinding();
      if (!stored || stored.binding.detachedAt !== null) return;
      await this.saveBinding({
        ...stored.binding,
        detachedAt: this.now(),
      });
    });
  }

  async scanVault(): Promise<ScanLocalVaultRes> {
    const catalog = await this.getCatalog();
    if (!catalog) throw new LocalVaultRuntimeError('NOT_FOUND', 'No local Vault is selected');
    this.assertScope(catalog.scope);
    return structuredClone(catalog.scan);
  }

  private async getCatalog(): Promise<VaultCatalog | null> {
    const generation = this.generation;
    if (this.catalogFlight?.generation === generation) return this.catalogFlight.promise;
    const flight = { generation, promise: this.buildCatalog() };
    this.catalogFlight = flight;
    try {
      return await flight.promise;
    } finally {
      if (this.catalogFlight === flight) this.catalogFlight = null;
    }
  }

  private async buildCatalog(): Promise<VaultCatalog | null> {
    const scope = await this.captureOptionalScope();
    if (!scope) return null;
    const notes: LocalVaultNoteSummaryDTO[] = [];
    const byId = new Map<string, LocalVaultNoteSummaryDTO[]>();
    const incomplete = await this.walkNotes(scope, (note) => {
      const summary = this.toSummary(note);
      notes.push(summary);
      if (summary.knowledgeDocumentId) {
        const matches = byId.get(summary.knowledgeDocumentId) ?? [];
        matches.push(summary);
        byId.set(summary.knowledgeDocumentId, matches);
      }
    });
    const scannedAt = this.now();
    return {
      scope,
      byId,
      incomplete,
      scan: {
        binding: scope.binding,
        health: {
          bindingId: scope.binding.id,
          state: 'Available',
          observedAt: scannedAt,
          detail: null,
        },
        notes,
        scannedAt,
      },
    };
  }

  private async walkNotes(
    scope: VaultReadScope,
    visit: (note: LocalVaultNoteDTO) => void,
    requireComplete = false,
  ): Promise<LocalVaultRuntimeError | null> {
    let entryCount = 0;
    const seenPaths = new Set<string>();
    let incomplete: LocalVaultRuntimeError | null = null;
    const walk = async (directory: string): Promise<void> => {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      this.assertScope(scope);
      entryCount += entries.length;
      if (entryCount > MAX_SCAN_ENTRIES) {
        throw new LocalVaultRuntimeError(
          'VALIDATION_ERROR',
          'Vault exceeds the complete scan budget of 100,000 directory entries',
        );
      }
      entries.sort((left, right) => left.name.localeCompare(right.name));

      let batch: Promise<LocalVaultNoteDTO>[] = [];
      const flush = async () => {
        const results = await Promise.allSettled(batch);
        batch = [];
        this.assertScope(scope);
        for (const result of results) {
          if (result.status === 'fulfilled') {
            visit(result.value);
            continue;
          }
          const error: unknown = result.reason;
          if (
            requireComplete ||
            !(error instanceof LocalVaultRuntimeError) ||
            error.code === 'CONFLICT'
          ) {
            throw error;
          }
          incomplete ??= error;
        }
      };

      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) {
            await flush();
            await walk(absolutePath);
          }
          continue;
        }
        if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;

        const relativePath = toPortablePath(path.relative(scope.root, absolutePath));
        seenPaths.add(relativePath);
        batch.push(this.readNoteInScope(scope, { relativePath }));
        if (batch.length === NOTE_READ_CONCURRENCY) await flush();
      }
      await flush();
    };

    await walk(scope.root);
    this.assertScope(scope);
    for (const relativePath of this.noteCache.keys()) {
      if (!seenPaths.has(relativePath)) this.forgetNote(relativePath);
    }
    return incomplete;
  }

  async readNote(request: ReadLocalVaultNoteReq): Promise<LocalVaultNoteDTO> {
    return structuredClone(await this.readNoteInScope(await this.captureScope(), request));
  }

  async findNoteById(
    documentId: KnowledgeDocumentId,
  ): ReturnType<LocalVaultElectronPort['findNoteById']> {
    const catalog = await this.getCatalog();
    if (!catalog) return null;
    this.assertScope(catalog.scope);
    if (catalog.incomplete) throw catalog.incomplete;
    const matches = catalog.byId.get(documentId) ?? [];
    if (matches.length > 1) {
      throw new LocalVaultRuntimeError(
        'CONFLICT',
        'Knowledge document identity is ambiguous in the active Local Vault',
      );
    }
    const match = matches[0];
    if (!match) return null;
    const note = await this.readNoteInScope(catalog.scope, { relativePath: match.relativePath });
    if (note.knowledgeDocumentId !== documentId) {
      throw new LocalVaultRuntimeError(
        'CONFLICT',
        'Knowledge document identity changed during lookup',
      );
    }
    return structuredClone({ binding: catalog.scope.binding, note });
  }

  async searchVault(
    request: SearchLocalVaultReq,
    options: { signal?: AbortSignal } = {},
  ): Promise<SearchLocalVaultRes> {
    this.assertGeneration(this.generation);
    const query = request.query.trim();
    if (!query) return { query, results: [] };
    const limit = Math.min(Math.max(request.limit ?? 50, 1), MAX_SEARCH_RESULTS);
    const scope = await this.captureScope(options.signal);
    const normalizedQuery = normalizeSearchValue(query);
    const terms = tokenizeSearchQuery(query).map(normalizeSearchValue);
    const ranked: Array<{
      result: SearchLocalVaultRes['results'][number];
      score: number;
      updatedAt: number;
    }> = [];

    await this.walkNotes(scope, (note) => {
      const summary = this.toSummary(note);
      const normalizedTitle = normalizeSearchValue(summary.title);
      const normalizedPath = normalizeSearchValue(summary.relativePath);
      const normalizedContent = normalizeSearchValue(note.contentMarkdown);
      if (
        !terms.every(
          (term) =>
            normalizedTitle.includes(term) ||
            normalizedPath.includes(term) ||
            normalizedContent.includes(term),
        )
      ) {
        return;
      }

      const matches: SearchLocalVaultRes['results'][number]['matches'] = [];
      for (const [index, line] of note.contentMarkdown.split(/\r?\n/).entries()) {
        const normalizedLine = normalizeSearchValue(line);
        const phraseIndex = normalizedLine.indexOf(normalizedQuery);
        const firstTermIndex = terms.reduce((best, term) => {
          const candidate = normalizedLine.indexOf(term);
          if (candidate < 0) return best;
          return best < 0 ? candidate : Math.min(best, candidate);
        }, -1);
        const startIndex = phraseIndex >= 0 ? phraseIndex : firstTermIndex;
        if (startIndex < 0) continue;
        const matchedLength =
          phraseIndex >= 0
            ? normalizedQuery.length
            : (terms.find((term) => normalizedLine.indexOf(term) === startIndex)?.length ?? 1);
        matches.push({
          lineNumber: index + 1,
          ...displayedSearchMatch(line, startIndex, matchedLength),
        });
        if (matches.length >= 5) break;
      }

      const pathSegments = normalizedPath.split('/');
      const basename =
        pathSegments[pathSegments.length - 1]?.replace(/\.md$/u, '') ?? normalizedPath;
      let score = 0;
      if (normalizedTitle === normalizedQuery) score += 2_000;
      else if (normalizedTitle.startsWith(normalizedQuery)) score += 1_200;
      else if (normalizedTitle.includes(normalizedQuery)) score += 800;
      if (basename === normalizedQuery) score += 1_500;
      else if (basename.startsWith(normalizedQuery)) score += 900;
      else if (normalizedPath.includes(normalizedQuery)) score += 500;
      for (const term of terms) {
        if (normalizedTitle === term) score += 300;
        else if (normalizedTitle.startsWith(term)) score += 180;
        else if (normalizedTitle.includes(term)) score += 120;
        if (basename.includes(term)) score += 100;
        else if (normalizedPath.includes(term)) score += 60;
        if (normalizedContent.includes(term)) score += 12;
      }
      ranked.push({
        result: { note: summary, matches },
        score,
        updatedAt: Number(summary.updatedAt),
      });
    });

    return {
      query,
      results: ranked
        .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
        .slice(0, limit)
        .map(({ result }) => result),
    };
  }

  async openInObsidian(request: OpenLocalVaultInObsidianReq): Promise<void> {
    const scope = await this.captureScope();
    const targetPath = request.relativePath
      ? await this.resolveExistingNotePath(scope, request.relativePath)
      : scope.root;
    this.assertScope(scope);
    const search = new URLSearchParams({ path: targetPath });
    await this.platform.openExternal(`obsidian://open?${search.toString()}`);
  }

  async writeConfirmedNote(
    request: ConfirmedLocalVaultWriteReq,
  ): Promise<ConfirmedLocalVaultWriteRes> {
    const scope = await this.captureScope();
    return this.runMutation(() => {
      this.assertScope(scope);
      return this.writeNoteInScope(scope, request);
    });
  }

  private async writeNoteInScope(
    scope: VaultReadScope,
    request: ConfirmedLocalVaultWriteReq,
  ): Promise<ConfirmedLocalVaultWriteRes> {
    if (!request.proposalId.trim() || !request.requestId.trim() || request.proposalRevision < 1) {
      throw new LocalVaultRuntimeError(
        'VALIDATION_ERROR',
        'Confirmed proposal metadata is required',
      );
    }
    const parsedDocumentId = KnowledgeDocumentIdSchema.safeParse(request.knowledgeDocumentId);
    if (!parsedDocumentId.success) {
      throw new LocalVaultRuntimeError(
        'VALIDATION_ERROR',
        'Confirmed knowledge document identity is invalid',
      );
    }
    const knowledgeDocumentId = parsedDocumentId.data;
    const parsedRequestedMarkdown = matter(request.contentMarkdown, {});
    const requestedFrontmatter = parsedRequestedMarkdown.data as Record<string, unknown>;
    const embeddedDocumentId = requestedFrontmatter['memoflow_id'];
    if (embeddedDocumentId !== undefined && embeddedDocumentId !== knowledgeDocumentId) {
      throw new LocalVaultRuntimeError(
        'CONFLICT',
        'Confirmed note contains a different memoflow_id marker',
      );
    }
    const contentMarkdown = matter.stringify(
      parsedRequestedMarkdown.content,
      { ...requestedFrontmatter, memoflow_id: knowledgeDocumentId },
      {},
    );
    const contentBytes = Buffer.byteLength(contentMarkdown, 'utf8');
    if (contentBytes === 0 || contentBytes > MAX_WRITE_BYTES) {
      throw new LocalVaultRuntimeError('VALIDATION_ERROR', 'Vault note content size is invalid');
    }

    const relativePath = normalizeRelativeMarkdownPath(request.relativePath);
    const ledger = await this.loadLedger();
    const replay = ledger.entries.find((entry) => entry.requestId === request.requestId);
    if (replay) {
      if (
        replay.proposalId !== request.proposalId ||
        replay.proposalRevision !== request.proposalRevision ||
        replay.knowledgeDocumentId !== knowledgeDocumentId ||
        replay.relativePath !== relativePath
      ) {
        throw new LocalVaultRuntimeError(
          'CONFLICT',
          'Write request ID was reused for another proposal',
        );
      }
      return {
        note: structuredClone(await this.readNoteInScope(scope, { relativePath })),
        created: false,
      };
    }

    // A UI scan may omit unreadable files; absence is only authoritative after
    // a complete identity check. Mutations share one queue with binding changes.
    await this.walkNotes(
      scope,
      (note) => {
        if (note.knowledgeDocumentId === knowledgeDocumentId) {
          throw new LocalVaultRuntimeError(
            'CONFLICT',
            'Knowledge document identity already exists in this Vault',
          );
        }
      },
      true,
    );

    const root = scope.root;
    const candidate = path.resolve(root, relativePath);
    assertContained(root, candidate);
    await this.ensureSafeParent(root, path.dirname(candidate));
    this.assertScope(scope);

    let handle: fs.promises.FileHandle | null = null;
    try {
      handle = await fs.promises.open(candidate, 'wx', 0o600);
      await handle.writeFile(contentMarkdown, 'utf8');
      await handle.sync();
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        throw new LocalVaultRuntimeError('CONFLICT', 'A Vault note already exists at this path');
      }
      throw error;
    } finally {
      await handle?.close();
    }

    ledger.entries.push({
      requestId: request.requestId,
      proposalId: request.proposalId,
      proposalRevision: request.proposalRevision,
      knowledgeDocumentId: knowledgeDocumentId,
      relativePath,
      createdAt: this.now(),
    });
    ledger.entries = ledger.entries.slice(-1000);
    await writeJsonAtomically(this.options.writeLedgerFilePath, ledger);
    return {
      note: structuredClone(await this.readNoteInScope(scope, { relativePath })),
      created: true,
    };
  }

  async inspectSyncContent(): Promise<KnowledgeRepositoryContentState> {
    const scope = await this.captureScope();

    const containsUserContent = async (directory: string): Promise<boolean> => {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      this.assertScope(scope);
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (SYNC_IGNORED_DIRECTORIES.has(entry.name)) continue;
          if (await containsUserContent(absolutePath)) return true;
          continue;
        }
        if (!entry.isFile() || isTemporaryFile(entry.name)) continue;
        return true;
      }
      return false;
    };

    return (await containsUserContent(scope.root)) ? 'NonEmpty' : 'Empty';
  }

  private async observeHealth(binding: LocalVaultBindingClientDTO): Promise<LocalVaultHealthDTO> {
    let state: LocalVaultHealthDTO['state'] = 'Available';
    let detail: string | null = null;
    try {
      const stat = await fs.promises.stat(binding.rootPath);
      if (!stat.isDirectory()) {
        state = 'Unreadable';
        detail = 'Selected Vault root is not a directory';
      } else {
        await fs.promises.access(binding.rootPath, fs.constants.R_OK);
      }
    } catch (error) {
      state = isMissing(error) ? 'Missing' : 'Unreadable';
      detail =
        state === 'Missing'
          ? 'Selected Vault root is missing'
          : 'Selected Vault root is unreadable';
    }
    return {
      bindingId: binding.id,
      state,
      observedAt: this.now(),
      detail,
    };
  }

  private async captureOptionalScope(): Promise<VaultReadScope | null> {
    const generation = this.generation;
    const snapshot = await this.getBinding();
    if (!snapshot) return null;
    if (snapshot.health.state !== 'Available') {
      throw new LocalVaultRuntimeError(
        'NOT_FOUND',
        `Local Vault is ${snapshot.health.state.toLowerCase()}`,
      );
    }
    const binding = snapshot.binding;
    const root = await fs.promises.realpath(binding.rootPath);
    const scope = { binding, root, generation };
    this.assertScope(scope);
    return scope;
  }

  private async captureScope(signal?: AbortSignal): Promise<VaultReadScope> {
    const scope = await this.captureOptionalScope();
    if (!scope) throw new LocalVaultRuntimeError('NOT_FOUND', 'No local Vault is selected');
    scope.signal = signal;
    this.assertScope(scope);
    return scope;
  }

  private runMutation<T>(operation: () => Promise<T>): Promise<T> {
    this.catalogFlight = null;
    const task = this.mutationTail.then(() => {
      this.assertGeneration(this.generation);
      return operation();
    });
    this.mutationTail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private assertScope(scope: VaultReadScope): void {
    this.assertGeneration(scope.generation);
    if (scope.signal?.aborted) {
      throw new LocalVaultRuntimeError('CONFLICT', 'Vault operation was cancelled');
    }
  }

  private assertGeneration(generation: number): void {
    if (this.disposed || generation !== this.generation) {
      throw new LocalVaultRuntimeError(
        'CONFLICT',
        'The selected Vault changed during the operation',
      );
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.invalidateProjection();
    // Finish any write already past its exclusive file creation before releasing the profile.
    await this.mutationTail;
  }

  private invalidateProjection(): void {
    this.generation++;
    this.catalogFlight = null;
    this.noteCache.clear();
    this.cachedNoteBytes = 0;
  }

  private async resolveExistingNotePath(
    scope: VaultReadScope,
    relativePathValue: string,
  ): Promise<string> {
    const relativePath = normalizeRelativeMarkdownPath(relativePathValue);
    const root = scope.root;
    const candidate = path.resolve(root, relativePath);
    assertContained(root, candidate);
    let canonicalPath: string;
    try {
      canonicalPath = await fs.promises.realpath(candidate);
    } catch (error) {
      if (isMissing(error)) {
        throw new LocalVaultRuntimeError('NOT_FOUND', 'Vault note was not found');
      }
      throw error;
    }
    this.assertScope(scope);
    assertContained(root, canonicalPath);
    return canonicalPath;
  }

  private async readNoteInScope(
    scope: VaultReadScope,
    request: ReadLocalVaultNoteReq,
  ): Promise<LocalVaultNoteDTO> {
    this.assertScope(scope);
    const relativePath = normalizeRelativeMarkdownPath(request.relativePath);
    const absolutePath = await this.resolveExistingNotePath(scope, relativePath);
    const stat = await fs.promises.stat(absolutePath);
    this.assertScope(scope);
    if (!stat.isFile() || stat.size > MAX_NOTE_BYTES) {
      this.forgetNote(relativePath);
      throw new LocalVaultRuntimeError(
        'VALIDATION_ERROR',
        'Vault note is not a readable Markdown file',
      );
    }
    const version = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    const cached = this.noteCache.get(relativePath);
    if (cached?.absolutePath === absolutePath && cached.version === version) {
      this.noteCache.delete(relativePath);
      this.noteCache.set(relativePath, cached);
      return cached.note;
    }
    this.forgetNote(relativePath);
    const contentMarkdown = await fs.promises.readFile(absolutePath, 'utf8');
    this.assertScope(scope);
    // Explicit options bypass gray-matter's unbounded process-global text cache.
    const parsed = matter(contentMarkdown, {});
    const frontmatter = parsed.data as Record<string, unknown>;
    const note: LocalVaultNoteDTO = {
      relativePath,
      knowledgeDocumentId: readStableKnowledgeDocumentId(frontmatter),
      title: extractTitle(relativePath, parsed.content, frontmatter),
      excerpt: buildExcerpt(parsed.content),
      tags: extractTags(frontmatter),
      outgoingLinks: extractOutgoingLinks(parsed.content),
      size: stat.size,
      updatedAt: stat.mtimeMs as LocalVaultNoteDTO['updatedAt'],
      contentMarkdown,
      frontmatter,
    };
    const bytes = serialize(note).byteLength * 2 + absolutePath.length * 2 + 256;
    if (bytes <= MAX_CACHED_NOTE_BYTES) {
      this.forgetNote(relativePath);
      while (this.cachedNoteBytes + bytes > MAX_CACHED_NOTE_BYTES) {
        const oldestPath = this.noteCache.keys().next().value;
        if (oldestPath === undefined) break;
        this.forgetNote(oldestPath);
      }
      this.noteCache.set(relativePath, { absolutePath, version, note, bytes });
      this.cachedNoteBytes += bytes;
    }
    return note;
  }

  private forgetNote(relativePath: string): void {
    const cached = this.noteCache.get(relativePath);
    if (!cached) return;
    this.cachedNoteBytes -= cached.bytes;
    this.noteCache.delete(relativePath);
  }

  private toSummary(note: LocalVaultNoteDTO): LocalVaultNoteSummaryDTO {
    const { contentMarkdown: _contentMarkdown, frontmatter: _frontmatter, ...summary } = note;
    return { ...summary, tags: [...summary.tags], outgoingLinks: [...summary.outgoingLinks] };
  }

  private async ensureSafeParent(root: string, parent: string): Promise<void> {
    assertContained(root, parent);
    const relative = path.relative(root, parent);
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        const stat = await fs.promises.lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new LocalVaultRuntimeError('FORBIDDEN', 'Vault write path contains an unsafe link');
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
        await fs.promises.mkdir(current, { mode: 0o700 });
      }
    }
  }

  private async loadBinding(): Promise<StoredBindingFile | null> {
    try {
      const raw = JSON.parse(
        await fs.promises.readFile(this.options.bindingFilePath, 'utf8'),
      ) as unknown;
      if (
        !raw ||
        typeof raw !== 'object' ||
        (raw as { schemaVersion?: unknown }).schemaVersion !== 2
      ) {
        // ADR-111 destructive cutover: schemaVersion 1 is unsupported and never migrated.
        return null;
      }
      const candidate = raw as { schemaVersion: 2; binding?: unknown };
      const parsed = LocalVaultBindingClientDTOSchema.safeParse(candidate.binding);
      if (!parsed.success || parsed.data.localProfileId !== this.options.localProfileId) {
        throw new LocalVaultRuntimeError(
          'INTERNAL_ERROR',
          'Local Vault binding metadata is invalid for this profile',
        );
      }
      return { schemaVersion: 2, binding: parsed.data };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private async saveBinding(binding: LocalVaultBindingClientDTO): Promise<void> {
    this.invalidateProjection();
    await writeJsonAtomically(this.options.bindingFilePath, { schemaVersion: 2, binding });
  }

  private async loadLedger(): Promise<WriteLedger> {
    try {
      const parsed = JSON.parse(
        await fs.promises.readFile(this.options.writeLedgerFilePath, 'utf8'),
      ) as WriteLedger;
      return parsed.schemaVersion === 2 && Array.isArray(parsed.entries)
        ? parsed
        : { schemaVersion: 2, entries: [] };
    } catch (error) {
      if (isMissing(error)) return { schemaVersion: 2, entries: [] };
      throw error;
    }
  }
}

export function createLocalVaultRuntime(options: LocalVaultRuntimeOptions): LocalVaultRuntime {
  return new LocalVaultRuntime(options);
}
