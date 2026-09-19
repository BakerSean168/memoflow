import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.vue']);
const TEST_FILE_PATTERN = /(?:\.test|\.spec)\.[^.]+$/;
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', 'dist', 'node_modules']);

function isProductionSourceFile(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  const basename = path.posix.basename(normalized);
  return (
    SOURCE_EXTENSIONS.has(path.posix.extname(basename)) &&
    !TEST_FILE_PATTERN.test(basename) &&
    !normalized.split('/').includes('__tests__')
  );
}

function walkFiles(root, relativeDirectory = '') {
  const directory = path.join(root, relativeDirectory);
  if (!existsSync(directory)) return [];

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
      files.push(...walkFiles(root, path.join(relativeDirectory, entry.name)));
      continue;
    }
    if (entry.isFile()) files.push(path.join(relativeDirectory, entry.name));
  }
  return files;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function packageSpecifierMatches(specifier, forbiddenPackage) {
  return specifier === forbiddenPackage || specifier.startsWith(`${forbiddenPackage}/`);
}

function extractImportedSpecifiers(source) {
  const withoutComments = stripComments(source);
  const specifiers = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+(?:type\s+)?[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(withoutComments)) !== null) specifiers.push(match[1]);
  }
  return [...new Set(specifiers)];
}

function validateRequiredString(value, label, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) errors.push(`${label} is required`);
}

export function validateCrossDomainOwnershipManifest(manifest) {
  const errors = [];
  if (manifest?.version !== 1) errors.push('manifest.version must equal 1');

  if (!Array.isArray(manifest?.owners) || manifest.owners.length === 0) {
    errors.push('manifest.owners must be a non-empty array');
  } else {
    const ids = new Set();
    for (const [index, owner] of manifest.owners.entries()) {
      const prefix = `owners[${index}]`;
      validateRequiredString(owner?.id, `${prefix}.id`, errors);
      validateRequiredString(owner?.packagePath, `${prefix}.packagePath`, errors);
      if (ids.has(owner?.id)) errors.push(`${prefix}.id duplicates ${owner.id}`);
      ids.add(owner?.id);
      for (const field of ['forbiddenProductionDependencies', 'forbiddenProductionImports']) {
        if (!Array.isArray(owner?.[field])) errors.push(`${prefix}.${field} must be an array`);
      }
      if (!Array.isArray(owner?.forbiddenConfigurationReferences)) {
        errors.push(`${prefix}.forbiddenConfigurationReferences must be an array`);
      } else {
        for (const [referenceIndex, reference] of owner.forbiddenConfigurationReferences.entries()) {
          const referencePrefix = `${prefix}.forbiddenConfigurationReferences[${referenceIndex}]`;
          validateRequiredString(reference?.path, `${referencePrefix}.path`, errors);
          if (!Array.isArray(reference?.values) || reference.values.length === 0) {
            errors.push(`${referencePrefix}.values must be a non-empty array`);
          }
        }
      }
    }
  }

  if (!Array.isArray(manifest?.retiredVocabulary)) {
    errors.push('manifest.retiredVocabulary must be an array');
  } else {
    for (const [index, entry] of manifest.retiredVocabulary.entries()) {
      const prefix = `retiredVocabulary[${index}]`;
      validateRequiredString(entry?.id, `${prefix}.id`, errors);
      validateRequiredString(entry?.token, `${prefix}.token`, errors);
      if (!Array.isArray(entry?.roots) || entry.roots.length === 0) {
        errors.push(`${prefix}.roots must be a non-empty array`);
      }
    }
  }

  if (!Array.isArray(manifest?.exceptions)) {
    errors.push('manifest.exceptions must be an array');
  } else {
    const ids = new Set();
    for (const [index, exception] of manifest.exceptions.entries()) {
      const prefix = `exceptions[${index}]`;
      validateRequiredString(exception?.id, `${prefix}.id`, errors);
      validateRequiredString(exception?.owner, `${prefix}.owner`, errors);
      validateRequiredString(exception?.reason, `${prefix}.reason`, errors);
      validateRequiredString(exception?.retireBy, `${prefix}.retireBy`, errors);
      if (ids.has(exception?.id)) errors.push(`${prefix}.id duplicates ${exception.id}`);
      ids.add(exception?.id);
      if (
        exception?.retireBy === 'permanent' &&
        (typeof exception?.architectureJustification !== 'string' ||
          exception.architectureJustification.trim().length === 0)
      ) {
        errors.push(`${prefix}.architectureJustification is required for permanent exceptions`);
      }
    }
  }

  return errors;
}

