import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const ADR_DIR = path.join(ROOT, 'docs/internals/decisions');
const ADR_INDEX = path.join(ADR_DIR, 'README.md');
const RETIRED_LEGACY_WORKSPACE = ['.', 'open', 'code'].join('');

const ENTRY_DOCS = [
  'AGENTS.md',
  'README.md',
  'docs/README.md',
  'docs/internals/README.md',
  'docs/internals/decisions/README.md',
  'docs/internals/standards/README.md',
  'docs/internals/testing/README.md',
  'docs/internals/governance/README.md',
  'docs/operations/README.md',
];

const CONFIG_FILES = ['nx.json', 'eslint.config.ts', 'package.json', 'project.json'];

const AGENT_SHIMS = ['CLAUDE.md'];

const TEXT_FILE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.ts',
  '.txt',
  '.yaml',
  '.yml',
]);

const SKIP_DIRS = new Set([
  '.cache',
  '.pytest_cache',
  '.pytest-temp',
  '.git',
  '.nx',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'dist-electron',
  'dist-renderer',
  'node_modules',
  'reports',
]);

const errors = [];

await checkCanonicalAgentFiles();
await checkRetiredPlanWorkspace();
await checkRetiredLegacyWorkspace();
await checkLegacyWorkspaceReferences();
const adrFiles = await checkAdrFiles();
await checkAdrIndex(adrFiles);
await checkEntryDocLinks();
await checkLegacyConfigReferences();
await checkProjectTags();
await checkLocalEslintConfigs();

