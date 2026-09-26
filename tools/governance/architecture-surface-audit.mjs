#!/usr/bin/env node

/**
 * Architecture Surface Audit (RefArch Phase 6).
 * 架构表面审计（RefArch 阶段 6）。
 *
 * Repo-level, manifest-driven, TypeScript-AST checks that lock the three long
 * term architecture facts required by the plan:
 *
 * Repo 级、manifest 驱动、基于 TypeScript AST 的检查，锁定计划要求的三个长期架构事实：
 *
 * 1. Cross-module read Ports — consumer-owned contracts, Application depends on
 *    abstractions only, host composers inject concrete adapters, consumers
 *    never deep-import provider infrastructure.
 *    跨模块读取 Port——消费者拥有的契约、Application 只依赖抽象、宿主 composer
 *    注入具体 adapter、消费者绝不 deep-import provider 基础设施。
 * 2. AI proposal approval — Turn Engine capability carries no `tool.mutation`,
 *    facade approve/revise/reject is lifecycle-only, mutation execution only
 *    runs through the explicit approved/confirm path.
 *    AI proposal approval——Turn Engine 能力不含 `tool.mutation`，facade
 *    approve/revise/reject 仅生命周期，mutation 执行只走显式 approved/confirm 路径。
 * 3. Reliable operation receipt — canonical contract bodies live in contracts
 *    only, and manifest adapters validate output at their boundary.
 *    Reliable operation receipt——规范契约 body 只存在于 contracts，manifest
 *    adapters 在输出边界做校验。
 *
 * Manifest completeness is fail-closed: deleting a declared path/symbol or
 * bypassing a rule makes this audit exit non-zero.
 *
 * Manifest 完整性 fail-closed：删除已声明的 path/symbol 或绕过规则都会让本审计
 * 以非零码退出。
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  parseSource,
  findInterfaceDeclaration,
  findClassDeclaration,
  classImplements,
  findClassMethod,
  containsCallTo,
  containsStringLiteral,
  collectImports,
  walk,
} from './lib/architecture-surface.mjs';

const ROOT = process.env.ARCHITECTURE_SURFACE_ROOT ?? path.join(import.meta.dirname, '..', '..');
const MANIFEST = JSON.parse(
  readFileSync(
    process.env.ARCHITECTURE_SURFACE_MANIFEST ??
      path.join(import.meta.dirname, 'architecture-surface-manifest.json'),
    'utf8',
  ),
);

const violations = [];
const auditedPaths = [];

const SKIPPED_SCAN_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'generated',
  '__tests__',
  '.git',
  '.nx',
  '.tmp',
  'coverage',
  'test-results',
  'playwright-report',
]);

/** Walks a directory collecting files matching a predicate.
 *  Traversal prunes generated/cache/test-output trees before recursion so the
 *  repo-wide production audit does not spend time enumerating ignored content.
 *  遍历目录，收集匹配谓词的文件；在递归前剪枝生成物、缓存与测试输出目录。 */
