# Product visual regression matrix

`manifest.mjs` is the PVC-UI-9001 surface inventory. `matrix.spec.ts` is the sole canonical acceptance entry point. It reuses production Goal reference, Task visual grammar and Schedule presentation authority fixtures. `pages.ts` adds remaining production page owners with deterministic read doubles. No database or remote AI/GitHub connection is used.

Compare-only review command:

```sh
pnpm nx run web:e2e:visual-regression
```

Regenerate only these baselines (Linux, installed Playwright Chromium):

```sh
pnpm nx run web:e2e:visual-regression --configuration=update
```

Then run the compare-only command twice. Fixture types can be checked with `pnpm nx run web:typecheck:visual-regression`. Review the PNG diff before accepting updated baselines. PNGs in `baselines/` are source artifacts; HTML reports and `apps/web/test-results/visual-regression/` are disposable. Baseline generation is an explicit maintainer action; CI never updates snapshots. Zero differing pixels is the comparison threshold.

CI uses the existing Web Flow Shard jobs with Playwright `--shard=1/4` through `4/4`. This browser suite is independent of normal unit tests. The test-system inventory classifies it as `e2e`; `tools/test-system-v2/__tests__/visual-matrix.test.mjs` checks inventory completeness without launching browsers.

The matrix deliberately pairs themes/locales/widths instead of multiplying all permutations. Production page panels use 520 or 1280 pixels; shell cases assert real shell state and a 520 business column within the 1280 viewport. Theme and locale are fixture-owned, timezone is fixed, business clock is fixed, and fonts/layout settle before comparison. Playwright fulfills local asset requests from the built fixture bytes, eliminating host loopback network changes; external requests fail. Animation disabling belongs to Playwright capture only.

Desktop host inventory: `manifest.mjs#desktopRunner` exposes `web:e2e:desktop-screenshots` and `playwright.desktop-screenshot.config.ts`. That runner requires Electron/backend authentication and retains host ownership. Its debug/thesis captures and `shell/shell-geometry.spec.ts` are specialized compatibility evidence, not UI-9001 baselines.

PVC-UI-9002 adds two semantic tests in the same acceptance entry point (29 tests, 27 PNG baselines): measured 520px/eight-tab geometry, named 32px shell actions/36px tabs, keyboard navigation, single business scroll ownership, capsule Enter/Escape focus return, and computed normal/reduced Popover motion. The optional `tabs=8` query seeds real shell tabs through the production store; default screenshot fixtures remain unchanged. Six baseline images were reviewed and updated for the required target-size changes.

## Web/Desktop stylesheet parity

The canonical matrix builds each fixture twice: the default Web global entry and
`--mode desktop` with the Desktop global entry. Both compare against the same 27
reviewed PNG baselines (54 screenshot cases plus three semantic cases). This
checks the same theme, locale, viewport and fixture data, without requiring cloud
account state to match a local guest Profile. No separate Desktop baselines are
accepted. The Desktop run in this matrix covers global styles; the actual
`desktop:test:packaged-smoke` release gate separately checks app-vue's emitted
component CSS, native window dragging and keyboard settings across process restart.
