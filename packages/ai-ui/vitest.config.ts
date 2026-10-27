import vue from "@vitejs/plugin-vue";
import { mergeConfig } from "vitest/config";
import { createPackageVitestConfig } from "../../vitest.shared.ts";
import { createUiVueSourceAliasEntries } from "../../vite.workspace-aliases.ts";
import path from "node:path";

export default mergeConfig(
  createPackageVitestConfig({
    projectRoot: import.meta.dirname,
    name: "ai-ui",
    environment: "happy-dom",
    aliasEntries: [
      {
        find: /^@ai-ui-test-host\/(.+)$/,
        replacement: path.resolve(import.meta.dirname, "../app-vue/src/$1"),
      },
      ...createUiVueSourceAliasEntries(
        path.resolve(import.meta.dirname, "../.."),
      ),
    ],
    aliases: {
      "@memoflow/goal-client": "../../packages/goal-client/src/index.ts",
      "@memoflow/http-client": "../../packages/http-client/src/index.ts",
      "@memoflow/ipc-client": "../../packages/ipc-client/src/index.ts",
      "@memoflow/ai-client": "../../packages/ai-client/src/index.ts",
      "@memoflow/ai/testing": "../../packages/ai/src/testing/index.ts",
      "@memoflow/task-client": "../../packages/task-client/src/index.ts",
      "@memoflow/repository-client":
        "../../packages/repository-client/src/index.ts",
    },
    setupFiles: ["../app-vue/src/test/setup.ts"],
  }),
  { plugins: [vue()], test: { include: ["src/**/*.{test,spec}.{ts,tsx}"] } },
);
