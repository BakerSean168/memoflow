import path from 'node:path';
import matter from 'gray-matter';
import type {
  GetKnowledgeNoteLinkGraphReq,
  KnowledgeNoteLinkGraphEdgeDTO,
  KnowledgeNoteLinkGraphNodeDTO,
  KnowledgeNoteLinkGraphResponse,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteUnresolvedLinkDTO,
} from '@memoflow/repository-contracts';

interface ParsedLink {
  id: string;
  sourceProjectionId: string;
  target: string;
  alias: string | null;
  section: string | null;
  displayText: string;
  context: string;
  embedded: boolean;
  targetProjectionId: string | null;
  unresolvedReason: KnowledgeNoteUnresolvedLinkDTO['reason'] | null;
}

interface NoteIndex {
  byId: Map<string, KnowledgeNoteProjectionClientDTO>;
  byPath: Map<string, KnowledgeNoteProjectionClientDTO>;
  byLooseKey: Map<string, KnowledgeNoteProjectionClientDTO[]>;
}

const WIKI_LINK_PATTERN = /(!)?\[\[([^\]\r\n]+)\]\]/g;
const MAX_GRAPH_EDGES = 400;
const MAX_UNRESOLVED_LINKS = 100;

function normalizeLinkValue(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.md$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function withoutMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

function noteAliases(note: KnowledgeNoteProjectionClientDTO): string[] {
  const value = note.frontmatter['aliases'] ?? note.frontmatter['alias'];
  const aliases = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return aliases.filter(
    (alias): alias is string => typeof alias === 'string' && Boolean(alias.trim()),
  );
}

function buildIndex(notes: KnowledgeNoteProjectionClientDTO[]): NoteIndex {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const byPath = new Map<string, KnowledgeNoteProjectionClientDTO>();
  const byLooseKey = new Map<string, KnowledgeNoteProjectionClientDTO[]>();

  for (const note of notes) {
    const pathWithoutExtension = withoutMarkdownExtension(note.relativePath);
    byPath.set(normalizeLinkValue(pathWithoutExtension), note);
    const keys = new Set([
      note.title,
      path.posix.basename(pathWithoutExtension),
      ...noteAliases(note),
    ]);
    for (const value of keys) {
      const key = normalizeLinkValue(value);
      if (!key) continue;
      const candidates = byLooseKey.get(key) ?? [];
      if (!candidates.some((candidate) => candidate.id === note.id)) candidates.push(note);
      byLooseKey.set(key, candidates);
    }
  }
  return { byId, byPath, byLooseKey };
}

function maskIgnoredMarkdown(markdown: string): string {
  const mask = (value: string): string => value.replace(/[^\n]/g, ' ');
  return markdown
    .replace(/<!--[\s\S]*?-->/g, mask)
    .replace(/```[\s\S]*?```/g, mask)
    .replace(/~~~[\s\S]*?~~~/g, mask)
    .replace(/`[^`\n]*`/g, mask);
}

function linkContext(markdown: string, start: number, end: number): string {
  const lineStart = markdown.lastIndexOf('\n', start) + 1;
  const nextBreak = markdown.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
  return markdown.slice(lineStart, lineEnd).trim().slice(0, 500);
}

function resolveTarget(
  index: NoteIndex,
  source: KnowledgeNoteProjectionClientDTO,
  target: string,
): { note: KnowledgeNoteProjectionClientDTO | null; reason: ParsedLink['unresolvedReason'] } {
  const normalizedTarget = normalizeLinkValue(target);
  if (!normalizedTarget) return { note: null, reason: 'not_found' };

  const sourceDirectory = path.posix.dirname(source.relativePath);
  const relativeCandidate = normalizeLinkValue(
    path.posix.normalize(path.posix.join(sourceDirectory === '.' ? '' : sourceDirectory, target)),
  );
  if (!relativeCandidate.startsWith('../')) {
    const relativeMatch = index.byPath.get(relativeCandidate);
    if (relativeMatch) return { note: relativeMatch, reason: null };
  }

  const exactPath = index.byPath.get(normalizedTarget);
  if (exactPath) return { note: exactPath, reason: null };

  const candidates = index.byLooseKey.get(normalizedTarget) ?? [];
  return candidates.length === 1
    ? { note: candidates[0] ?? null, reason: null }
    : { note: null, reason: candidates.length > 1 ? 'ambiguous' : 'not_found' };
}

function parseLinks(notes: KnowledgeNoteProjectionClientDTO[], index: NoteIndex): ParsedLink[] {
  const links: ParsedLink[] = [];
  for (const note of notes) {
    let markdown = note.markdownContent;
    try {
      markdown = matter(markdown).content;
    } catch {
      // A malformed frontmatter block remains readable Markdown.
    }
    const searchable = maskIgnoredMarkdown(markdown);
    let occurrence = 0;
    for (const match of searchable.matchAll(WIKI_LINK_PATTERN)) {
      const body = match[2]?.trim();
      const start = match.index ?? -1;
      if (!body || start < 0) continue;
      const [targetWithSection, rawAlias] = body.split('|', 2);
      const [rawTarget, rawSection] = (targetWithSection ?? '').split('#', 2);
      const target = rawTarget?.trim() ?? '';
      if (!target) continue;
      const alias = rawAlias?.trim() || null;
      const section = rawSection?.trim() || null;
      const resolved = resolveTarget(index, note, target);
      const raw = match[0] ?? '';
      links.push({
        id: `${note.id}:${occurrence}:${start}`,
        sourceProjectionId: note.id,
        target,
        alias,
        section,
        displayText: alias || (section ? `${target}#${section}` : target),
        context: linkContext(markdown, start, start + raw.length),
        embedded: Boolean(match[1]),
        targetProjectionId: resolved.note?.id ?? null,
        unresolvedReason: resolved.reason,
      });
      occurrence += 1;
    }
  }
  return links;
}