if (errors.length > 0) {
  console.error(`[governance-check] failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('[governance-check] passed.');

async function checkCanonicalAgentFiles() {
  await expectExists(path.join(ROOT, 'AGENTS.md'), '缺少 AGENTS.md。');

  for (const shimPath of AGENT_SHIMS) {
    const content = await readFile(path.join(ROOT, shimPath), 'utf8');
    if (!content.includes('@AGENTS.md')) {
      errors.push(`${shimPath} 必须使用 @AGENTS.md 导入仓库协作规范。`);
    }
  }

  const copilotInstructions = await readFile(
    path.join(ROOT, '.github/copilot-instructions.md'),
    'utf8',
  );
  if (!copilotInstructions.includes('AGENTS.md')) {
    errors.push('.github/copilot-instructions.md 必须引用 AGENTS.md。');
  }
}

async function checkRetiredPlanWorkspace() {
  try {
    await stat(path.join(ROOT, 'docs/plan'));
    errors.push('docs/plan 已退役：当前任务仅使用 GitHub Issue，历史文档通过 Git 追溯。');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function checkRetiredLegacyWorkspace() {
  const retiredWorkspaceDir = path.join(ROOT, RETIRED_LEGACY_WORKSPACE);

  try {
    const result = await stat(retiredWorkspaceDir);
    if (!result.isDirectory()) {
      return;
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  errors.push('退役的历史辅助工作区仍然存在。');
}

async function checkLegacyWorkspaceReferences() {
  for await (const file of walk(ROOT)) {
    const relativePath = toRelative(file);
    if (relativePath === 'tools/docs/check-docs-config.mjs') {
      continue;
    }

    const content = await readFile(file, 'utf8');
    if (content.includes(RETIRED_LEGACY_WORKSPACE)) {
      errors.push(`${relativePath} 仍然引用退役的历史辅助工作区。`);
    }
  }
}

async function checkAdrFiles() {
  const filenames = await readdir(ADR_DIR);
  const adrFiles = filenames
    .filter((filename) => filename.endsWith('.md') && filename !== 'README.md')
    .sort();

  const seenNumbers = new Map();
  const adrEntries = [];

  for (const filename of adrFiles) {
    const relativePath = path.join('docs/internals/decisions', filename);
    const fullPath = path.join(ADR_DIR, filename);
    const filenameMatch = /^ADR-(\d{3})-[a-z0-9-]+\.md$/.exec(filename);
    if (!filenameMatch) {
      errors.push(`${relativePath} 文件名必须匹配 ADR-XXX-kebab-case.md。`);
      continue;
    }

    const content = await readFile(fullPath, 'utf8');
    const titleMatch = content.match(/^# ADR-(\d{3}): .+/m);
    if (!titleMatch) {
      errors.push(`${relativePath} 缺少规范的一级标题 "# ADR-XXX: ..."。`);
      continue;
    }

    const fileNumber = filenameMatch[1];
    const titleNumber = titleMatch[1];
    if (fileNumber !== titleNumber) {
      errors.push(
        `${relativePath} 的文件编号 ADR-${fileNumber} 与标题编号 ADR-${titleNumber} 不一致。`,
      );
    }

    const duplicate = seenNumbers.get(fileNumber);
    if (duplicate) {
      errors.push(`${relativePath} 与 ${duplicate} 使用了重复的 ADR 编号 ADR-${fileNumber}。`);
    } else {
      seenNumbers.set(fileNumber, relativePath);
    }

    adrEntries.push({
      filename,
      relativePath,
      number: fileNumber,
    });
  }

  return adrEntries;
}

async function checkAdrIndex(adrFiles) {
  const indexContent = await readFile(ADR_INDEX, 'utf8');
  const linkedNumbers = new Set();
  const matches = [...indexContent.matchAll(/\[(ADR-\d{3})\]\((\.\/[^)]+\.md)\)/g)];

  for (const match of matches) {
    const label = match[1];
    const href = match[2];
    const targetPath = path.resolve(ADR_DIR, href);
    const relativeTarget = toRelative(targetPath);
    await expectExists(targetPath, `ADR 索引指向了不存在的文件 ${href}`);

    const basename = path.basename(targetPath);
    if (!basename.startsWith(`${label}-`)) {
      errors.push(`ADR 索引中的 ${label} 指向 ${relativeTarget}，编号与文件名不一致。`);
    }

    linkedNumbers.add(label.slice(4));
  }

  for (const adrFile of adrFiles) {
    if (!linkedNumbers.has(adrFile.number)) {
      errors.push(`${adrFile.relativePath} 没有出现在 docs/internals/decisions/README.md 索引中。`);
    }
  }
}

async function checkEntryDocLinks() {
  for (const docPath of ENTRY_DOCS) {
    const fullPath = path.join(ROOT, docPath);
    const content = await readFile(fullPath, 'utf8');
    const matches = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];

    for (const match of matches) {
      const href = match[1];
      if (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('#') ||
        href.startsWith('mailto:')
      ) {
        continue;
      }

      const normalizedHref = href.split('#')[0];
      if (!normalizedHref || !normalizedHref.endsWith('.md')) {
        continue;
      }

      const targetPath = path.resolve(path.dirname(fullPath), normalizedHref);
      await expectExists(targetPath, `${docPath} 包含无效 Markdown 链接 ${href}`);
    }
  }
}

async function checkLegacyConfigReferences() {
  for (const configFile of CONFIG_FILES) {
    const content = await readFile(path.join(ROOT, configFile), 'utf8');
    if (content.includes('.eslintrc.json')) {
      errors.push(`${configFile} 仍然引用 .eslintrc.json。`);
    }
    if (content.includes('eslint.config.js')) {
      errors.push(`${configFile} 仍然引用 eslint.config.js。`);
    }
  }
}

async function checkProjectTags() {
  for await (const file of walk(ROOT)) {
    const relativePath = toRelative(file);
    if (!relativePath.endsWith('project.json')) {
      continue;
    }

    if (
      !relativePath.startsWith('apps/') &&
      !relativePath.startsWith('packages/') &&
      !relativePath.startsWith('tools/')
    ) {
      continue;
    }

    const content = await readFile(file, 'utf8');
    const projectConfig = JSON.parse(content);
    const tags = Array.isArray(projectConfig.tags) ? projectConfig.tags : [];
    const requiresLayer = relativePath.startsWith('apps/') || relativePath.startsWith('packages/');

    if (!tags.some((tag) => tag.startsWith('scope:'))) {
      errors.push(`${relativePath} 缺少 scope:* tag。`);
    }
    if (!tags.some((tag) => tag.startsWith('type:'))) {
      errors.push(`${relativePath} 缺少 type:* tag。`);
    }
    if (requiresLayer && !tags.some((tag) => tag.startsWith('layer:'))) {
      errors.push(`${relativePath} 缺少 layer:* tag。`);
    }
  }
}

async function checkLocalEslintConfigs() {
  for await (const file of walk(ROOT)) {
    const relativePath = toRelative(file);
    if (relativePath === 'eslint.config.ts') {
      continue;
    }
    if (!/^(.+\/)?eslint\.config\.(js|mjs|cjs|ts|mts|cts)$/.test(relativePath)) {
      continue;
    }

    const content = await readFile(file, 'utf8');
    if (!content.includes('eslint.config.ts')) {
      errors.push(`${relativePath} 必须以根 eslint.config.ts 为基线。`);
    }
  }
}

async function expectExists(targetPath, message) {
  try {
    await access(targetPath);
  } catch {
    errors.push(message);
  }
}

async function expectDirectory(targetPath, message) {
  try {
    const result = await stat(targetPath);
    if (!result.isDirectory()) {
      errors.push(message);
    }
  } catch {
    errors.push(message);
  }
}

async function* walk(currentPath) {
  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (!TEXT_FILE_EXTENSIONS.has(extension)) {
      continue;
    }

    yield fullPath;
  }
}

function toRelative(targetPath) {
  return path.relative(ROOT, targetPath) || '.';
}
