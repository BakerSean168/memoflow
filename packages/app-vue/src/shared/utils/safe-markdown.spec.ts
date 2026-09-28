/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { renderSafeMarkdown, renderSafeMarkdownExcerpt, stripMarkdownFrontmatter } from './safe-markdown';

describe('renderSafeMarkdown', () => {
  it('removes YAML frontmatter from reading-mode output', () => {
    const source = `---\ntitle: Example\ntags: [one, two]\n---\n\n# Visible heading\n\nBody`;
    expect(stripMarkdownFrontmatter(source)).toContain('# Visible heading');
    const html = renderSafeMarkdown(source);
    expect(html).not.toContain('title: Example');
    expect(html).not.toContain('tags:');
    expect(html).toContain('<h1');
    expect(html).toContain('Visible heading');
  });

  it('adds safe syntax highlighting for known fenced-code languages', () => {
    const html = renderSafeMarkdown('```ts\nconst answer: number = 42\n```');
    expect(html).toContain('class="language-ts"');
    expect(html).toContain('hljs-keyword');
    expect(html).not.toContain('<script>');
  });

  it('does not execute or pass through raw HTML script tags', () => {
    const html = renderSafeMarkdown('Hello <script>alert(1)</script> **world**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not create an active javascript: hyperlink', () => {
    const html = renderSafeMarkdown('[x](javascript:alert(1))');
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
    // Either neutralized href or plain text without an anchor is acceptable.
    if (html.includes('<a')) {
      expect(html).toMatch(/href="#"/);
    }
  });

  it('allows https links with noopener', () => {
    const html = renderSafeMarkdown('[docs](https://example.com/a)');
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it('renders excerpts without raw HTML', () => {
    const html = renderSafeMarkdownExcerpt('<img src=x onerror=alert(1)> note');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders Vault wiki links as inert internal navigation targets', () => {
    const html = renderSafeMarkdown('See [[Architecture#Runtime|system map]].');
    expect(html).toContain('data-vault-note="Architecture"');
    expect(html).toContain('data-vault-heading="Runtime"');
    expect(html).toContain('data-vault-kind="link"');
    expect(html).toContain('href="#vault-note:Architecture"');
    expect(html).toContain('>system map</a>');
  });

  it('preserves heading and block targets as escaped navigation metadata', () => {
    const html = renderSafeMarkdown(
      '[[Architecture#Runtime^startup|runtime]] [[Architecture#^runtime-block|block]]',
    );

    expect(html).toContain('data-vault-heading="Runtime"');
    expect(html).toContain('data-vault-block="startup"');
    expect(html).toContain('data-vault-block="runtime-block"');
    expect(html).toContain('data-vault-target="Architecture#Runtime^startup"');
  });

  it('renders embeds as inert internal links without recursively rendering content', () => {
    const html = renderSafeMarkdown('![[Child note#Overview^intro|snapshot]]');

    expect(html).toContain('class="internal-link vault-embed"');
    expect(html).toContain('data-vault-kind="embed"');
    expect(html).toContain('data-vault-embed="true"');
    expect(html).toContain('data-vault-note="Child note"');
    expect(html).toContain('data-vault-heading="Overview"');
    expect(html).toContain('data-vault-block="intro"');
    expect(html).toContain('>snapshot</a>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<iframe');
  });

  it('removes inline and multiline Obsidian comments from visible output', () => {
    const inline = renderSafeMarkdown('Visible %% **secret** <script>x</script> %% after');
    const block = renderSafeMarkdown('%%\n\nhidden **secret**\n\n%%\n\nVisible');

    expect(inline).toContain('Visible  after');
    expect(inline).not.toContain('secret');
    expect(inline).not.toContain('script');
    expect(block).toContain('Visible');
    expect(block).not.toContain('hidden');
    expect(block).not.toContain('secret');
  });

  it('renders highlights through escaped Markdown tokens', () => {
    const html = renderSafeMarkdown('==**safe** <img src=x onerror=alert(1)>==');

    expect(html).toContain('<mark><strong>safe</strong> &lt;img src=x onerror=alert(1)&gt;</mark>');
    expect(html).not.toContain('<img');
  });

  it('leaves escaped, inline-code, and fenced-code syntax literal', () => {
    const html = renderSafeMarkdown(
      '\\==literal== and `==code== [[not-a-link]] %%not-a-comment%%`\n\n```md\n==fence==\n```',
    );

    expect(html).not.toContain('<mark>');
    expect(html).not.toContain('data-vault-note');
    expect(html).toContain('==literal==');
    expect(html).toContain('<code>==code== [[not-a-link]] %%not-a-comment%%</code>');
    expect(html).toContain('==fence==');
  });

  it('renders allowlisted callouts and escapes their titles', () => {
    const html = renderSafeMarkdown('> [!danger]- <img src=x onerror=alert(1)>\n> Keep safe');

    expect(html).toContain(
      '<blockquote class="callout callout-danger" data-callout-type="danger" role="note" data-callout-fold="-">',
    );
    expect(html).toContain('<span class="callout-title">&lt;img src=x onerror=alert(1)&gt;</span>');
    expect(html).toContain('Keep safe');
    expect(html).not.toContain('<img');
  });

  it('falls back to the note callout class for unrecognized types', () => {
    const html = renderSafeMarkdown('> [!not-a-real-type] Title');

    expect(html).toContain('class="callout callout-note"');
    expect(html).toContain('data-callout-type="note"');
  });

  it('adds disabled task-list controls and semantic checked state', () => {
    const html = renderSafeMarkdown('- [x] done\n- [ ] open');

    expect(html).toContain('<ul class="contains-task-list">');
    expect(html).toContain('<li class="task-list-item" data-task-checked="true">');
    expect(html).toContain('<li class="task-list-item" data-task-checked="false">');
    expect(html).toContain('class="task-list-item-checkbox" disabled="" tabindex="-1" checked=""');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  });

  it('adds navigable metadata to rendered headings and block IDs', () => {
    const html = renderSafeMarkdown('## Runtime\n\nTarget paragraph ^runtime-block');

    expect(html).toContain(
      '<h2 id="vault-heading:Runtime" data-vault-heading="Runtime">Runtime</h2>',
    );
    expect(html).toContain(
      '<p id="vault-block:runtime-block" data-vault-block="runtime-block">Target paragraph</p>',
    );
    expect(html).not.toContain('^runtime-block');
  });

  it('secures protocol-relative external links and rejects other active schemes', () => {
    const external = renderSafeMarkdown('[external](//example.com/path)');
    const vbscript = renderSafeMarkdown('[bad](vbscript:msgbox(1))');
    const data = renderSafeMarkdown('[bad](data:text/html;base64,PHNjcmlwdD4=)');

    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noopener noreferrer"');
    expect(vbscript).not.toMatch(/href=["']vbscript:/i);
    expect(data).not.toMatch(/href=["']data:/i);
  });
});