function adjacentIds(links: ParsedLink[], noteId: string): string[] {
  const ids = new Set<string>();
  for (const link of links) {
    if (!link.targetProjectionId) continue;
    if (link.sourceProjectionId === noteId) ids.add(link.targetProjectionId);
    if (link.targetProjectionId === noteId) ids.add(link.sourceProjectionId);
  }
  return [...ids];
}

function toEdge(link: ParsedLink): KnowledgeNoteLinkGraphEdgeDTO | null {
  if (!link.targetProjectionId) return null;
  return {
    id: link.id,
    sourceProjectionId: link.sourceProjectionId,
    targetProjectionId: link.targetProjectionId,
    target: link.target,
    alias: link.alias,
    section: link.section,
    displayText: link.displayText,
    context: link.context,
    embedded: link.embedded,
  };
}

function toUnresolved(link: ParsedLink): KnowledgeNoteUnresolvedLinkDTO | null {
  if (link.targetProjectionId || !link.unresolvedReason) return null;
  return {
    id: link.id,
    sourceProjectionId: link.sourceProjectionId,
    target: link.target,
    alias: link.alias,
    section: link.section,
    displayText: link.displayText,
    context: link.context,
    embedded: link.embedded,
    reason: link.unresolvedReason,
  };
}

export function buildKnowledgeNoteLinkGraph(
  centerProjectionId: string,
  notes: KnowledgeNoteProjectionClientDTO[],
  request: GetKnowledgeNoteLinkGraphReq,
  sourceTruncated = false,
): KnowledgeNoteLinkGraphResponse {
  const index = buildIndex(notes);
  const links = parseLinks(notes, index);
  const visited = new Set<string>([centerProjectionId]);
  const nodeDepth = new Map<string, number>([[centerProjectionId, 0]]);
  const queue: Array<{ id: string; depth: number }> = [{ id: centerProjectionId, depth: 0 }];
  let truncated = sourceTruncated;

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= request.depth) continue;
    const candidates = adjacentIds(links, current.id)
      .map((id) => index.byId.get(id))
      .filter((note): note is KnowledgeNoteProjectionClientDTO => Boolean(note))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    for (const candidate of candidates) {
      if (visited.has(candidate.id)) continue;
      if (visited.size >= request.maxNodes) {
        truncated = true;
        break;
      }
      visited.add(candidate.id);
      nodeDepth.set(candidate.id, current.depth + 1);
      queue.push({ id: candidate.id, depth: current.depth + 1 });
    }
  }

  const outgoingCounts = new Map<string, number>();
  const backlinkCounts = new Map<string, number>();
  for (const link of links) {
    outgoingCounts.set(
      link.sourceProjectionId,
      (outgoingCounts.get(link.sourceProjectionId) ?? 0) + 1,
    );
    if (link.targetProjectionId) {
      backlinkCounts.set(
        link.targetProjectionId,
        (backlinkCounts.get(link.targetProjectionId) ?? 0) + 1,
      );
    }
  }

  const nodes: KnowledgeNoteLinkGraphNodeDTO[] = [...visited]
    .map((id) => index.byId.get(id))
    .filter((note): note is KnowledgeNoteProjectionClientDTO => Boolean(note))
    .sort((left, right) => {
      const depthDifference = (nodeDepth.get(left.id) ?? 0) - (nodeDepth.get(right.id) ?? 0);
      return depthDifference || left.relativePath.localeCompare(right.relativePath);
    })
    .map((note) => ({
      projectionId: note.id,
      title: note.title,
      relativePath: note.relativePath,
      depth: nodeDepth.get(note.id) ?? request.depth,
      isCenter: note.id === centerProjectionId,
      outgoingLinkCount: outgoingCounts.get(note.id) ?? 0,
      backlinkCount: backlinkCounts.get(note.id) ?? 0,
    }));

  const matchingEdges = links
    .filter(
      (link) =>
        link.targetProjectionId &&
        visited.has(link.sourceProjectionId) &&
        visited.has(link.targetProjectionId),
    )
    .map(toEdge)
    .filter((edge): edge is KnowledgeNoteLinkGraphEdgeDTO => Boolean(edge));
  if (matchingEdges.length > MAX_GRAPH_EDGES) truncated = true;
  const edges = matchingEdges.slice(0, MAX_GRAPH_EDGES);

  const matchingUnresolved = links
    .filter((link) => visited.has(link.sourceProjectionId) && !link.targetProjectionId)
    .map(toUnresolved)
    .filter((link): link is KnowledgeNoteUnresolvedLinkDTO => Boolean(link));
  if (matchingUnresolved.length > MAX_UNRESOLVED_LINKS) truncated = true;

  return {
    centerProjectionId,
    depth: request.depth,
    nodes,
    edges,
    unresolvedLinks: matchingUnresolved.slice(0, MAX_UNRESOLVED_LINKS),
    truncated,
  };
}
