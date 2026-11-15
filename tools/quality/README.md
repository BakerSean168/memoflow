# Quality tools

## Style discipline: arbitrary values and inline style

`style-guard.mjs` enforces the style rule for newly added code. It is the
changed-file companion to `fmt.mjs`: it only audits **lines added by the current
change**, so the existing backlog cannot block the guard. The spacing backlog
was normalized to the scale below in #946; the remaining arbitrary values are
real geometry and are registered in the exemption file.

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

### Spacing scale (issue #946)

The whole repository shares one spacing scale. There is no per-surface or
per-package variant; a value that is not on the scale is a bug, not a taste.

| px  | Tailwind step | Typical use                                                    |
| --- | ------------- | -------------------------------------------------------------- |
| 2   | `0.5`         | component-internal micro distance (hairline gaps, icon nudges) |
| 4   | `1`           | component-internal micro distance                              |
| 6   | `1.5`         | component-internal micro distance                              |
| 8   | `2`           | workspace density: control padding, list gaps                  |
| 12  | `3`           | workspace density                                              |
| 16  | `4`           | workspace density                                              |
| 20  | `5`           | block separation                                               |
| 24  | `6`           | block separation                                               |
| 32  | `8`           | page section separation                                        |
| 40  | `10`          | page section separation                                        |
| 48  | `12`          | page section separation                                        |
| 64  | `16`          | page section separation                                        |

Bands: 2/4/6 are **component-internal micro distance only**; 8/12/16 are the
workspace rhythm; 20/24 separate blocks inside a page; 32 and above separate
page sections.

Off-scale values snap **down** to the nearest step:

| off-scale px | snapped px | off-scale px | snapped px |
| ------------ | ---------- | ------------ | ---------- |
| 3            | 2          | 25–31        | 24         |
| 5            | 4          | 33–39        | 32         |
| 7            | 6          | 41–47        | 40         |
| 9, 10, 11    | 8          | 49–63        | 48         |
| 13, 14, 15   | 12         |              |            |
| 17, 18, 19   | 16         |              |            |
| 21, 22, 23   | 20         |              |            |

Values above 64px are not snapped mechanically: they are reported and decided by
the coordination line. The decided cases are under
[Reserved space](#reserved-space-预留型).

Prefer the equivalent scale utility (`p-2`, `gap-3`, `mb-6`, `px-8`). Only when
no step exists write the arbitrary form at a scale value (`h-[6px]`).

### Reserved space (预留型)

Some large values are not rhythm at all: they reserve geometry for an overlay, a
floating action area or a host-drawn control. T3 Code keeps the same pattern —
`RightPanelTabs` uses a conditional `pr-28`, `ChatHeader` uses `pr-24`, and macOS
window controls are offset through the host-injected
`--desktop-window-controls-inset` (default `90px`).

A reservation is neither rhythm nor real geometry, so it is not snapped and it
does not belong in
[`style-arbitrary-exemptions.json`](./style-arbitrary-exemptions.json): that
registry only matches arbitrary values (`utility-[…]`), while every case below is
already a scale class. Each one is enumerated here and carries a one-line
comment at the call site naming what the space is reserved for.

| File                                                                                  | Class               | Reserved for                                          |
| ------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------- |
| `packages/ai-ui/src/components/AIConversationSidebar.vue`                             | `pr-24`             | floating action area at the end of a conversation row |
| `packages/notification-ui/src/components/NotificationCapsulePreview.vue`              | conditional `pr-28` | `owner-command` action buttons                        |
| `packages/notification-ui/src/components/NotificationItem.vue`                        | conditional `pr-28` | quick actions                                         |
| `packages/notification-ui/src/components/NotificationPermissionWarning.vue`           | `top-20`            | fixed banner clearing the window title bar            |
| `packages/ui-vue-shadcn/src/components/custom/form/date-time/ReminderOffsetField.vue` | `pr-20`             | suffix unit rendered inside the field                 |
| `packages/ui-vue-shadcn/src/components/ui/drawer/DrawerContent.vue`                   | `mt-24`             | upstream parity with shadcn/vaul drawers              |

The macOS window-control reservation is a named variable rather than a literal:
`--window-controls-inset` (default `80px`) lives with the shell tokens in
`packages/ui-core/src/styles/theme.css`, and `WindowHeader` consumes it only on
macOS. This follows T3's `--desktop-window-controls-inset`, so a host can inject
its own inset without editing the component.

### Layout conventions

- A component owns its internal padding. Consumers must not override component
  padding from the outside (`class="px-...">` on a component that already pads
  itself) and must not pass `p-*` to restyle an existing component's insets.
- Distance **between** components is owned by the parent (`flex`/`grid` plus
  `gap-*`). A child component must not ship its own outer margin to create that
  distance.
- Control heights and icon sizes are geometry, not spacing. Use the component's
  existing size variants (button `size`, input height, avatar size); do not
  drag them into the spacing scale.

### Inline style boundary

- `style="…"` and literal `:style` objects are static styling and are rejected:
  move them to utilities or design tokens.
- `:style` bound to a runtime value is allowed: chart and canvas sizing,
  virtual-list offsets, drag positions, progress percentages, data-driven
  colors. The judgment is whether the value can only be known at runtime, not
  whether the expression happens to be short.

### Managed dimensions

Derived from the Tailwind v4 theme in `packages/ui-core/src/styles/theme.css`
(`--spacing` step plus the `--radius-*` scale):

| family  | utilities                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spacing | `p px py ps pe pt pr pb pl`, `m mx my ms me mt mr mb ml`, `space-x space-y`, `gap gap-x gap-y`, `w h size`, `min-w min-h max-w max-h`, `inset inset-x inset-y`, `top right bottom left start end`, `translate-x translate-y`, `scroll-m* scroll-p*`, `border-spacing*` |
| radius  | `rounded`, `rounded-s e t r b l`, `rounded-ss se ee es`, `rounded-tl tr br bl`                                                                                                                                                                                         |

The scale applies to the distance families (`p*`, `m*`, `gap*`, `space-*`,
`inset*`, `top/right/bottom/left`, `translate-*`). `w/h/size/min-*/max-*` are
managed for the arbitrary-value check but are geometry: they keep their pixel
value and are registered as exemptions instead of being snapped.

### Out of scope

- Colors (`text-[#…]`, `bg-[hsl(…)]`) belong to the hardcoded-color problem and
  are handled separately; the sidebar color pass is another issue.
- Typography (`text-[11px]`, `leading-[…]`, `tracking-[…]`) uses a different
  scale and the existing micro-type set (10–13px) predates this rule. It is not
  a managed dimension here; a typography pass can extend the guard later.
- Radius arbitrary values have no equivalent `--radius-*` token at every pixel
  size; they are registered as exemptions and are a separate radius pass.
- Spacing values above 64px found by the #946 sweep were divided: the six
  reserved-space cases are enumerated under [Reserved space](#reserved-space-预留型)
  and the macOS window-control inset became a named variable.

### Enforcement lane

The guard is changed-only and cheap, so it runs in the local commit path
(`pnpm check:changed`, after `fmt --check --changed`). It does not add a CI
lane and does not scan the whole workspace.
