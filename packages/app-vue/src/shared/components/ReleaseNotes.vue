<script lang="ts">
import { computed, defineComponent, h, inject } from 'vue';
import { SystemChannels } from '@memoflow/desktop-contracts';
import { createLogger } from '@memoflow/utils/logger';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { renderReleaseNotes } from '../utils/release-notes';

const logger = createLogger('ReleaseNotes');

export default defineComponent({
  name: 'ReleaseNotes',
  props: { source: { type: String, required: true } },
  setup(props) {
    const desktopBridge = inject(DESKTOP_BRIDGE_KEY, undefined);
    const nodes = computed(() => renderReleaseNotes(props.source));

    async function openLink(event: MouseEvent): Promise<void> {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!desktopBridge || !link) return;
      event.preventDefault();
      try {
        await desktopBridge.invoke(SystemChannels.OPEN_EXTERNAL_URL, {
          url: link.getAttribute('href'),
        });
      } catch {
        logger.warn('Unable to open release notes link');
      }
    }

    return () => h('div', { class: 'release-notes', onClick: openLink }, nodes.value);
  },
});
</script>

<style scoped>
.release-notes {
  max-height: 24rem;
  min-width: 0;
  overflow-y: auto;
  overflow-wrap: anywhere;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
  line-height: 1.7;
}

.release-notes :deep(h1),
.release-notes :deep(h2),
.release-notes :deep(h3),
.release-notes :deep(h4),
.release-notes :deep(h5),
.release-notes :deep(h6) {
  margin: 1rem 0 0.5rem;
  color: hsl(var(--foreground));
  font-weight: 650;
  line-height: 1.3;
}

.release-notes :deep(h1) {
  font-size: 1.5rem;
}
.release-notes :deep(h2) {
  font-size: 1.25rem;
}
.release-notes :deep(h3) {
  font-size: 1.1rem;
}
.release-notes :deep(h4) {
  font-size: 1rem;
}
.release-notes :deep(h5) {
  font-size: 0.95rem;
}
.release-notes :deep(h6) {
  font-size: 0.875rem;
}

.release-notes :deep(p),
.release-notes :deep(ul),
.release-notes :deep(ol),
.release-notes :deep(pre),
.release-notes :deep(blockquote),
.release-notes :deep(hr) {
  margin: 0.75rem 0;
}

.release-notes :deep(ul),
.release-notes :deep(ol) {
  padding-left: 1.5rem;
}
.release-notes :deep(ul) {
  list-style-type: disc;
}
.release-notes :deep(ol) {
  list-style-type: decimal;
}
.release-notes :deep(li) {
  margin-block: 0.25rem;
}
.release-notes :deep(strong),
.release-notes :deep(b) {
  font-weight: 650;
}
.release-notes :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
.release-notes :deep(blockquote) {
  border-left: 3px solid hsl(var(--border));
  padding-left: 1rem;
}
.release-notes :deep(code) {
  border-radius: 0.25rem;
  background: hsl(var(--muted));
  padding: 0.1rem 0.25rem;
  font-family: ui-monospace, monospace;
}
.release-notes :deep(pre) {
  white-space: pre-wrap;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  background: hsl(var(--muted) / 0.4);
  padding: 0.75rem;
}
.release-notes :deep(pre code) {
  background: transparent;
  padding: 0;
}
.release-notes :deep(hr) {
  border-top: 1px solid hsl(var(--border));
}
.release-notes :deep(> :first-child) {
  margin-top: 0;
}
.release-notes :deep(> :last-child) {
  margin-bottom: 0;
}
</style>
