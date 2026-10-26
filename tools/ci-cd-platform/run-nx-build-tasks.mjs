#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { digest } from './lib/contracts.mjs';
import { executeBuildTasks } from './lib/nx-build-tasks.mjs';

const keys = process.argv.slice(2);
const result = await executeBuildTasks(keys);
await mkdir('reports/ci-tasks', { recursive: true });
await writeFile(`reports/ci-tasks/nx-build-${digest(keys)}.result`, JSON.stringify(result));
if (!result.success) process.exitCode = 1;
