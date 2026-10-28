import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { build } from 'vite';

test('patterns Vite build preserves root Markdown asset paths and bytes', async (t) => {
  const root = path.resolve('packages/patterns');
  const outDir = await mkdtemp(path.join(root, '.tmp-vite-assets-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await build({
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'error',
    build: {
      outDir,
      emptyOutDir: true,
      lib: { entry: 'src/index.ts', formats: ['es'] },
      rollupOptions: { external: (id) => !id.startsWith('.') && !path.isAbsolute(id) },
    },
  });
  const markdown = (await readdir(root)).filter((file) => file.endsWith('.md')).sort();
  assert.ok(markdown.includes('README.md'));
  assert.deepEqual((await readdir(outDir)).filter((file) => file.endsWith('.md')).sort(), markdown);
  for (const file of markdown) {
    assert.deepEqual(
      await readFile(path.join(outDir, file)),
      await readFile(path.join(root, file)),
    );
  }
});
