# Third-Party Notices

MemoFlow is open source under the [MIT License](LICENSE). This file records third-party software and brand assets adopted or studied by MemoFlow. Third-party components retain their upstream licenses, and brand marks remain trademarks of their respective owners.

## Better Auth

- Project: Better Auth
- Source: https://github.com/better-auth/better-auth
- Version used: 1.6.25
- License: MIT
- Use: Runtime dependency for cloud email/password, OAuth, session, bearer, and Prisma adapter functionality.

The distributed dependency retains its upstream license and copyright information.

## LobeHub Icons (@lobehub/icons)

- Project: LobeHub Icons
- Source: https://github.com/lobehub/lobe-icons (npm package `@lobehub/icons`)
- Version used: 5.23.1
- License: MIT (c) 2023 LobeHub
- Use: Path data of the Codex, Claude, DeepSeek and Mastra monochrome brand marks (package files `es/Codex/components/Mono.mjs`, `es/Claude/components/Mono.mjs`, `es/DeepSeek/components/Mono.mjs`, `es/Mastra/components/Mono.mjs`) is copied verbatim into `packages/ai-ui/src/components/agent-brand-glyphs.ts` for the `AgentDriverIcon` component (#457). No package code or React components are distributed; only the SVG path data of the four marks is reproduced. Retrieval evidence, exact upstream URLs and license notes: [`AgentDriverIcon.SOURCES.md`](packages/ai-ui/src/components/AgentDriverIcon.SOURCES.md).

Upstream license text (npm package `LICENSE`, verbatim):

```text
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The MIT license covers the copyright of these icon assets and their
redistribution. The Codex, Claude, DeepSeek and Mastra marks themselves remain
trademarks of their respective owners (OpenAI, Anthropic, DeepSeek, Mastra);
MemoFlow displays them only to identify the corresponding agent integrations
and claims no endorsement.

## Pi coding agent brand assets (official press kit)

- Project: Pi (coding agent) — Earendil Inc. & Contributors
- Source: official press kit at https://pi.dev/press-kit (square badge mark `https://pi.dev/favicon.svg`)
- License: MIT, declared on the press-kit page itself, which states: "Earendil Inc. & Contributors — Press Kit — MIT License"
- Use: The three path segments of the monochrome square badge mark are copied verbatim into `packages/ai-ui/src/components/agent-brand-glyphs.ts` for the `pi` driver of the `AgentDriverIcon` component (#457). The badge's original explicit light/dark fills are rendered with `currentColor` instead; the geometry is unmodified. Retrieval evidence and notes: [`AgentDriverIcon.SOURCES.md`](packages/ai-ui/src/components/AgentDriverIcon.SOURCES.md).

The press kit declares its assets MIT-licensed with the attribution above, but the
page does not reprint the license text. To keep the full grant and disclaimer
available, the standard MIT License terms are reproduced below as the terms the
press kit invokes through its own MIT declaration. The attribution line follows the
press kit's verifiable byline, "Earendil Inc. & Contributors" (the page states no
copyright year). This is the standard MIT wording, not a verbatim copy of any
press-kit document; the wording was cross-checked against the `earendil-works/pi`
repository LICENSE, whose copyright line (Copyright (c) 2025 Mario Zechner) covers
that repository's code and is not asserted here as the copyright of the press-kit
artwork.

```text
MIT License

Copyright (c) Earendil Inc. & Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The Pi logo remains a trademark of Earendil Inc.; MemoFlow displays it only to
identify the Pi coding agent integration and claims no endorsement.

## Architecture References

AFFiNE, Bitwarden, Notesnook, Anytype, AppFlowy, Steam Offline Mode, Electron safeStorage, and Joplin E2EE were used only as architecture and product-behavior references. No source code was copied from these projects in this rewrite.

## T3 Code Composer & Chat Timeline Projection

- Source: https://github.com/pingdotgg/t3code (revisions `f9b19a7f8` and `0b42e2e2febf51627d6c150be686c02d26ef2739`).
- Use:
  - Adapted the custom atomic inline mention and attachment-path prompt patterns to MemoFlow Vue and native Agent runtime.
  - Adapted ComposerSurface Shell/Host/Main, FooterControls and PrimaryActions to Vue 3 in `AIFooterComposerSurface.vue`, `AIFooterComposerFooterControls.vue` and `AIFooterComposerPrimaryActions.vue` from revision `0b42e2e2febf51627d6c150be686c02d26ef2739`.
  - Adapted the pure chat timeline/turn projection (`MessagesTimeline.logic.ts`), work-group/working row presentation (`TimelineWorkGroupRows.tsx`, `TimelineWorkEntryRow.tsx`), shared `secondTick` clock (`clock.ts`), and duration formatting (`orchestrationTimingCopy.ts`) into `packages/ai-ui/src/composables/agentActivity.ts`, `packages/ai-ui/src/components/AIWorkGroupRows.vue`, and `packages/ai-ui/src/components/AIMessagePanel.vue`.

## T3 Code Composer, Sidebar, and List Motion

- Source: https://github.com/pingdotgg/t3code (revisions f9b19a7f8 and 0b42e2e2febf51627d6c150be686c02d26ef2739, files `apps/web/src/components/Sidebar.motion.ts`, `apps/web/src/components/sidebar/SidebarThreadRow.tsx`, `apps/web/src/components/Sidebar.logic.ts`).
- Use: Adapted the custom atomic inline mention and attachment-path prompt patterns, `createSidebarListMotion` DOM/WAAPI list animation logic, and `SidebarThreadRow` row layout / status resolution patterns to MemoFlow Vue composables and components (`packages/ai-ui/src/composables/sidebarListMotion.ts`, `packages/ai-ui/src/components/AIConversationSidebarRow.vue`, `packages/ai-ui/src/composables/useDurableConversationAttention.ts`).

- License: MIT.

```text
MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```
