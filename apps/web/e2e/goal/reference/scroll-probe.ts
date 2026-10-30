import { writeFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';

// Investigation harness for the flaky Goal KR editor body scroll (#609).
// Records every scrolling primitive the page touches so a failed poll can be
// explained from the page side instead of guessed from the test side.
// Kept free of template literals and regular expressions on purpose: this
// function is serialized into the browser by addInitScript.

export function scrollProbeInit(): void {
  const flag = '__scrollProbeInstalled';
  if ((window as any)[flag]) return;
  (window as any)[flag] = true;

  const entries: any[] = [];
  (window as any).__scrollProbe = entries;
  const CAP = 4000;

  function now(): number {
    return Math.round(performance.now() * 10) / 10;
  }

  function push(entry: any): void {
    if (entries.length >= CAP) return;
    entry.t = now();
    entries.push(entry);
  }

  function descriptor(el: any): string {
    if (!el) return 'null';
    if (el.nodeType === 9) return 'document';
    if (el.nodeType !== 1) return 'node-' + String(el.nodeName || 'unknown');
    let out = String(el.tagName || 'node').toLowerCase();
    const testId = el.getAttribute ? el.getAttribute('data-testid') : null;
    if (testId) out = out + '[data-testid=' + testId + ']';
    const host = el.getAttribute ? el.getAttribute('data-scroll-host') : null;
    if (host) out = out + '[data-scroll-host=' + host + ']';
    const classes = typeof el.className === 'string' ? el.className : '';
    if (classes) {
      const list = classes
        .split(' ')
        .filter(function (part) {
          return part.length > 0;
        })
        .slice(0, 3);
      for (let i = 0; i < list.length; i++) out = out + '.' + list[i];
    }
    return out;
  }

  function snapshot(el: any): any {
    if (!el || el.nodeType !== 1) return null;
    return { st: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight };
  }

  function safeStringify(value: any): string {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return '[unserializable]';
    }
  }

  const originalScrollTo = Element.prototype.scrollTo;
  if (typeof originalScrollTo === 'function') {
    Element.prototype.scrollTo = function (this: Element) {
      const target: any = this;
      const args = Array.prototype.slice.call(arguments);
      push({
        type: 'scrollTo-call',
        target: descriptor(target),
        args: safeStringify(args),
        before: snapshot(target),
      });
      const result = originalScrollTo.apply(this, arguments as any);
      requestAnimationFrame(function () {
        push({ type: 'scrollTo-after-raf', target: descriptor(target), after: snapshot(target) });
      });
      return result;
    } as any;
  }

  const originalWindowScrollTo = window.scrollTo;
  if (typeof originalWindowScrollTo === 'function') {
    window.scrollTo = function (this: Window) {
      const args = Array.prototype.slice.call(arguments);
      push({ type: 'window-scrollTo-call', target: 'window', args: safeStringify(args) });
      return originalWindowScrollTo.apply(this, arguments as any);
    } as any;
  }

  const originalScrollIntoView = Element.prototype.scrollIntoView;
  if (typeof originalScrollIntoView === 'function') {
    Element.prototype.scrollIntoView = function (this: Element) {
      const target: any = this;
      const args = Array.prototype.slice.call(arguments);
      push({
        type: 'scrollIntoView-call',
        target: descriptor(target),
        args: safeStringify(args),
      });
      return originalScrollIntoView.apply(this, arguments as any);
    } as any;
  }

  document.addEventListener(
    'scroll',
    function (event: Event) {
      let target: any = event.target;
      if (target === document) target = document.documentElement;
      push({ type: 'scroll-event', target: descriptor(target), layout: snapshot(target) });
    },
    true,
  );

  document.addEventListener(
    'focusin',
    function (event: Event) {
      push({ type: 'focusin', target: descriptor(event.target) });
    },
    true,
  );

  document.addEventListener(
    'focusout',
    function (event: Event) {
      push({ type: 'focusout', target: descriptor(event.target) });
    },
    true,
  );

  function transitionEntry(type: string) {
    return function (event: Event) {
      const detail: any = event;
      push({
        type,
        target: descriptor(event.target),
        propertyName: detail.propertyName ?? null,
        elapsedTime: detail.elapsedTime ?? null,
      });
    };
  }

  document.addEventListener('transitionstart', transitionEntry('transitionstart'), true);
  document.addEventListener('transitionend', transitionEntry('transitionend'), true);
  document.addEventListener('transitioncancel', transitionEntry('transitioncancel'), true);

  push({ type: 'probe-installed' });
}

export async function installScrollProbe(page: Page): Promise<void> {
  await page.addInitScript(scrollProbeInit);
}

export async function dumpScrollProbeOnFailure(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  try {
    const entries = await page.evaluate(() => (window as any).__scrollProbe ?? []);
    const body = JSON.stringify(
      {
        test: testInfo.title,
        status: testInfo.status,
        error: testInfo.error?.message ?? null,
        entries,
      },
      null,
      1,
    );
    await testInfo.attach('scroll-probe', { body, contentType: 'application/json' });
    writeFileSync(testInfo.outputPath('scroll-probe.json'), body);
  } catch {
    // Page already gone; the Playwright trace remains the evidence.
  }
}
