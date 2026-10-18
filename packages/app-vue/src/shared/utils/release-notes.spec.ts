/** @vitest-environment jsdom */
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { renderReleaseNotes } from './release-notes';

// Mount the public renderer output without component-generated scope attributes.
const NotesHarness = defineComponent({
  props: { source: { type: String, required: true } },
  setup: (props) => () => h('div', renderReleaseNotes(props.source)),
});

describe('renderReleaseNotes', () => {
  it('renders GitHub HTML notes using only supported markup', () => {
    const wrapper = mount(NotesHarness, {
      props: {
        source: `
      <h1>0.20.1</h1><p>Release <strong>highlights</strong></p>
      <ul><li><a href="https://github.com/BakerSean168/memoflow/pull/479">Fix updates</a></li></ul>
    `,
      },
    });
    expect(wrapper.get('h1').text()).toBe('0.20.1');
    expect(wrapper.get('p strong').text()).toBe('highlights');
    expect(wrapper.get('ul li a').text()).toBe('Fix updates');
    expect(wrapper.get('a').attributes()).toEqual({
      href: 'https://github.com/BakerSean168/memoflow/pull/479',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(wrapper.text()).not.toMatch(/<\/?(?:h1|p|ul|li|strong|a)\b/);
  });

  it('keeps plain text, line breaks and Markdown formatting', () => {
    const plain = mount(NotesHarness, { props: { source: 'First line\nSecond & final line' } });
    expect(plain.text()).toContain('First line');
    expect(plain.text()).toContain('Second & final line');
    expect(plain.find('br').exists()).toBe(true);
    const markdown = mount(NotesHarness, {
      props: {
        source:
          '# Changes\n\n- **Fixed** updates\n\n[Details](https://example.com)\n\n```html\n<h1>literal</h1>\n```',
      },
    });
    expect(markdown.get('h1').text()).toBe('Changes');
    expect(markdown.get('li strong').text()).toBe('Fixed');
    expect(markdown.get('a').attributes('href')).toBe('https://example.com');
    expect(markdown.get('pre code').text()).toContain('<h1>literal</h1>');
    expect(markdown.findAll('h1')).toHaveLength(1);
  });

  it.each(['', '  \n  '])('renders empty notes gracefully (%j)', (source) => {
    expect(mount(NotesHarness, { props: { source } }).text()).toBe('');
  });

  it('drops active content and all source attributes except validated href', () => {
    const wrapper = mount(NotesHarness, {
      props: {
        source: `
      <h1 id="clobber" style="color:red" onclick="alert(1)">Safe</h1>
      <script>globalThis.__releaseNotesExecuted = true</script><style>body{display:none}</style>
      <iframe src="https://evil.example">iframe body</iframe>
      <img src=x onerror="alert(1)"><object>object body</object>
      <svg><a href="https://evil.example">svg body</a></svg>
      <template>template body</template><custom-tag>Kept <b>text</b></custom-tag>
      <p><a href="https://example.com" target="_self" download style="color:red" onmouseover="alert(1)">Good</a></p>
    `,
      },
    });
    expect(
      wrapper.find('script, style, iframe, img, object, svg, template, custom-tag').exists(),
    ).toBe(false);
    expect(Reflect.get(globalThis, '__releaseNotesExecuted')).toBeUndefined();
    expect(wrapper.get('h1').attributes()).toEqual({});
    expect(wrapper.get('a').attributes()).toEqual({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(wrapper.text()).toContain('Kept text');
    expect(wrapper.text()).not.toMatch(
      /script|display:none|iframe body|object body|svg body|template body/,
    );
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java&#x09;script:alert(1)',
    'java&#x0a;script:alert(1)',
    'data:text/html,evil',
    'vbscript:evil',
    'file:///etc/passwd',
    'mailto:user@example.com',
    'obsidian://open',
    '/settings',
    '#update',
  ])('does not create a navigable unsafe or unsupported link: %s', (href) => {
    const wrapper = mount(NotesHarness, {
      props: { source: `<p><a href="${href}">Read more</a></p>` },
    });
    expect(wrapper.text()).toBe('Read more');
    expect(wrapper.find('[href]').exists()).toBe(false);
  });

  it('neutralizes malicious Markdown while preserving its text', () => {
    const wrapper = mount(NotesHarness, {
      props: {
        source:
          '# Notes\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n[y](data:text/html,evil)',
      },
    });
    expect(wrapper.find('script, img, [onerror], [href]').exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>alert(1)</script>');
  });

  it('retains all supported HTML text and more than 2,000 characters', () => {
    const text = 'Full details '.repeat(250) + 'THE END';
    const wrapper = mount(NotesHarness, {
      props: {
        source: `<h2>Features</h2><h3>Details</h3><h4>More</h4><h5>Extra</h5><h6>Last</h6><ol><li><em>One</em><br><i>Two</i></li></ol><blockquote>Quote</blockquote><pre><code>&lt;literal&gt;</code></pre><hr><p>${text}</p>`,
      },
    });
    for (const tag of [
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ol',
      'li',
      'em',
      'br',
      'i',
      'blockquote',
      'pre',
      'code',
      'hr',
    ]) {
      expect(wrapper.find(tag).exists()).toBe(true);
    }
    expect(wrapper.get('p').text()).toBe(text);
    expect(wrapper.get('pre code').text()).toBe('<literal>');
  });
});
