/**
 * Safe Markdown rendering for untrusted Vault note content.
 * 对不可信 Vault 笔记内容的安全 Markdown 渲染。
 *
 * Raw HTML stays disabled. Obsidian-specific syntax is represented with
 * MarkdownIt tokens so user-controlled values still pass through the normal
 * text and attribute escaping paths.
 */

import MarkdownIt, { type StateBlock, type StateCore, type StateInline, type Token } from 'markdown-it';
// Residual 943: escapeHtml dual retired — @memoflow/utils/shared sole helper.
import { escapeHtml } from '@memoflow/utils/shared';

const ALLOWED_CALLOUT_TYPES = new Set([
  'abstract',
  'attention',
  'bug',
  'caution',
  'check',
  'cite',
  'danger',
  'done',
  'error',
  'example',
  'fail',
  'failure',
  'faq',
  'help',
  'hint',
  'important',
  'info',
  'missing',
  'note',
  'question',
  'quote',
  'success',
  'summary',
  'tip',
  'tldr',
  'todo',
  'warning',
]);

const BLOCK_ID_PATTERN = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;
const CALLOUT_MARKER_PATTERN = /^\[!([A-Za-z0-9_-]+)\]([+-])?(?:[ \t]+(.*))?$/;

interface VaultReference {
  alias: string;
  block: string;
  heading: string;
  note: string;
  target: string;
}

function isAllowedHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (value.startsWith('#')) return true;
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return true;
  if (/^(https?|mailto|obsidian):/i.test(value)) return true;
  // Block javascript:, data:, vbscript:, file:, and other unapproved schemes.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return true;
}

function isExternalHttpHref(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(href.trim());
}

function findClosingMarker(source: string, marker: string, from: number): number {
  let cursor = from;
  while (cursor < source.length) {
    const match = source.indexOf(marker, cursor);
    if (match < 0) return -1;

    let precedingBackslashes = 0;
    for (let index = match - 1; index >= 0 && source[index] === '\\'; index -= 1) {
      precedingBackslashes += 1;
    }
    if (precedingBackslashes % 2 === 0) return match;
    cursor = match + marker.length;
  }
  return -1;
}

function parseVaultReference(value: string): VaultReference | null {
  const separator = value.indexOf('|');
  const target = (separator >= 0 ? value.slice(0, separator) : value).trim();
  const alias = separator >= 0 ? value.slice(separator + 1).trim() : '';
  if (!target) return null;

  let note = target;
  let fragment = '';
  const headingSeparator = target.indexOf('#');
  if (headingSeparator >= 0) {
    note = target.slice(0, headingSeparator).trim();
    fragment = target.slice(headingSeparator + 1).trim();
  } else {
    const legacyBlockSeparator = target.lastIndexOf('^');
    if (legacyBlockSeparator > 0) {
      note = target.slice(0, legacyBlockSeparator).trim();
      fragment = target.slice(legacyBlockSeparator).trim();
    }
  }

  let heading = '';
  let block = '';
  if (fragment.startsWith('^')) {
    block = fragment.slice(1).trim();
  } else if (fragment) {
    const blockSeparator = fragment.lastIndexOf('^');
    if (blockSeparator >= 0) {
      heading = fragment.slice(0, blockSeparator).trim();
      block = fragment.slice(blockSeparator + 1).trim();
    } else {
      heading = fragment;
    }
  }

  if (!note && !heading && !block) return null;
  return { alias, block, heading, note, target };
}

function vaultReferenceRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const isEmbed = state.src.startsWith('![[', start);
  const markerLength = isEmbed ? 3 : 2;
  if (!isEmbed && !state.src.startsWith('[[', start)) return false;

  const close = findClosingMarker(state.src, ']]', start + markerLength);
  if (close < 0) return false;
  const reference = parseVaultReference(state.src.slice(start + markerLength, close));
  if (!reference) return false;

  if (!silent) {
    const open = state.push('link_open', 'a', 1);
    open.attrSet('href', `#vault-note:${encodeURIComponent(reference.note)}`);
    open.attrSet('class', isEmbed ? 'internal-link vault-embed' : 'internal-link');
    open.attrSet('data-vault-kind', isEmbed ? 'embed' : 'link');
    open.attrSet('data-vault-target', reference.target);
    if (isEmbed) open.attrSet('data-vault-embed', 'true');
    if (reference.note) open.attrSet('data-vault-note', reference.note);
    if (reference.heading) open.attrSet('data-vault-heading', reference.heading);
    if (reference.block) open.attrSet('data-vault-block', reference.block);

    const label = state.push('text', '', 0);
    label.content = reference.alias || reference.target;
    state.push('link_close', 'a', -1);
  }

  state.pos = close + 2;
  return true;
}

function vaultCommentRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (!state.src.startsWith('%%', start)) return false;

  const close = findClosingMarker(state.src, '%%', start + 2);
  if (close < 0) return false;
  if (!silent) state.push('vault_comment', '', 0);
  state.pos = close + 2;
  return true;
}

function vaultCommentBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const firstLine = state.src
    .slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine])
    .trim();
  if (firstLine !== '%%') return false;

  for (let line = startLine + 1; line < endLine; line += 1) {
    const value = state.src
      .slice(state.bMarks[line] + state.tShift[line], state.eMarks[line])
      .trim();
    if (value !== '%%') continue;
    if (silent) return true;

    const token = state.push('vault_comment', '', 0);
    token.map = [startLine, line + 1];
    state.line = line + 1;
    return true;
  }

  return false;
}

function vaultHighlightRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (!state.src.startsWith('==', start)) return false;

  const close = findClosingMarker(state.src, '==', start + 2);
  if (close <= start + 2) return false;
  if (!silent) {
    state.push('mark_open', 'mark', 1);
    const highlighted: Token[] = [];
    state.md.inline.parse(state.src.slice(start + 2, close), state.md, state.env, highlighted);
    const levelOffset = state.level;
    for (const token of highlighted) {
      token.level += levelOffset;
      state.tokens.push(token);
      state.tokens_meta.push(undefined);
    }
    state.push('mark_close', 'mark', -1);
  }

  state.pos = close + 2;
  return true;
}

function escapedHighlightRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (!state.src.startsWith('\\==', start)) return false;

  const close = findClosingMarker(state.src, '==', start + 3);
  if (close < 0) return false;
  if (!silent) {
    const literal = state.push('text', '', 0);
    literal.content = state.src.slice(start + 1, close + 2);
  }
  state.pos = close + 2;
  return true;
}

function addClass(token: Token, className: string): void {
  const classValue = token.attrGet('class');
  const classes = typeof classValue === 'string' ? classValue.split(/\s+/).filter(Boolean) : [];
  if (!classes.includes(className)) token.attrJoin('class', className);
}

function findFirstInlineToken(tokens: Token[], from: number): Token | null {
  const openingLevel = tokens[from]?.level ?? 0;
  for (let index = from + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'blockquote_close' && token.level === openingLevel) return null;
    if (token.type === 'inline') return token;
  }
  return null;
}

function addCalloutTokens(state: StateCore): void {
  for (let index = 0; index < state.tokens.length; index += 1) {
    const blockquote = state.tokens[index];
    if (blockquote.type !== 'blockquote_open') continue;

    const inline = findFirstInlineToken(state.tokens, index);
    const firstLine = inline?.content.split('\n', 1)[0]?.trimEnd() ?? '';
    const marker = CALLOUT_MARKER_PATTERN.exec(firstLine);
    if (!inline?.children || !marker) continue;

    const requestedType = marker[1]?.toLowerCase() ?? 'note';
    const type = ALLOWED_CALLOUT_TYPES.has(requestedType) ? requestedType : 'note';
    const title = marker[3]?.trim() || type.charAt(0).toUpperCase() + type.slice(1);
    addClass(blockquote, 'callout');
    addClass(blockquote, `callout-${type}`);
    blockquote.attrSet('data-callout-type', type);
    blockquote.attrSet('role', 'note');
    if (marker[2]) blockquote.attrSet('data-callout-fold', marker[2]);

    const firstBreak = inline.children.findIndex(
      (token) => token.type === 'softbreak' || token.type === 'hardbreak',
    );
    const body = firstBreak >= 0 ? inline.children.slice(firstBreak) : [];
    const titleOpen = new state.Token('callout_title_open', 'span', 1);
    titleOpen.attrSet('class', 'callout-title');
    const titleText = new state.Token('text', '', 0);
    titleText.content = title;
    const titleClose = new state.Token('callout_title_close', 'span', -1);
    inline.children = [titleOpen, titleText, titleClose, ...body];
  }
}

