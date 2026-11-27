/**
 * Adapted from T3 Code preserveReadingPosition.ts, MessagesTimeline.tsx and
 * timelineScrollAnchoring.ts at 0b42e2e2febf51627d6c150be686c02d26ef2739.
 * Copyright (c) 2026 T3 Tools Inc. MIT; see THIRD_PARTY_NOTICES.md.
 */
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

/** Reveal only what fits below a disclosure without losing its header. */
export function resolveDisclosureRevealScrollDelta(
  rowTop: number,
  rowBottom: number,
  viewportTop: number,
  viewportBottom: number,
) {
  return Math.max(0, Math.min(rowBottom - viewportBottom, rowTop - viewportTop - 24));
}

type Position = { rowId?: string; offset: number; scrollTop: number; atEnd: boolean };
const controllers = new WeakMap<HTMLElement, { disclose: (change: () => void) => void }>();

/** Disclosures use the same owner as stream/resize corrections. */
export function preserveTimelineDisclosure(viewport: HTMLElement | null, change: () => void) {
  const controller = viewport && controllers.get(viewport);
  if (controller) controller.disclose(change);
  else change();
}

export function useTimelineScrollAnchoring(
  viewport: Ref<HTMLElement | null>,
  conversationId: Ref<string>,
  content: Ref<unknown>,
) {
  // Session-local and bounded: never restore another mounted chat surface's position.
  const positions = new Map<string, Position>();
  let following = true;
  let restoring = false;
  let awaitingContent: unknown;
  let position: Position | undefined;
  let textAnchor: { range: Range; top: number } | undefined;
  let stop: (() => void) | undefined;
  let generation = 0;
  let frame: number | undefined;
  let lastScrollTop = 0;
  const nearEnd = (el: HTMLElement) => el.scrollHeight - el.clientHeight - el.scrollTop <= 96;
  const rows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-scroll-row]'));

  function capture() {
    const el = viewport.value;
    if (!el || restoring || (awaitingContent !== undefined && content.value === awaitingContent))
      return;
    const box = el.getBoundingClientRect();
    const row = rows(el).find((row) => row.getBoundingClientRect().bottom > box.top);
    position = {
      rowId: row?.dataset.scrollRow,
      offset: row ? row.getBoundingClientRect().top - box.top : 0,
      scrollTop: el.scrollTop,
      atEnd: following,
    };
    lastScrollTop = el.scrollTop;
    textAnchor = undefined;
    if (following || el.scrollTop === 0) return;
    // Capture a visible text line, rather than the start of a long paragraph.
    const doc = el.ownerDocument;
    const caretDoc = doc as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    for (let inset = Math.min(24, box.height / 2); inset < Math.min(64, box.height); inset += 8) {
      const x = box.left + box.width / 2;
      const y = box.top + inset;
      const caret = caretDoc.caretPositionFromPoint?.(x, y);
      const range = doc.createRange();
      if (caret) range.setStart(caret.offsetNode, caret.offset);
      else {
        const fallback = caretDoc.caretRangeFromPoint?.(x, y);
        if (!fallback) continue;
        range.setStart(fallback.startContainer, fallback.startOffset);
      }
      range.collapse(true);
      if (!el.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE)
        continue;
      const top = range.getBoundingClientRect().top - box.top;
      if (top >= 0 && top < el.clientHeight) {
        textAnchor = { range, top };
        break;
      }
    }
  }

  function remember(key = conversationId.value) {
    if (!position || !key) return;
    positions.delete(key);
    positions.set(key, { ...position, atEnd: following });
    if (positions.size > 100) positions.delete(positions.keys().next().value!);
  }

  function correct() {
    const el = viewport.value;
    if (!el || restoring || (awaitingContent !== undefined && content.value === awaitingContent))
      return;
    awaitingContent = undefined;
    if (!following && position?.rowId && !rows(el).length) return;
    if (following) el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    else if (textAnchor && el.contains(textAnchor.range.startContainer)) {
      const delta =
        textAnchor.range.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        textAnchor.top;
      if (Math.abs(delta) > 0.5) el.scrollTop += delta;
    } else if (position) {
      const row = rows(el).find((row) => row.dataset.scrollRow === position?.rowId);
      el.scrollTop = row
        ? el.scrollTop +
          row.getBoundingClientRect().top -
          el.getBoundingClientRect().top -
          position.offset
        : position.scrollTop;
    }
    capture();
    remember();
  }

  const stopViewport = watch(
    viewport,
    (el) => {
      stop?.();
      if (!el) return;
      following = nearEnd(el);
      capture();
      const scroll = () => {
        if (restoring || (awaitingContent !== undefined && content.value === awaitingContent))
          return;
        // Corrective scrolls do not re-arm follow after a disclosure or resize.
        const delta = el.scrollTop - lastScrollTop;
        if (delta < -0.5) following = false;
        else if (delta > 0.5 && nearEnd(el)) following = true;
        capture();
        remember();
      };
      const interrupt = (event: Event) => {
        const upward = event instanceof WheelEvent ? event.deltaY < 0 : true;
        if (upward) following = false;
        textAnchor = undefined;
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = undefined;
          capture();
          remember();
        });
        remember();
      };
      const keydown = (event: KeyboardEvent) => {
        if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) interrupt(event);
      };
      const resize =
        typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(correct);
      resize?.observe(el);
      if (el.firstElementChild) resize?.observe(el.firstElementChild);
      let disclosure: HTMLElement | null = null;
      const click = (event: Event) => {
        disclosure =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('button[aria-expanded]')
            : null;
      };
      el.addEventListener('click', click, true);
      el.addEventListener('scroll', scroll, { passive: true });
      el.addEventListener('wheel', interrupt, { passive: true });
      el.addEventListener('touchmove', interrupt, { passive: true });
      el.addEventListener('keydown', keydown);
      el.addEventListener('load', correct, true);
      controllers.set(el, {
        disclose(change) {
          capture();
          // A live turn already following the end keeps following it.
          const live = el.querySelector('[data-streaming="true"]');
          if (!live) following = false;
          change();
          const current = generation;
          const trigger = disclosure;
          const triggerTop = trigger?.getBoundingClientRect().top;
          void nextTick(() => {
            if (current !== generation) return;
            correct();
            if (!following && trigger?.isConnected && triggerTop !== undefined) {
              el.scrollTop += trigger.getBoundingClientRect().top - triggerTop;
              if (trigger.getAttribute('aria-expanded') === 'true') {
                const bounds = trigger
                  .closest('[data-testid="ai-agent-activity"]')
                  ?.getBoundingClientRect();
                const box = el.getBoundingClientRect();
                if (bounds)
                  el.scrollTop += resolveDisclosureRevealScrollDelta(
                    trigger.getBoundingClientRect().top,
                    bounds.bottom,
                    box.top,
                    box.bottom,
                  );
              }
              capture();
              remember();
            }
          });
        },
      });
      stop = () => {
        resize?.disconnect();
        el.removeEventListener('click', click, true);
        controllers.delete(el);
        el.removeEventListener('scroll', scroll);
        el.removeEventListener('wheel', interrupt);
        el.removeEventListener('touchmove', interrupt);
        el.removeEventListener('keydown', keydown);
        el.removeEventListener('load', correct, true);
        if (frame !== undefined) cancelAnimationFrame(frame);
      };
    },
    { flush: 'post' },
  );

  const stopConversation = watch(
    conversationId,
    (_id, previous) => {
      remember(previous);
      generation++;
      restoring = true;
      // The selected ID changes before asynchronous history replaces the old transcript.
      awaitingContent =
        previous && Array.isArray(content.value) && content.value.length
          ? content.value
          : undefined;
      textAnchor = undefined;
      const saved = positions.get(conversationId.value);
      following = saved?.atEnd ?? true;
      position = saved;
      const current = generation;
      void nextTick(() => {
        if (current !== generation) return;
        restoring = false;
        correct();
      });
    },
    { flush: 'sync' },
  );
  const stopContent = watch(content, correct, { deep: true, flush: 'post' });

  function scrollToEnd(options?: { streaming?: boolean; force?: boolean }) {
    const current = generation;
    void nextTick(() => {
      if (current !== generation || restoring) return;
      const el = viewport.value;
      if (!el || (!following && !options?.force)) return;
      following = true;
      // Immediate writes avoid smooth-scroll events fighting a streaming resize.
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      capture();
      remember();
    });
  }

  onBeforeUnmount(() => {
    generation++;
    stop?.();
    stopViewport();
    stopConversation();
    stopContent();
  });
  return { scrollToEnd };
}
