# Quality tools

## Style discipline: arbitrary values and inline style

`style-guard.mjs` enforces the style rule for newly added code. It is the
changed-file companion to `fmt.mjs`: it only audits **lines added by the current
change**, so the existing arbitrary-value backlog (about 819 occurrences) is
explicitly out of scope and cannot block the guard.

```bash
# Part of pnpm check:changed
node ./tools/quality/style-guard.mjs --changed

# Audit a file as if all its lines were added (useful while iterating)
node ./tools/quality/style-guard.mjs --files packages/task-ui/src/views/TaskDetailView.vue
```

Options: `--base <ref>` (default `origin/main`), `--head <ref>`, `--root <dir>`,
`--exemptions <path>`, `--help`.

### The rule

1. A dimension that already has a Tailwind theme scale **must** use a scale
   value: spacing (padding / margin / gap / width / height / min / max / inset /
   top / right / bottom / left / start / end / translate / scroll snap /
   border-spacing) and border radius. Write `p-3`, `w-64`, `max-h-96`,
   `top-2`, `rounded-lg`; do not write `p-[7px]`, `w-[137px]`, `rounded-[5px]`.
2. Arbitrary values are allowed only for real geometry that has no theme scale:
   absolute positioning offsets tied to a third-party layout, canvas / chart
   container sizes, and sizes required by third-party component integration.
   Each such occurrence must be registered per line item in
   [`style-arbitrary-exemptions.json`](./style-arbitrary-exemptions.json) with
   the file, the exact token, and a reason.
3. An arbitrary value that only references a CSS variable
   (`w-[var(--sidebar-width)]`, `w-[--sidebar-width]`) is a token reference,
   not a literal, and needs no registration.
4. Inline `style="…"` is never allowed. `:style` (or `v-bind:style`) may only
   bind a runtime-computed value (data, props, `computed`). A literal string or
   an object literal made only of literals
   (`:style="{ height: '200px' }"`) is static styling and fails.

Examples:

```vue
<!-- rejected: 7px has a scale -->
<div class="mt-[7px] rounded-[5px]" />

<!-- accepted: real geometry, registered with a reason -->
<canvas class="h-[320px] w-[520px]" />
```

```json
{
  "kind": "style-guard-exemptions-v1",
  "entries": [
    {
      "file": "packages/chart-ui/src/ChartCanvas.vue",
      "token": "h-[320px]",
      "reason": "ECharts canvas needs a fixed pixel height; no theme-scale equivalent."
    }
  ]
}
```

The registry is fail-closed about rot: an entry whose file no longer exists, or
whose token no longer appears in the file, fails the run and must be deleted. A
duplicate `file + token` entry also fails. Static inline style is never
exemptible.

### Managed dimensions

Derived from the Tailwind v4 theme in `packages/ui-core/src/styles/theme.css`
(`--spacing` step plus the `--radius-*` scale):

| family  | utilities                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spacing | `p px py ps pe pt pr pb pl`, `m mx my ms me mt mr mb ml`, `space-x space-y`, `gap gap-x gap-y`, `w h size`, `min-w min-h max-w max-h`, `inset inset-x inset-y`, `top right bottom left start end`, `translate-x translate-y`, `scroll-m* scroll-p*`, `border-spacing*` |
| radius  | `rounded`, `rounded-s e t r b l`, `rounded-ss se ee es`, `rounded-tl tr br bl`                                                                                                                                                                                         |

### Out of scope for this issue

- Colors (`text-[#…]`, `bg-[hsl(…)]`) belong to the hardcoded-color problem and
  are handled separately; the sidebar color pass is another issue.
- Typography (`text-[11px]`, `leading-[…]`, `tracking-[…]`) uses a different
  scale and the existing micro-type set (10–13px) predates this rule. It is not
  a managed dimension here; a typography pass can extend the guard later.
- Existing violations are not cleaned up by this issue.

### Enforcement lane

The guard is changed-only and cheap, so it runs in the local commit path
(`pnpm check:changed`, after `fmt --check --changed`). It does not add a CI
lane and does not scan the whole workspace.
