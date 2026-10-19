import fs from 'node:fs/promises';
import path from 'node:path';

interface FileFilters {
  filters?: Array<{ name: string; extensions: string[] }>;
}
export interface SaveTextFileRequest extends FileFilters {
  defaultFileName: string;
  content: string;
}
export type OpenTextFileRequest = FileFilters;
interface NativeDialogs {
  showSaveDialog(
    options: { defaultPath: string } & FileFilters,
  ): Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog(
    options: { defaultPath: string; properties: ['openFile'] } & FileFilters,
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
}

/** User-owned destinations are never mkdir'ed or recursively managed by MemoFlow. */
export class NativeFileDialogs {
  private readonly preferencePath: string;
  constructor(
    private readonly configDir: string,
    private readonly dialogs: NativeDialogs,
    private readonly defaultDirectory: () => string | Promise<string>,
  ) {
    this.preferencePath = path.join(configDir, 'file-dialog-directory.json');
  }
  private async initialDirectory(): Promise<string> {
    try {
      const directory: unknown = JSON.parse(await fs.readFile(this.preferencePath, 'utf8'));
      if (
        typeof directory === 'string' &&
        path.isAbsolute(directory) &&
        (await fs.stat(directory)).isDirectory()
      ) {
        await fs.access(directory);
        return directory;
      }
    } catch {
      /* A missing/inaccessible preference uses the native default. */
    }
    return this.defaultDirectory();
  }
  private async remember(filePath: string): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(this.preferencePath, JSON.stringify(path.dirname(filePath)), {
      mode: 0o600,
    });
  }
  async save(request: SaveTextFileRequest) {
    const result = await this.dialogs.showSaveDialog({
      defaultPath: path.join(await this.initialDirectory(), path.basename(request.defaultFileName)),
      filters: request.filters,
    });
    if (result.canceled || !result.filePath) return { canceled: true, filePath: null };
    await fs.writeFile(result.filePath, request.content, 'utf8');
    await this.remember(result.filePath);
    return { canceled: false, filePath: result.filePath };
  }
  async open(request?: OpenTextFileRequest) {
    const result = await this.dialogs.showOpenDialog({
      defaultPath: await this.initialDirectory(),
      properties: ['openFile'],
      filters: request?.filters,
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return { canceled: true, filePath: null, content: null };
    const content = await fs.readFile(filePath, 'utf8');
    await this.remember(filePath);
    return { canceled: false, filePath, content };
  }
}
