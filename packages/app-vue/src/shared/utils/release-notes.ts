import { h, type VNodeChild } from 'vue';
import { isAllowedHref, renderSafeMarkdown } from './safe-markdown';

const ALLOWED_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'code',
  'pre',
  'blockquote',
  'a',
  'hr',
]);
const DROPPED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'svg',
  'math',
  'head',
  'link',
  'meta',
  'base',
  'img',
  'audio',
  'video',
  'source',
  'track',
]);

/** Release links use the shared scheme policy and the desktop HTTP(S)-only opener. */
function releaseNotesHref(href: string | null): string | null {
  if (!href || !isAllowedHref(href)) return null;
  const value = href.trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

function rebuildNode(node: Node): VNodeChild {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const tag = element.localName.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return null;
  const children = Array.from(element.childNodes, rebuildNode);
  if (!ALLOWED_TAGS.has(tag)) return children;

  if (tag === 'a') {
    const href = releaseNotesHref(element.getAttribute('href'));
    return href
      ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, children)
      : children;
  }
  // Source attributes are never copied, including style, on*, IDs and Vue props.
  return h(tag, null, children);
}

/**
 * Leading HTML markup selects HTML mode; all other input uses safe Markdown.
 * In particular, fenced/inline code containing tags stays Markdown text.
 * Neither the parsed document nor an HTML string is inserted into the live DOM.
 */
export function renderReleaseNotes(source: string): VNodeChild[] {
  if (!source.trim()) return [];
  const isHtml = /^\s*<(?:[a-z][\w:-]*(?:\s[^<>]*)?\s*\/?>|!--|!doctype\s)/i.test(source);
  const html = isHtml ? source : renderSafeMarkdown(source);
  const document = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(document.body.childNodes, rebuildNode);
}
