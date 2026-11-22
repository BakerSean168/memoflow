import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createZstdDecompress } from 'node:zlib';

// Rolldown release bindings are stripped. RUST_BACKTRACE=full alone only
// produces raw napi_register_module_v1 addresses without the matching PDB.
// https://rolldown.rs/guide/troubleshooting#panic-debug-info
if (process.platform !== 'win32') {
  throw new Error('Rolldown Windows debug symbols must be installed on a Windows runner');
}

const workspaceRequire = createRequire(resolve(process.cwd(), 'package.json'));
const rolldownPackage = workspaceRequire.resolve('rolldown/package.json');
const rolldownRequire = createRequire(rolldownPackage);
const version = rolldownRequire(rolldownPackage).version;
const bindingPath = rolldownRequire.resolve('@rolldown/binding-win32-x64-msvc');
const symbolName = 'rolldown_binding.pdb';
const symbolPath = join(dirname(bindingPath), symbolName);
const archiveName = 'rolldown-binding.win32-x64-msvc.node.debuginfo.tar.zst';
const tempDir = await mkdtemp(join(tmpdir(), 'rolldown-debug-'));

try {
  execFileSync(
    'gh',
    [
      'release',
      'download',
      `v${version}`,
      '--repo',
      'rolldown/rolldown',
      '--pattern',
      archiveName,
      '--dir',
      tempDir,
    ],
    { stdio: 'inherit' },
  );

  const tarPath = join(tempDir, 'rolldown-debug.tar');
  await pipeline(
    createReadStream(join(tempDir, archiveName)),
    createZstdDecompress(),
    createWriteStream(tarPath),
  );
  execFileSync('tar', ['-xf', tarPath, '-C', dirname(bindingPath), symbolName], {
    stdio: 'inherit',
  });

  const symbols = await stat(symbolPath);
  if (symbols.size < 1024 * 1024) {
    throw new Error('Rolldown PDB is unexpectedly small');
  }
  console.log(
    `Rolldown ${version} Windows PDB ready (${symbols.size} bytes) beside ${bindingPath}`,
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