function findProductionImportViolations(root, owner) {
  const sourceRoot = path.join(root, owner.packagePath, 'src');
  const forbidden = owner.forbiddenProductionImports ?? [];
  if (forbidden.length === 0 || !existsSync(sourceRoot)) return [];

  const violations = [];
  for (const relativeFile of walkFiles(sourceRoot)) {
    const relativePackageFile = path.join(owner.packagePath, 'src', relativeFile);
    if (!isProductionSourceFile(relativePackageFile)) continue;
    const absoluteFile = path.join(sourceRoot, relativeFile);
    const source = readFileSync(absoluteFile, 'utf8');
    for (const specifier of extractImportedSpecifiers(source)) {
      for (const forbiddenPackage of forbidden) {
        if (packageSpecifierMatches(specifier, forbiddenPackage)) {
          violations.push({
            kind: 'production-import',
            owner: owner.id,
            relativePath: relativePackageFile.replaceAll(path.sep, '/'),
            value: specifier,
          });
        }
      }
    }
  }
  return violations;
}

function findProductionDependencyViolations(root, owner) {
  const packagePath = path.join(root, owner.packagePath, 'package.json');
  const forbidden = new Set(owner.forbiddenProductionDependencies ?? []);
  if (forbidden.size === 0 || !existsSync(packagePath)) return [];

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  return Object.keys(packageJson.dependencies ?? {})
    .filter((dependency) => forbidden.has(dependency))
    .map((dependency) => ({
      kind: 'production-dependency',
      owner: owner.id,
      relativePath: path.join(owner.packagePath, 'package.json').replaceAll(path.sep, '/'),
      value: dependency,
    }));
}

function findConfigurationViolations(root, owner) {
  const violations = [];
  for (const reference of owner.forbiddenConfigurationReferences ?? []) {
    const absolutePath = path.join(root, reference.path);
    if (!existsSync(absolutePath)) continue;
    const source = readFileSync(absolutePath, 'utf8');
    for (const value of reference.values) {
      const pattern = new RegExp(`${escapeRegExp(value)}(?![A-Za-z0-9_-])`);
      if (pattern.test(source)) {
        violations.push({
          kind: 'forbidden-configuration-reference',
          owner: owner.id,
          relativePath: reference.path,
          value,
        });
      }
    }
  }
  return violations;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findRetiredVocabularyViolations(root, entries) {
  const violations = [];
  for (const entry of entries ?? []) {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.token)}\\b`);
    for (const relativeRoot of entry.roots ?? []) {
      const absoluteRoot = path.join(root, relativeRoot);
      for (const relativeFile of walkFiles(absoluteRoot)) {
        const relativePath = path.join(relativeRoot, relativeFile);
        if (!isProductionSourceFile(relativePath)) continue;
        const absoluteFile = path.join(absoluteRoot, relativeFile);
        const source = stripComments(readFileSync(absoluteFile, 'utf8'));
        if (pattern.test(source)) {
          violations.push({
            kind: 'retired-vocabulary',
            owner: entry.owner ?? 'system',
            relativePath: relativePath.replaceAll(path.sep, '/'),
            value: entry.token,
          });
        }
      }
    }
  }
  return violations;
}

export function findCrossDomainOwnershipViolations(root, manifest) {
  const violations = [];
  for (const owner of manifest.owners ?? []) {
    violations.push(...findProductionDependencyViolations(root, owner));
    violations.push(...findProductionImportViolations(root, owner));
    violations.push(...findConfigurationViolations(root, owner));
  }
  violations.push(...findRetiredVocabularyViolations(root, manifest.retiredVocabulary));
  return violations.sort((left, right) =>
    `${left.kind}:${left.relativePath}:${left.value}`.localeCompare(
      `${right.kind}:${right.relativePath}:${right.value}`,
    ),
  );
}
