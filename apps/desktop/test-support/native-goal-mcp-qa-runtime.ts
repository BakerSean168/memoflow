/**
 * Test-only ESM bundling entrypoint for the installed Windows Codex/Goal E2E.
 * The actual production MCP tool registry is imported unchanged, and package
 * dependencies are externalized to preserve their native ESM conditions.
 */
export { createDesktopLocalAgentTools } from '../src/main/modules/ai/local-agent-tools';
export { LocalAgentRepository } from '@memoflow/ai';
// This test-only ESM bundling entry bundles sibling package sources because
// Playwright's Desktop CJS test loader cannot require their ESM-only exports.
// eslint-disable-next-line @nx/enforce-module-boundaries
export { createTimeContext } from '../../../packages/time/src/index';
// eslint-disable-next-line @nx/enforce-module-boundaries
export { createPowerSyncSqliteFixture } from '../../../packages/test-utils/src/helpers/powersync-sqlite';