function addTaskListTokens(state: StateCore): void {
  const listStack: Token[] = [];

  for (let index = 0; index < state.tokens.length; index += 1) {
    const token = state.tokens[index];
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      listStack.push(token);
      continue;
    }
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listStack.pop();
      continue;
    }
    if (token.type !== 'list_item_open') continue;

    const itemLevel = token.level;
    let inline: Token | null = null;
    for (let cursor = index + 1; cursor < state.tokens.length; cursor += 1) {
      const candidate = state.tokens[cursor];
      if (candidate.type === 'list_item_close' && candidate.level === itemLevel) break;
      if (candidate.type === 'inline') {
        inline = candidate;
        break;
      }
    }
    if (!inline?.children) continue;

    const textIndex = inline.children.findIndex((child) => child.type === 'text');
    if (textIndex < 0) continue;
    const textToken = inline.children[textIndex];
    const marker = /^\[([ xX])\](?:[ \t]+|$)/.exec(textToken.content);
    if (!marker) continue;

    const checked = marker[1]?.toLowerCase() === 'x';
    textToken.content = textToken.content.slice(marker[0].length);
    const checkbox = new state.Token('task_checkbox', 'input', 0);
    checkbox.attrSet('type', 'checkbox');
    checkbox.attrSet('class', 'task-list-item-checkbox');
    checkbox.attrSet('disabled', '');
    checkbox.attrSet('tabindex', '-1');
    if (checked) checkbox.attrSet('checked', '');
    inline.children.splice(textIndex, 0, checkbox);

    addClass(token, 'task-list-item');
    token.attrSet('data-task-checked', String(checked));
    const list = listStack[listStack.length - 1];
    if (list) addClass(list, 'contains-task-list');
  }
}

function addBlockTargetMetadata(state: StateCore): void {
  for (let index = 0; index < state.tokens.length; index += 1) {
    const inline = state.tokens[index];
    if (inline.type !== 'inline' || !inline.children?.length) continue;

    const final = inline.children[inline.children.length - 1];
    if (final?.type !== 'text') continue;
    const marker = BLOCK_ID_PATTERN.exec(final.content);
    if (!marker?.[1]) continue;

    final.content = final.content.slice(0, marker.index).trimEnd();
    let target: Token | null = null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = state.tokens[cursor];
      if (candidate.nesting !== 1) continue;
      if (candidate.level >= inline.level) continue;
      if (candidate.type === 'paragraph_open' && candidate.hidden) continue;
      target = candidate;
      break;
    }
    if (!target) continue;
    target.attrSet('id', `vault-block:${encodeURIComponent(marker[1])}`);
    target.attrSet('data-vault-block', marker[1]);
  }
}

function plainInlineText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content;
      if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
      return '';
    })
    .join('')
    .trim();
}

function addHeadingTargetMetadata(state: StateCore): void {
  for (let index = 0; index < state.tokens.length - 1; index += 1) {
    const heading = state.tokens[index];
    const inline = state.tokens[index + 1];
    if (heading.type !== 'heading_open' || inline.type !== 'inline' || !inline.children) continue;

    const label = plainInlineText(inline.children);
    if (!label) continue;
    heading.attrSet('id', `vault-heading:${encodeURIComponent(label)}`);
    heading.attrSet('data-vault-heading', label);
  }
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});

md.validateLink = (url) => isAllowedHref(url);
md.block.ruler.before('paragraph', 'vault-comment-block', vaultCommentBlockRule);
md.inline.ruler.before('text', 'vault-comment', vaultCommentRule);
md.inline.ruler.before('text', 'vault-escaped-highlight', escapedHighlightRule);
md.inline.ruler.before('text', 'vault-highlight', vaultHighlightRule);
md.inline.ruler.before('link', 'vault-reference', vaultReferenceRule);
md.core.ruler.after('inline', 'vault-block-semantics', (state) => {
  addCalloutTokens(state);
  addTaskListTokens(state);
  addBlockTargetMetadata(state);
  addHeadingTargetMetadata(state);
});

md.renderer.rules.vault_comment = () => '';

// Restrict external links to safer schemes and a separate browsing context.
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const hrefValue = token.attrGet('href');
  const href = typeof hrefValue === 'string' ? hrefValue : '';
  if (!isAllowedHref(href)) {
    token.attrSet('href', '#');
    token.attrJoin('class', 'unsafe-link');
  } else if (isExternalHttpHref(href)) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/** Render Markdown to HTML with raw HTML disabled. */
export function renderSafeMarkdown(source: string): string {
  if (!source) return '';
  try {
    return md.render(source);
  } catch {
    // Never throw into v-html consumers.
    return escapeHtml(source);
  }
}

/** Render a short excerpt safely with the same parser. */
export function renderSafeMarkdownExcerpt(source: string, maxChars = 500): string {
  if (!source) return '';
  return renderSafeMarkdown(source.slice(0, maxChars));
}
