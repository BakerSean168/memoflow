import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { LocalVaultBindingClientDTOSchema } from '@memoflow/contracts/repository';
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
const MAX_SCAN_NOTES = 10_000;
const MAX_SEARCH_RESULTS = 200;
const IGNORED_DIRECTORIES = new Set(['.git', '.obsidian', '.trash', '.Trash', 'node_modules']);
const SYNC_IGNORED_DIRECTORIES = new Set([...IGNORED_DIRECTORIES, '.memory-flow']);

interface StoredBindingFile {
  schemaVersion: 2;
  binding: LocalVaultBindingClientDTO;
}

interface WriteLedgerEntry {
  requestId: string;
  proposalId: string;
  proposalRevision: number;
  relativePath: string;
  createdAt: number;
}

interface WriteLedger {
  schemaVersion: 1;
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
  searchVault(request: SearchLocalVaultReq): Promise<SearchLocalVaultRes>;
  openInObsidian(request: OpenLocalVaultInObsidianReq): Promise<void>;
  writeConfirmedNote(request: ConfirmedLocalVaultWriteReq): Promise<ConfirmedLocalVaultWriteRes>;
  inspectSyncContent(): Promise<KnowledgeRepositoryContentState>;
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

  constructor(private readonly options: LocalVaultRuntimeOptions) {
    this.platform = options.platform ?? createElectronLocalVaultPlatform();
    this.now = options.now ?? Date.now;
  }

  async getBinding(): Promise<LocalVaultBindingSnapshotDTO | null> {
    const stored = await this.loadBinding();
    if (!stored || stored.binding.detachedAt !== null) return null;
    return {
      binding: stored.binding,
      health: await this.observeHealth(stored.binding),
    };
  }

  async selectVault(
    request: SelectLocalVaultReq = {},
  ): Promise<LocalVaultBindingSnapshotDTO | null> {
    const selectedPath = await this.platform.selectDirectory({
      suggestedPath: request.suggestedPath,
    });
    if (!selectedPath) return this.getBinding();

    const canonicalRoot = await fs.promises.realpath(selectedPath);
    const stat = await fs.promises.stat(canonicalRoot);
    if (!stat.isDirectory()) {
      throw new LocalVaultRuntimeError('VALIDATION_ERROR', 'Selected Vault must be a directory');
    }

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
    const stored = await this.loadBinding();
    if (!stored || stored.binding.detachedAt !== null) return;
    await this.saveBinding({
      ...stored.binding,
      detachedAt: this.now(),
    });
  }

