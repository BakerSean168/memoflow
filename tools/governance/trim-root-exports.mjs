#!/usr/bin/env node
// Trim Root Exports
//
// Removes forbidden re-exports of concrete infrastructure adapters from package root
// barrels (packages/*/src/index.ts). Keeps composition roots (createXModule) and
// type-only exports. This is a best-effort rewrite and preserves other content.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');
const forbidden = /(Prisma|PowerSync|Adapter|Repository)$/;

function main() {
  const pkgs = readdirSync(PACKAGES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const pkg of pkgs) {
    const indexPath = path.join(PACKAGES, pkg, 'src', 'index.ts');
    if (!existsSync(indexPath)) continue;
    let content = readFileSync(indexPath, 'utf8');
    let modified = false;

    // 1) remove `export * from './infrastructure-server'`
    if (/export\s*\*\s*from\s+['"]\.\/infrastructure-server['"]/m.test(content)) {
      content = content.replace(
        /export\s*\*\s*from\s+['"]\.\/infrastructure-server['"];?/m,
        "// removed re-export of './infrastructure-server' to avoid exposing concrete adapters; import specific subpaths instead\n",
      );
      modified = true;
    }

    // 2) sanitize named re-exports from infra
    // matches lines like: export { A, B, type C } from './infrastructure-server';
    content = content.replace(
      /export\s*\{([^}]+)\}\s*from\s+['"]\.\/infrastructure-server['"];?/g,
      (m, names) => {
        const parts = names
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const allowed = [];
        for (const p of parts) {
          // keep factory functions (create*) and names not matching forbidden
          const isType = /^type\s+/.test(p) || /^type\s*$/.test(p);
          const cleanName = p
            .replace(/^type\s+/, '')
            .replace(/^\*/, '')
            .trim();
          if (/^create/i.test(cleanName) || !forbidden.test(cleanName)) {
            // allow create* and non-forbidden symbols (even type or value)
            allowed.push(p);
          } else {
            // remove forbidden concrete infra symbols (including types with infra suffixes)
            modified = true;
          }
        }
        if (allowed.length === 0) {
          return `// removed re-export of infrastructure concrete items from './infrastructure-server'`;
        }
        return `export { ${allowed.join(', ')} } from './infrastructure-server';`;
      },
    );

    if (modified) {
      writeFileSync(indexPath, content, 'utf8');
      console.log(`trimmed: packages/${pkg}/src/index.ts`);
    }
  }
}

main();
