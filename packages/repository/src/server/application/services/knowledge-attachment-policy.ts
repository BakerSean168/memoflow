import { MAX_KNOWLEDGE_ATTACHMENT_BYTES } from '@memoflow/repository-contracts';

const MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

const EXCLUDED_ROOTS = new Set([
  '.git',
  '.memory-flow',
  '.obsidian',
  '.trash',
  '.Trash',
  'node_modules',
]);

export { MAX_KNOWLEDGE_ATTACHMENT_BYTES };

export function resolveKnowledgeAttachmentMediaType(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    EXCLUDED_ROOTS.has(segments[0] ?? '')
  ) {
    return null;
  }
  const fileName = segments[segments.length - 1] ?? '';
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex < 0) return null;
  return MEDIA_TYPES_BY_EXTENSION[fileName.slice(extensionIndex).toLowerCase()] ?? null;
}