function walkFiles(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_SCAN_DIRECTORIES.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, predicate, out);
    } else if (entry.isFile() && predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Collects every TypeScript production file under the repo (no tests/dist).
 *  收集仓库内所有 TypeScript 生产文件（排除 tests/dist）。 */
function collectProductionTsFiles() {
  return walkFiles(
    ROOT,
    (file) =>
      /\.(ts|tsx)$/.test(file) &&
      !/\.(spec|test)\.(ts|tsx)$/.test(file) &&
      !file.includes(`${path.sep}dist${path.sep}`) &&
      !file.includes(`${path.sep}node_modules${path.sep}`) &&
      !file.includes(`${path.sep}generated${path.sep}`) &&
      !file.includes(`${path.sep}__tests__${path.sep}`),
  );
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

/** Resolves a manifest-relative path to an absolute path.
 *  将 manifest 相对路径解析为绝对路径。 */
function manifestPath(file) {
  return path.join(ROOT, file);
}

/** Checks a single injection `ref` inside a parsed source file.
 *  在解析后的 source file 中检查单个注入 `ref`。 */
function injectionRefPresent(sourceFile, ref) {
  const newMatch = /^new\s+([A-Za-z_$][\w$]*)\s*\(/.exec(ref);
  if (newMatch) {
    const className = newMatch[1];
    let found = false;
    walk(sourceFile, (node) => {
      if (found) return false;
      if (
        ts.isNewExpression(node) &&
        node.expression &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === className
      ) {
        found = true;
        return false;
      }
    });
    return found;
  }
  let found = false;
  walk(sourceFile, (node) => {
    if (found) return false;
    if (ts.isIdentifier(node) && node.text === ref) {
      found = true;
      return false;
    }
  });
  return found;
}

/** Checks a consumer file imports no provider concrete infrastructure.
 *  检查消费者文件是否导入 provider 具体基础设施。 */
function consumerImportsProvider(sourceFile, providerClassNames, providerFiles) {
  const providerFileNames = providerFiles.map((file) => {
    const base = path.basename(file).replace(/\.ts$/, '');
    return new RegExp(`(${base})(\\.js)?['"]$`);
  });
  for (const imp of collectImports(sourceFile)) {
    if (imp.names.some((name) => providerClassNames.includes(name))) return true;
    if (providerFileNames.some((pattern) => pattern.test(imp.specifier))) return true;
  }
  return false;
}

// ─────────────────────────── Read Port rules ───────────────────────────

function auditReadPorts(manifest) {
  for (const rule of manifest.readPorts) {
    auditedPaths.push(`read-port:${rule.ruleId}`);

    const portFile = manifestPath(rule.port.file);
    if (!existsSync(portFile)) {
      violations.push(`${rule.ruleId}: port file missing ${rule.port.file}`);
      continue;
    }
    auditedPaths.push(rule.port.file);
    const portSource = parseSource(readFileSync(portFile, 'utf8'), rule.port.file);
    if (!findInterfaceDeclaration(portSource, rule.port.symbol)) {
      violations.push(
        `${rule.ruleId}: port symbol ${rule.port.symbol} not declared as an interface in ${rule.port.file}`,
      );
    }

    for (const provider of rule.providers) {
      const providerFile = manifestPath(provider.file);
      auditedPaths.push(provider.file);
      if (!existsSync(providerFile)) {
        violations.push(`${rule.ruleId}: provider file missing ${provider.file}`);
        continue;
      }
      const source = parseSource(readFileSync(providerFile, 'utf8'), provider.file);
      const classDecl = findClassDeclaration(source, provider.class);
      if (!classDecl) {
        violations.push(
          `${rule.ruleId}: provider class ${provider.class} missing in ${provider.file}`,
        );
        continue;
      }
      if (!classImplements(classDecl, rule.port.symbol)) {
        violations.push(
          `${rule.ruleId}: ${provider.class} does not implement ${rule.port.symbol} in ${provider.file}`,
        );
      }
    }

    for (const injection of rule.injections) {
      const injectionFile = manifestPath(injection.file);
      auditedPaths.push(injection.file);
      if (!existsSync(injectionFile)) {
        violations.push(`${rule.ruleId}: injection file missing ${injection.file}`);
        continue;
      }
      const source = parseSource(readFileSync(injectionFile, 'utf8'), injection.file);
      for (const ref of injection.refs) {
        if (!injectionRefPresent(source, ref)) {
          violations.push(`${rule.ruleId}: injection ref "${ref}" missing in ${injection.file}`);
        }
      }
    }

    const providerClasses = rule.providers.map((provider) => provider.class);
    const providerFiles = rule.providers.map((provider) => provider.file);
    for (const consumerDir of rule.consumerDirs) {
      const absoluteDir = manifestPath(consumerDir);
      const files = walkFiles(
        absoluteDir,
        (file) => /\.ts$/.test(file) && !/\.(spec|test)\.ts$/.test(file),
      );
      for (const file of files) {
        auditedPaths.push(relative(file));
        const source = parseSource(readFileSync(file, 'utf8'), relative(file));
        if (consumerImportsProvider(source, providerClasses, providerFiles)) {
          violations.push(
            `${rule.ruleId}: consumer ${relative(file)} imports provider concrete infrastructure`,
          );
        }
      }
    }
  }
}

// ─────────────────────── AI Mastra runtime authority ───────────────────────

function auditAiRuntimeAuthority(manifest) {
  const rule = manifest.aiRuntimeAuthority;
  auditedPaths.push(`ai-runtime-authority:${rule.ruleId}`);

  const runtimeFile = manifestPath(rule.runtime.file);
  auditedPaths.push(rule.runtime.file);
  if (!existsSync(runtimeFile)) {
    violations.push(`${rule.ruleId}: canonical runtime file missing ${rule.runtime.file}`);
  } else {
    const source = parseSource(readFileSync(runtimeFile, 'utf8'), rule.runtime.file);
    const classDecl = findClassDeclaration(source, rule.runtime.class);
    if (!classDecl) {
      violations.push(`${rule.ruleId}: ${rule.runtime.class} missing in ${rule.runtime.file}`);
    } else {
      for (const method of rule.runtime.requiredMethods) {
        if (!findClassMethod(classDecl, method)) {
          violations.push(`${rule.ruleId}: required runtime method ${method} missing in ${rule.runtime.file}`);
        }
      }
    }
  }

  for (const composition of rule.compositions) {
    auditedPaths.push(composition.file);
    const absolute = manifestPath(composition.file);
    if (!existsSync(absolute)) {
      violations.push(`${rule.ruleId}: composition root missing ${composition.file}`);
      continue;
    }
    const source = readFileSync(absolute, 'utf8');
    for (const ref of composition.requiredRefs) {
      if (!source.includes(ref)) {
        violations.push(`${rule.ruleId}: composition ref "${ref}" missing in ${composition.file}`);
      }
    }
  }

  for (const retiredFile of rule.retiredFiles) {
    auditedPaths.push(`retired:${retiredFile}`);
    if (existsSync(manifestPath(retiredFile))) {
      violations.push(`${rule.ruleId}: retired runtime file must stay absent ${retiredFile}`);
    }
  }
}

// ─────────────────────────── AI approval rules ───────────────────────────

function auditAiApproval(manifest) {
  const rule = manifest.aiApproval;
  auditedPaths.push(`ai-approval:${rule.ruleId}`);

  const facade = rule.assistantFacade;
  const facadeFile = manifestPath(facade.file);
  auditedPaths.push(facade.file);
  if (!existsSync(facadeFile)) {
    violations.push(`${rule.ruleId}: assistant facade file missing ${facade.file}`);
  } else {
    const source = parseSource(readFileSync(facadeFile, 'utf8'), facade.file);
    const classDecl = findClassDeclaration(source, facade.class);
    if (!classDecl) {
      violations.push(`${rule.ruleId}: ${facade.class} missing in ${facade.file}`);
    } else {
      for (const method of facade.lifecycleMethods) {
        const methodDecl = findClassMethod(classDecl, method);
        if (!methodDecl || !methodDecl.body) {
          violations.push(`${rule.ruleId}: lifecycle method ${method} missing in ${facade.file}`);
          continue;
        }
        for (const banned of facade.bannedCalls) {
          if (containsCallTo(methodDecl.body, banned)) {
            violations.push(
              `${rule.ruleId}: ${method} must not call ${banned} (lifecycle-only) in ${facade.file}`,
            );
          }
        }
      }
    }
  }

  for (const engineFile of rule.turnEngines.files) {
    auditedPaths.push(engineFile);
    const absolute = manifestPath(engineFile);
    if (!existsSync(absolute)) {
      violations.push(`${rule.ruleId}: turn engine file missing ${engineFile}`);
      continue;
    }
    const source = parseSource(readFileSync(absolute, 'utf8'), engineFile);
    for (const banned of rule.turnEngines.bannedLiterals) {
      if (containsStringLiteral(source, banned)) {
        violations.push(
          `${rule.ruleId}: turn engine ${engineFile} must not offer capability literal "${banned}"`,
        );
      }
    }
  }

  const callName = rule.mutationCallers.call;
  const allowlist = rule.mutationCallers.allowlist.map((file) => path.normalize(file));
  const productionFiles = collectProductionTsFiles();
  for (const file of productionFiles) {
    const rel = relative(file);
    if (allowlist.includes(path.normalize(rel))) continue;
    const source = parseSource(readFileSync(file, 'utf8'), rel);
    if (containsCallTo(source, callName)) {
      violations.push(
        `${rule.ruleId}: ${rel} calls ${callName} outside the allowlisted approved/confirm path`,
      );
    }
  }
}

// ─────────────────────── Reliable receipt rules ───────────────────────

function auditReliableReceipt(manifest) {
  const rule = manifest.reliableReceipt;
  auditedPaths.push(`reliable-receipt:${rule.ruleId}`);

  for (const canonicalFile of rule.canonicalFiles) {
    auditedPaths.push(canonicalFile);
    const absolute = manifestPath(canonicalFile);
    if (!existsSync(absolute)) {
      violations.push(`${rule.ruleId}: canonical contract file missing ${canonicalFile}`);
      continue;
    }
    const source = parseSource(readFileSync(absolute, 'utf8'), canonicalFile);
    // Each canonical type must be declared in AT LEAST ONE canonical file.
    for (const typeName of rule.canonicalTypes) {
      if (hasExportedType(source, typeName)) {
        auditedPaths.push(`${canonicalFile}#${typeName}`);
      }
    }
  }

  // Fail closed if any canonical type is not declared in any canonical file.
  for (const typeName of rule.canonicalTypes) {
    const declared = rule.canonicalFiles.some((file) => {
      if (!existsSync(manifestPath(file))) return false;
      return hasExportedType(parseSource(readFileSync(manifestPath(file), 'utf8'), file), typeName);
    });
    if (!declared) {
      violations.push(
        `${rule.ruleId}: canonical type ${typeName} not declared in any canonical file`,
      );
    }
  }

  // Validators must exist in contracts (the unique source of receipt validation).
  const portsFile = manifestPath(rule.validatorFile);
  auditedPaths.push(rule.validatorFile);
  const portsSource = parseSource(readFileSync(portsFile, 'utf8'), rule.validatorFile);
  for (const validator of rule.validators) {
    if (!containsFunctionDeclaration(portsSource, validator)) {
      violations.push(`${rule.ruleId}: validator ${validator} not declared in contracts ports.ts`);
    }
  }

  const canonicalPaths = rule.canonicalFiles.map((file) => path.normalize(file));
  for (const file of collectProductionTsFiles()) {
    const rel = relative(file);
    if (canonicalPaths.includes(path.normalize(rel))) continue;
    const source = parseSource(readFileSync(file, 'utf8'), rel);
    for (const typeName of rule.canonicalTypes) {
      if (hasExportedType(source, typeName)) {
        violations.push(
          `${rule.ruleId}: ${rel} defines a local duplicate of canonical type ${typeName}`,
        );
      }
    }
  }

  const receiptValidator = 'assertValidBusinessOperationReceipt';
  for (const adapter of rule.receiptAdapters) {
    auditedPaths.push(adapter);
    const absolute = manifestPath(adapter);
    if (!existsSync(absolute)) {
      violations.push(`${rule.ruleId}: adapter file missing ${adapter}`);
      continue;
    }
    const source = parseSource(readFileSync(absolute, 'utf8'), adapter);
    const imports = collectImports(source).flatMap((imp) => imp.names);
    const imported = imports.includes(receiptValidator);
    const called = containsCallTo(source, receiptValidator);
    if (!imported || !called) {
      violations.push(
        `${rule.ruleId}: ${adapter} must import and call ${receiptValidator} at the output boundary`,
      );
    }
  }
}

/** Checks a source file exports a named function declaration.
 *  检查 source file 是否导出指定函数声明。 */
function containsFunctionDeclaration(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    if (statement.name.text === name) return true;
  }
  return false;
}

/** Checks a source file exports the named type/interface/const schema.
 *  检查 source file 是否导出指定 type/interface/const schema。 */
function hasExportedType(sourceFile, name) {
  let found = false;
  for (const statement of sourceFile.statements) {
    if ((ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) === 0) continue;
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) found = true;
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) found = true;
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === `${name}Schema`) found = true;
      }
    }
  }
  return found;
}

auditReadPorts(MANIFEST);
if (MANIFEST.aiRuntimeAuthority) auditAiRuntimeAuthority(MANIFEST);
if (MANIFEST.aiApproval) auditAiApproval(MANIFEST);
if (MANIFEST.reliableReceipt) auditReliableReceipt(MANIFEST);

if (violations.length > 0) {
  console.error(`[architecture-surface-audit] failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log(
  `[architecture-surface-audit] passed. audited ${auditedPaths.length} manifest path(s)/symbol(s).`,
);