  async scanVault(): Promise<ScanLocalVaultRes> {
    const binding = await this.requireAvailableBinding();
    const root = await fs.promises.realpath(binding.rootPath);
    const notes: LocalVaultNoteSummaryDTO[] = [];

    const walk = async (directory: string): Promise<void> => {
      if (notes.length >= MAX_SCAN_NOTES) return;
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of entries) {
        if (notes.length >= MAX_SCAN_NOTES || entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolutePath);
          continue;
        }
        if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;

        const relativePath = toPortablePath(path.relative(root, absolutePath));
        try {
          const note = await this.readNoteFromBinding(binding, { relativePath });
          notes.push(this.toSummary(note));
        } catch (error) {
          if (!(error instanceof LocalVaultRuntimeError)) throw error;
        }
      }
    };

    await walk(root);
    const scannedAt = this.now();
    return {
      binding,
      health: {
        bindingId: binding.id,
        state: 'Available',
        observedAt: scannedAt,
        detail: null,
      },
      notes,
      scannedAt,
    };
  }

  async readNote(request: ReadLocalVaultNoteReq): Promise<LocalVaultNoteDTO> {
    return this.readNoteFromBinding(await this.requireAvailableBinding(), request);
  }

  async searchVault(request: SearchLocalVaultReq): Promise<SearchLocalVaultRes> {
    const query = request.query.trim();
    if (!query) return { query, results: [] };
    const limit = Math.min(Math.max(request.limit ?? 50, 1), MAX_SEARCH_RESULTS);
    const scanned = await this.scanVault();
    const normalizedQuery = query.toLocaleLowerCase();
    const results: SearchLocalVaultRes['results'] = [];

    for (const summary of scanned.notes) {
      if (results.length >= limit) break;
      const note = await this.readNote({ relativePath: summary.relativePath });
      const matches: SearchLocalVaultRes['results'][number]['matches'] = [];
      for (const [index, line] of note.contentMarkdown.split(/\r?\n/).entries()) {
        const startIndex = line.toLocaleLowerCase().indexOf(normalizedQuery);
        if (startIndex >= 0) {
          matches.push({
            lineNumber: index + 1,
            lineContent: line.slice(0, 500),
            startIndex,
            endIndex: startIndex + query.length,
          });
        }
      }
      if (
        matches.length ||
        summary.title.toLocaleLowerCase().includes(normalizedQuery) ||
        summary.relativePath.toLocaleLowerCase().includes(normalizedQuery)
      ) {
        results.push({ note: summary, matches });
      }
    }
    return { query, results };
  }

  async openInObsidian(request: OpenLocalVaultInObsidianReq): Promise<void> {
    const binding = await this.requireAvailableBinding();
    const targetPath = request.relativePath
      ? await this.resolveExistingNotePath(binding, request.relativePath)
      : await fs.promises.realpath(binding.rootPath);
    const search = new URLSearchParams({ path: targetPath });
    await this.platform.openExternal(`obsidian://open?${search.toString()}`);
  }

  async writeConfirmedNote(
    request: ConfirmedLocalVaultWriteReq,
  ): Promise<ConfirmedLocalVaultWriteRes> {
    if (!request.proposalId.trim() || !request.requestId.trim() || request.proposalRevision < 1) {
      throw new LocalVaultRuntimeError(
        'VALIDATION_ERROR',
        'Confirmed proposal metadata is required',
      );
    }
    const contentBytes = Buffer.byteLength(request.contentMarkdown, 'utf8');
    if (contentBytes === 0 || contentBytes > MAX_WRITE_BYTES) {
      throw new LocalVaultRuntimeError('VALIDATION_ERROR', 'Vault note content size is invalid');
    }

    const relativePath = normalizeRelativeMarkdownPath(request.relativePath);
    const binding = await this.requireAvailableBinding();
    const ledger = await this.loadLedger();
    const replay = ledger.entries.find((entry) => entry.requestId === request.requestId);
    if (replay) {
      if (
        replay.proposalId !== request.proposalId ||
        replay.proposalRevision !== request.proposalRevision ||
        replay.relativePath !== relativePath
      ) {
        throw new LocalVaultRuntimeError(
          'CONFLICT',
          'Write request ID was reused for another proposal',
        );
      }
      return {
        note: await this.readNoteFromBinding(binding, { relativePath }),
        created: false,
      };
    }

    const root = await fs.promises.realpath(binding.rootPath);
    const candidate = path.resolve(root, relativePath);
    assertContained(root, candidate);
    await this.ensureSafeParent(root, path.dirname(candidate));

    let handle: fs.promises.FileHandle | null = null;
    try {
      handle = await fs.promises.open(candidate, 'wx', 0o600);
      await handle.writeFile(request.contentMarkdown, 'utf8');
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
      relativePath,
      createdAt: this.now(),
    });
    ledger.entries = ledger.entries.slice(-1000);
    await writeJsonAtomically(this.options.writeLedgerFilePath, ledger);
    return {
      note: await this.readNoteFromBinding(binding, { relativePath }),
      created: true,
    };
  }

  async inspectSyncContent(): Promise<KnowledgeRepositoryContentState> {
    const binding = await this.requireAvailableBinding();
    const root = await fs.promises.realpath(binding.rootPath);

    const containsUserContent = async (directory: string): Promise<boolean> => {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
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

    return (await containsUserContent(root)) ? 'NonEmpty' : 'Empty';
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

  private async requireAvailableBinding(): Promise<LocalVaultBindingClientDTO> {
    const snapshot = await this.getBinding();
    if (!snapshot) {
      throw new LocalVaultRuntimeError('NOT_FOUND', 'No local Vault is selected');
    }
    if (snapshot.health.state !== 'Available') {
      throw new LocalVaultRuntimeError(
        'NOT_FOUND',
        `Local Vault is ${snapshot.health.state.toLowerCase()}`,
      );
    }
    return snapshot.binding;
  }

  private async resolveExistingNotePath(
    binding: LocalVaultBindingClientDTO,
    relativePathValue: string,
  ): Promise<string> {
    const relativePath = normalizeRelativeMarkdownPath(relativePathValue);
    const root = await fs.promises.realpath(binding.rootPath);
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
    assertContained(root, canonicalPath);
    return canonicalPath;
  }

  private async readNoteFromBinding(
    binding: LocalVaultBindingClientDTO,
    request: ReadLocalVaultNoteReq,
  ): Promise<LocalVaultNoteDTO> {
    const relativePath = normalizeRelativeMarkdownPath(request.relativePath);
    const absolutePath = await this.resolveExistingNotePath(binding, relativePath);
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile() || stat.size > MAX_NOTE_BYTES) {
      throw new LocalVaultRuntimeError(
        'VALIDATION_ERROR',
        'Vault note is not a readable Markdown file',
      );
    }
    const contentMarkdown = await fs.promises.readFile(absolutePath, 'utf8');
    const parsed = matter(contentMarkdown);
    const frontmatter = parsed.data as Record<string, unknown>;
    return {
      relativePath,
      title: extractTitle(relativePath, parsed.content, frontmatter),
      excerpt: buildExcerpt(parsed.content),
      tags: extractTags(frontmatter),
      outgoingLinks: extractOutgoingLinks(parsed.content),
      size: stat.size,
      updatedAt: stat.mtimeMs as LocalVaultNoteDTO['updatedAt'],
      contentMarkdown,
      frontmatter,
    };
  }

  private toSummary(note: LocalVaultNoteDTO): LocalVaultNoteSummaryDTO {
    const { contentMarkdown: _contentMarkdown, frontmatter: _frontmatter, ...summary } = note;
    return summary;
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
    await writeJsonAtomically(this.options.bindingFilePath, { schemaVersion: 2, binding });
  }

  private async loadLedger(): Promise<WriteLedger> {
    try {
      const parsed = JSON.parse(
        await fs.promises.readFile(this.options.writeLedgerFilePath, 'utf8'),
      ) as WriteLedger;
      return parsed.schemaVersion === 1 && Array.isArray(parsed.entries)
        ? parsed
        : { schemaVersion: 1, entries: [] };
    } catch (error) {
      if (isMissing(error)) return { schemaVersion: 1, entries: [] };
      throw error;
    }
  }
}

export function createLocalVaultRuntime(options: LocalVaultRuntimeOptions): LocalVaultRuntime {
  return new LocalVaultRuntime(options);
}
