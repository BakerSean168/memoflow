import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { analyzeSource, classSequences, classTokens, elementMatches } from './vue-source-ast.mjs';

/**
 * App-vue structural rules: the AST/type-level successor to source-text locks.
 *
 * A rule names a file (or a scan root) and asserts structure that must hold:
 * template elements and attributes, class tokens, imports/exports, identifiers,
 * calls and object-property literals. Unlike a text lock, comments and
 * formatting cannot trip a rule and a rename is reported at the AST node.
 */

const CHECK_KEYS = [
  'requireElements',
  'forbidElements',
  'requireAttributes',
  'forbidAttributes',
  'requireClassTokens',
  'forbidClassTokens',
  'requireClassSequences',
  'forbidClassSequences',
  'requireClassPatterns',
  'forbidClassPatterns',
  'requireIdentifiers',
  'forbidIdentifiers',
  'requireCalls',
  'forbidCalls',
  'requireCallPatterns',
  'forbidCallPatterns',
  'forbidNewExpressions',
  'requireMemberPaths',
  'forbidMemberPaths',
  'requireExpressions',
  'forbidExpressions',
  'requireExpressionPatterns',
  'forbidExpressionPatterns',
  'requireStatements',
  'forbidStatements',
  'requireStatementPatterns',
  'forbidStatementPatterns',
  'requireTypeReferences',
  'forbidTypeReferences',
  'requireTypeNodes',
  'forbidTypeNodes',
  'requireTypePatterns',
  'forbidTypePatterns',
  'requireTypeMembers',
  'forbidTypeMembers',
  'requireStringLiterals',
  'forbidStringLiterals',
  'requireStringFragments',
  'forbidStringFragments',
  'requireCssText',
  'forbidCssText',
  'requireImports',
  'forbidImports',
  'requireExports',
  'forbidExports',
  'requireInterfaces',
  'forbidInterfaces',
  'requireTypeAliases',
  'forbidTypeAliases',
  'requirePropertyNames',
  'forbidPropertyNames',
  'requireObjectProperties',
  'forbidObjectProperties',
  'requireObjectPropertyTexts',
  'forbidObjectPropertyTexts',
  'counts',
];

const SUPPORTED_EXTENSIONS = ['.vue', '.ts', '.tsx'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isValidRegex(value) {
  if (!value || typeof value.pattern !== 'string') return false;
  try {
    new RegExp(value.pattern, value.flags ?? '');
    return true;
  } catch {
    return false;
  }
}

function validateImport(rule, key, errors) {
  for (const [index, entry] of (rule[key] ?? []).entries()) {
    const from = typeof entry === 'string' ? entry : entry?.from;
    if (
      !isNonEmptyString(from) &&
      !isNonEmptyString(entry?.fromPrefix) &&
      !isNonEmptyString(entry?.fromPattern)
    ) {
      errors.push(`${key}[${index}] needs from, fromPrefix or fromPattern`);
    }
    if (typeof entry === 'object' && entry.names !== undefined && !stringArray(entry.names)) {
      errors.push(`${key}[${index}].names must be strings`);
    }
    if (
      typeof entry === 'object' &&
      entry.fromPattern !== undefined &&
      !isValidRegex({ pattern: entry.fromPattern })
    ) {
      errors.push(`${key}[${index}].fromPattern must be a valid pattern`);
    }
  }
}

function validateObjectProperty(rule, key, errors) {
  for (const [index, entry] of (rule[key] ?? []).entries()) {
    if (!isNonEmptyString(entry?.name)) {
      errors.push(`${key}[${index}] needs a name`);
    }
    if (
      entry?.value !== undefined &&
      typeof entry.value !== 'string' &&
      typeof entry.value !== 'number'
    ) {
      errors.push(`${key}[${index}].value must be a string or number`);
    }
    if (entry?.valuePrefix !== undefined && typeof entry.valuePrefix !== 'string') {
      errors.push(`${key}[${index}].valuePrefix must be a string`);
    }
  }
}

function validateCount(rule, index, count, errors) {
  if (
    ![
      'element',
      'attribute',
      'call',
      'identifier',
      'classToken',
      'statementPattern',
      'expressionPattern',
      'exportPattern',
      'property',
      'propertyName',
      'symbol',
      'callOrIdentifier',
    ].includes(count?.kind)
  ) {
    errors.push(`counts[${index}] has invalid kind`);
  }
  if (
    ['statementPattern', 'expressionPattern', 'exportPattern', 'property'].includes(count?.kind)
  ) {
    if (
      !isNonEmptyString(count?.pattern) ||
      !isValidRegex({ pattern: count.pattern, flags: count.flags })
    ) {
      errors.push(`counts[${index}] needs a valid pattern`);
    }
  } else if (!isNonEmptyString(count?.name) && !isNonEmptyString(count?.value)) {
    errors.push(`counts[${index}] needs name or value`);
  }
  if (!Number.isInteger(count?.equals) && !Number.isInteger(count?.min)) {
    errors.push(`counts[${index}] needs equals or min`);
  }
}

export function validateStructureRuleManifest(manifest) {
  const errors = [];
  if (manifest?.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(manifest?.rules) || manifest.rules.length === 0) {
    errors.push('rules must be a non-empty array');
    return errors;
  }
  const ids = new Set();
  manifest.rules.forEach((rule, index) => {
    const prefix = `rules[${index}]`;
    if (!isNonEmptyString(rule?.id)) errors.push(`${prefix}.id is required`);
    if (ids.has(rule?.id)) errors.push(`${prefix}.id duplicates ${rule.id}`);
    ids.add(rule?.id);
    if (!isNonEmptyString(rule?.reason)) errors.push(`${prefix}.reason is required`);

    const hasFile = isNonEmptyString(rule?.file);
    const hasFiles =
      Array.isArray(rule?.files) && rule.files.length > 0 && rule.files.every(isNonEmptyString);
    const hasScan = rule?.scan !== undefined;
    const hasPaths = Array.isArray(rule?.absentPaths) || Array.isArray(rule?.presentPaths);
    if ([hasFile, hasFiles, hasScan, hasPaths].filter(Boolean).length !== 1) {
      errors.push(`${prefix} must declare exactly one of file, files, scan or absent/presentPaths`);
    }
    if (hasScan) {
      if (!isNonEmptyString(rule.scan?.root) || !stringArray(rule.scan?.extensions)) {
        errors.push(`${prefix}.scan needs root and extensions`);
      }
      if (
        !(rule.scan?.extensions ?? []).every((extension) =>
          SUPPORTED_EXTENSIONS.includes(extension),
        )
      ) {
        errors.push(`${prefix}.scan only supports ${SUPPORTED_EXTENSIONS.join(', ')}`);
      }
      if (rule.scan?.exclude !== undefined && !stringArray(rule.scan.exclude)) {
        errors.push(`${prefix}.scan.exclude must be strings`);
      }
    }
    if ((hasFile || hasFiles) && !hasPaths) {
      const files = hasFile ? [rule.file] : rule.files;
      for (const file of files) {
        if (!SUPPORTED_EXTENSIONS.some((extension) => file.endsWith(extension))) {
          errors.push(`${prefix}.file ${file} is not a ${SUPPORTED_EXTENSIONS.join('/')} file`);
        }
      }
    }

    for (const key of CHECK_KEYS) {
      if (rule[key] === undefined) continue;
      if (!Array.isArray(rule[key])) {
        errors.push(`${prefix}.${key} must be an array`);
        continue;
      }
      switch (key) {
        case 'requireElements':
        case 'forbidElements':
          for (const [elementIndex, element] of rule[key].entries()) {
            const name = typeof element === 'string' ? element : element?.name;
            if (!isNonEmptyString(name))
              errors.push(`${prefix}.${key}[${elementIndex}] needs a name`);
            if (
              typeof element === 'object' &&
              element.attrs !== undefined &&
              typeof element.attrs !== 'object'
            ) {
              errors.push(`${prefix}.${key}[${elementIndex}].attrs must be an object`);
            }
          }
          break;
        case 'requireAttributes':
        case 'forbidAttributes':
          for (const [attributeIndex, attribute] of rule[key].entries()) {
            if (!isNonEmptyString(attribute?.name)) {
              errors.push(`${prefix}.${key}[${attributeIndex}] needs a name`);
            }
            if (attribute?.value !== undefined && typeof attribute.value !== 'string') {
              errors.push(`${prefix}.${key}[${attributeIndex}].value must be a string`);
            }
          }
          break;
        case 'requireClassTokens':
        case 'forbidClassTokens':
        case 'requireIdentifiers':
        case 'forbidIdentifiers':
        case 'requireCalls':
        case 'forbidCalls':
        case 'forbidNewExpressions':
        case 'requireMemberPaths':
        case 'forbidMemberPaths':
        case 'requireExpressions':
        case 'forbidExpressions':
        case 'requireStatements':
        case 'forbidStatements':
        case 'requireTypeReferences':
        case 'forbidTypeReferences':
        case 'requireTypeNodes':
        case 'forbidTypeNodes':
        case 'requireTypeMembers':
        case 'forbidTypeMembers':
        case 'requireStringLiterals':
        case 'forbidStringLiterals':
        case 'requireStringFragments':
        case 'forbidStringFragments':
        case 'requireCssText':
        case 'forbidCssText':
        case 'requireExports':
        case 'forbidExports':
        case 'requireInterfaces':
        case 'forbidInterfaces':
        case 'requireTypeAliases':
        case 'forbidTypeAliases':
        case 'requirePropertyNames':
        case 'forbidPropertyNames':
          if (!stringArray(rule[key])) errors.push(`${prefix}.${key} must be non-empty strings`);
          break;
        case 'requireClassPatterns':
        case 'forbidClassPatterns':
        case 'requireCallPatterns':
        case 'forbidCallPatterns':
        case 'requireExpressionPatterns':
        case 'forbidExpressionPatterns':
        case 'requireStatementPatterns':
        case 'forbidStatementPatterns':
        case 'requireTypePatterns':
        case 'forbidTypePatterns':
          for (const [patternIndex, pattern] of rule[key].entries()) {
            if (!isNonEmptyString(pattern?.pattern) || !isValidRegex(pattern)) {
              errors.push(`${prefix}.${key}[${patternIndex}] needs a valid pattern`);
            }
          }
          break;
        case 'requireClassSequences':
        case 'forbidClassSequences':
          for (const [sequenceIndex, sequence] of rule[key].entries()) {
            if (!stringArray(sequence) || sequence.length < 2) {
              errors.push(`${prefix}.${key}[${sequenceIndex}] needs at least two tokens`);
            }
          }
          break;
        case 'requireImports':
        case 'forbidImports':
          validateImport(rule, key, errors);
          break;
        case 'requireObjectProperties':
        case 'forbidObjectProperties':
          validateObjectProperty(rule, key, errors);
          break;
        case 'requireObjectPropertyTexts':
        case 'forbidObjectPropertyTexts':
          if (!stringArray(rule[key])) errors.push(`${prefix}.${key} must be non-empty strings`);
          break;
        case 'counts':
          for (const [countIndex, count] of rule[key].entries())
            validateCount(rule, countIndex, count, errors);
          break;
      }
    }

    const declaresCheck = CHECK_KEYS.some((key) => (rule[key]?.length ?? 0) > 0);
    if (!declaresCheck && !hasPaths) errors.push(`${prefix} declares no structural check`);
  });
  return errors;
}

function hasSequence(sequences, wanted) {
  return sequences.some((tokens) => {
    for (let start = 0; start + wanted.length <= tokens.length; start += 1) {
      let matches = true;
      for (let offset = 0; offset < wanted.length; offset += 1) {
        if (tokens[start + offset] !== wanted[offset]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
    return false;
  });
}

function importMatches(imported, expected) {
  if (expected.from !== undefined && imported.from !== expected.from) return false;
  if (expected.fromPrefix !== undefined && !imported.from.startsWith(expected.fromPrefix))
    return false;
  if (expected.fromPattern !== undefined && !new RegExp(expected.fromPattern).test(imported.from))
    return false;
  if (!expected.names || expected.names.length === 0) return true;
  return expected.names.every((name) => imported.names.includes(name));
}

function countOf(analysis, count) {
  switch (count.kind) {
    case 'element':
      return analysis.elements.filter((element) => element.tag === count.name).length;
    case 'attribute':
      return analysis.elements.reduce(
        (sum, element) =>
          sum +
          element.attributes.filter(
            (attribute) =>
              attribute.name === count.name &&
              (count.value === undefined || attribute.value === count.value),
          ).length,
        0,
      );
    case 'call':
      return analysis.calls.get(count.name) ?? 0;
    case 'identifier':
      return analysis.identifiers.get(count.name) ?? 0;
    case 'classToken':
      return classTokens(analysis).has(count.name) ? 1 : 0;
    case 'statementPattern':
      return [...analysis.statements.keys()].filter((text) =>
        new RegExp(count.pattern, count.flags ?? '').test(text),
      ).length;
    case 'expressionPattern':
      return [...analysis.expressions.keys()].filter((text) =>
        new RegExp(count.pattern, count.flags ?? '').test(text),
      ).length;
    case 'exportPattern':
      return [...analysis.exports].filter((name) =>
        new RegExp(count.pattern, count.flags ?? '').test(name),
      ).length;
    case 'property':
      return [...analysis.objectPropertyTexts.keys()].filter((text) =>
        new RegExp(count.pattern, count.flags ?? '').test(text),
      ).length;
    case 'propertyName':
      return analysis.propertyNames.get(count.name) ?? 0;
    case 'symbol':
      return (
        (analysis.identifiers.get(count.name) ?? 0) +
        analysis.elements.filter((element) => element.tag === count.name).length
      );
    case 'callOrIdentifier':
      return (analysis.calls.get(count.name) ?? 0) + (analysis.identifiers.get(count.name) ?? 0);
    default:
      return 0;
  }
}

export function checkFile(file, analysis, rule) {
  const violations = [];
  const report = (detail) => violations.push({ id: rule.id, file, detail });

  for (const element of rule.requireElements ?? []) {
    const name = typeof element === 'string' ? element : element.name;
    const attrs = typeof element === 'string' ? undefined : element.attrs;
    if (!analysis.elements.some((candidate) => elementMatches(candidate, name, attrs))) {
      report(`required element <${name}> missing`);
    }
  }
  for (const element of rule.forbidElements ?? []) {
    const name = typeof element === 'string' ? element : element.name;
    const attrs = typeof element === 'string' ? undefined : element.attrs;
    if (analysis.elements.some((candidate) => elementMatches(candidate, name, attrs))) {
      report(`forbidden element <${name}> present`);
    }
  }

  const attributes = analysis.elements.flatMap((element) => element.attributes);
  for (const attribute of rule.requireAttributes ?? []) {
    const found = attributes.some(
      (candidate) =>
        candidate.name === attribute.name &&
        (attribute.value === undefined || candidate.value === attribute.value),
    );
    if (!found) {
      report(
        `required attribute ${attribute.name}${attribute.value === undefined ? '' : `="${attribute.value}"`} missing`,
      );
    }
  }
  for (const attribute of rule.forbidAttributes ?? []) {
    const found = attributes.some(
      (candidate) =>
        candidate.name === attribute.name &&
        (attribute.value === undefined || candidate.value === attribute.value),
    );
    if (found) {
      report(
        `forbidden attribute ${attribute.name}${attribute.value === undefined ? '' : `="${attribute.value}"`} present`,
      );
    }
  }

  const tokens = classTokens(analysis);
  for (const token of rule.requireClassTokens ?? []) {
    if (!tokens.has(token)) report(`required class token ${token} missing`);
  }
  for (const token of rule.forbidClassTokens ?? []) {
    if (tokens.has(token)) report(`forbidden class token ${token} present`);
  }
  const sequences = classSequences(analysis);
  for (const sequence of rule.requireClassSequences ?? []) {
    if (!hasSequence(sequences, sequence))
      report(`required class sequence "${sequence.join(' ')}" missing`);
  }
  for (const sequence of rule.forbidClassSequences ?? []) {
    if (hasSequence(sequences, sequence))
      report(`forbidden class sequence "${sequence.join(' ')}" present`);
  }
  for (const pattern of rule.requireClassPatterns ?? []) {
    if (
      ![...tokens].some((token) => new RegExp(pattern.pattern, pattern.flags ?? '').test(token))
    ) {
      report(`required class pattern /${pattern.pattern}/ missing`);
    }
  }
  for (const pattern of rule.forbidClassPatterns ?? []) {
    if ([...tokens].some((token) => new RegExp(pattern.pattern, pattern.flags ?? '').test(token))) {
      report(`forbidden class pattern /${pattern.pattern}/ present`);
    }
  }

  for (const name of rule.requireIdentifiers ?? []) {
    if (!analysis.identifiers.has(name)) report(`required identifier ${name} missing`);
  }
  for (const name of rule.forbidIdentifiers ?? []) {
    if (analysis.identifiers.has(name)) report(`forbidden identifier ${name} present`);
  }
  for (const name of rule.requireCalls ?? []) {
    if (!analysis.calls.has(name)) report(`required call ${name}() missing`);
  }
  for (const name of rule.forbidCalls ?? []) {
    if (analysis.calls.has(name)) report(`forbidden call ${name}() present`);
  }
  for (const pattern of rule.requireCallPatterns ?? []) {
    if (
      ![...analysis.calls.keys()].some((name) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(name),
      )
    ) {
      report(`required call pattern /${pattern.pattern}/ missing`);
    }
  }
  for (const pattern of rule.forbidCallPatterns ?? []) {
    if (
      [...analysis.calls.keys()].some((name) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(name),
      )
    ) {
      report(`forbidden call pattern /${pattern.pattern}/ present`);
    }
  }
  for (const name of rule.forbidNewExpressions ?? []) {
    if (analysis.newExpressions.has(name)) report(`forbidden new ${name}() present`);
  }
  for (const name of rule.requireMemberPaths ?? []) {
    if (!analysis.memberPaths.has(name)) report(`required member path ${name} missing`);
  }
  for (const name of rule.forbidMemberPaths ?? []) {
    if (analysis.memberPaths.has(name)) report(`forbidden member path ${name} present`);
  }
  for (const text of rule.requireExpressions ?? []) {
    if (!analysis.expressions.has(text)) report(`required expression ${text} missing`);
  }
  for (const text of rule.forbidExpressions ?? []) {
    if (analysis.expressions.has(text)) report(`forbidden expression ${text} present`);
  }
  for (const pattern of rule.requireExpressionPatterns ?? []) {
    if (
      ![...analysis.expressions.keys()].some((text) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(text),
      )
    ) {
      report(`required expression pattern /${pattern.pattern}/ missing`);
    }
  }
  for (const pattern of rule.forbidExpressionPatterns ?? []) {
    if (
      [...analysis.expressions.keys()].some((text) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(text),
      )
    ) {
      report(`forbidden expression pattern /${pattern.pattern}/ present`);
    }
  }
  for (const text of rule.requireStatements ?? []) {
    if (!analysis.statements.has(text)) report(`required statement ${text} missing`);
  }
  for (const text of rule.forbidStatements ?? []) {
    if (analysis.statements.has(text)) report(`forbidden statement ${text} present`);
  }
  for (const pattern of rule.requireStatementPatterns ?? []) {
    if (
      ![...analysis.statements.keys()].some((text) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(text),
      )
    ) {
      report(`required statement pattern /${pattern.pattern}/ missing`);
    }
  }
  for (const pattern of rule.forbidStatementPatterns ?? []) {
    if (
      [...analysis.statements.keys()].some((text) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(text),
      )
    ) {
      report(`forbidden statement pattern /${pattern.pattern}/ present`);
    }
  }
  for (const name of rule.requireTypeReferences ?? []) {
    if (!analysis.typeReferences.has(name)) report(`required type reference ${name} missing`);
  }
  for (const name of rule.forbidTypeReferences ?? []) {
    if (analysis.typeReferences.has(name)) report(`forbidden type reference ${name} present`);
  }
  for (const text of rule.requireTypeNodes ?? []) {
    if (!analysis.typeNodes.has(text)) report(`required type node ${text} missing`);
  }
  for (const text of rule.forbidTypeNodes ?? []) {
    if (analysis.typeNodes.has(text)) report(`forbidden type node ${text} present`);
  }
  for (const pattern of rule.requireTypePatterns ?? []) {
    if (
      ![...analysis.typeNodes.keys()].some((text) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(text),
      )
    ) {
      report(`required type pattern /${pattern.pattern}/ missing`);
    }
  }
  for (const pattern of rule.forbidTypePatterns ?? []) {
    if (
      [...analysis.typeNodes.keys()].some((text) =>
        new RegExp(pattern.pattern, pattern.flags ?? '').test(text),
      )
    ) {
      report(`forbidden type pattern /${pattern.pattern}/ present`);
    }
  }
  for (const text of rule.requireTypeMembers ?? []) {
    if (!analysis.typeMembers.has(text)) report(`required type member ${text} missing`);
  }
  for (const text of rule.forbidTypeMembers ?? []) {
    if (analysis.typeMembers.has(text)) report(`forbidden type member ${text} present`);
  }
  for (const text of rule.requireStringLiterals ?? []) {
    if (!analysis.stringLiterals.includes(text))
      report(`required string literal ${JSON.stringify(text)} missing`);
  }
  for (const text of rule.forbidStringLiterals ?? []) {
    if (analysis.stringLiterals.includes(text))
      report(`forbidden string literal ${JSON.stringify(text)} present`);
  }
  for (const text of rule.requireStringFragments ?? []) {
    if (!analysis.stringLiterals.some((literal) => literal.includes(text))) {
      report(`required string fragment ${JSON.stringify(text)} missing`);
    }
  }
  for (const text of rule.forbidStringFragments ?? []) {
    if (analysis.stringLiterals.some((literal) => literal.includes(text))) {
      report(`forbidden string fragment ${JSON.stringify(text)} present`);
    }
  }
  for (const text of rule.requireCssText ?? []) {
    if (!analysis.cssText.some((content) => content.includes(text)))
      report(`required CSS text ${JSON.stringify(text)} missing`);
  }
  for (const text of rule.forbidCssText ?? []) {
    if (analysis.cssText.some((content) => content.includes(text)))
      report(`forbidden CSS text ${JSON.stringify(text)} present`);
  }

  for (const expected of rule.requireImports ?? []) {
    const normalized = typeof expected === 'string' ? { from: expected } : expected;
    if (!analysis.imports.some((imported) => importMatches(imported, normalized))) {
      report(`required import from ${normalized.from} missing`);
    }
  }
  for (const expected of rule.forbidImports ?? []) {
    const normalized = typeof expected === 'string' ? { from: expected } : expected;
    if (analysis.imports.some((imported) => importMatches(imported, normalized))) {
      report(`forbidden import from ${normalized.from} present`);
    }
  }

  for (const name of rule.requireExports ?? []) {
    if (!analysis.exports.has(name)) report(`required export ${name} missing`);
  }
  for (const name of rule.forbidExports ?? []) {
    if (analysis.exports.has(name)) report(`forbidden export ${name} present`);
  }
  for (const name of rule.requireInterfaces ?? []) {
    if (analysis.exportKinds.get(name) !== 'interface')
      report(`required interface ${name} missing`);
  }
  for (const name of rule.forbidInterfaces ?? []) {
    if (analysis.exportKinds.get(name) === 'interface')
      report(`forbidden interface ${name} present`);
  }
  for (const name of rule.requireTypeAliases ?? []) {
    if (analysis.exportKinds.get(name) !== 'type') report(`required type alias ${name} missing`);
  }
  for (const name of rule.forbidTypeAliases ?? []) {
    if (analysis.exportKinds.get(name) === 'type') report(`forbidden type alias ${name} present`);
  }
  for (const name of rule.requirePropertyNames ?? []) {
    if (!analysis.propertyNames.has(name)) report(`required property name ${name} missing`);
  }
  for (const name of rule.forbidPropertyNames ?? []) {
    if (analysis.propertyNames.has(name)) report(`forbidden property name ${name} present`);
  }

  const propertyMatches = (property, expected) =>
    property.name === expected.name &&
    (expected.value === undefined || property.value === String(expected.value)) &&
    (expected.valuePrefix === undefined || property.value.startsWith(expected.valuePrefix));

  for (const expected of rule.requireObjectProperties ?? []) {
    if (!analysis.objectProperties.some((property) => propertyMatches(property, expected))) {
      report(
        `required object property ${expected.name}${expected.value === undefined ? '' : `: ${expected.value}`} missing`,
      );
    }
  }
  for (const expected of rule.forbidObjectProperties ?? []) {
    if (analysis.objectProperties.some((property) => propertyMatches(property, expected))) {
      report(
        `forbidden object property ${expected.name}${expected.value === undefined ? '' : `: ${expected.value}`} present`,
      );
    }
  }
  for (const text of rule.requireObjectPropertyTexts ?? []) {
    if (!analysis.objectPropertyTexts.has(text))
      report(`required object property text ${text} missing`);
  }
  for (const text of rule.forbidObjectPropertyTexts ?? []) {
    if (analysis.objectPropertyTexts.has(text))
      report(`forbidden object property text ${text} present`);
  }

  for (const count of rule.counts ?? []) {
    const found = countOf(analysis, count);
    const ok = Number.isInteger(count.equals) ? found === count.equals : found >= count.min;
    if (!ok) {
      report(
        `count ${count.kind} ${count.name ?? count.value} is ${found}, expected ${
          Number.isInteger(count.equals) ? count.equals : `>= ${count.min}`
        }`,
      );
    }
  }
  return violations;
}

function walk(directory, output = []) {
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    if (dirent.name === 'node_modules' || dirent.name === 'dist') continue;
    const full = path.join(directory, dirent.name);
    if (dirent.isDirectory()) walk(full, output);
    else output.push(full);
  }
  return output;
}

export function findStructureRuleViolations(root, manifest) {
  const violations = [];
  // Many rules target the same component or module; parsing each file once
  // keeps a 300-rule manifest in the same order of magnitude as a text scan.
  const analysisCache = new Map();
  const analyze = (relativePath, absolute) => {
    let analysis = analysisCache.get(relativePath);
    if (!analysis) {
      analysis = analyzeSource(relativePath, readFileSync(absolute, 'utf8'));
      analysisCache.set(relativePath, analysis);
    }
    return analysis;
  };
  for (const rule of manifest.rules) {
    for (const relativePath of rule.absentPaths ?? []) {
      if (existsSync(path.join(root, relativePath))) {
        violations.push({ id: rule.id, file: relativePath, detail: 'retired path exists' });
      }
    }
    for (const relativePath of rule.presentPaths ?? []) {
      if (!existsSync(path.join(root, relativePath))) {
        violations.push({ id: rule.id, file: relativePath, detail: 'required path missing' });
      }
    }

    if (rule.scan) {
      const scanRoot = path.join(root, rule.scan.root);
      if (!existsSync(scanRoot)) {
        violations.push({ id: rule.id, file: rule.scan.root, detail: 'scan root missing' });
        continue;
      }
      for (const absolute of walk(scanRoot)) {
        const relativePath = path.relative(root, absolute).split(path.sep).join('/');
        if (!rule.scan.extensions.some((extension) => relativePath.endsWith(extension))) continue;
        if ((rule.scan.exclude ?? []).some((fragment) => relativePath.includes(fragment))) continue;
        violations.push(...checkFile(relativePath, analyze(relativePath, absolute), rule));
      }
      continue;
    }

    const files = rule.file ? [rule.file] : (rule.files ?? []);
    if (files.length === 0) continue;
    const missing = files.filter((file) => !existsSync(path.join(root, file)));
    if (missing.length > 0) {
      for (const file of missing)
        violations.push({ id: rule.id, file, detail: 'rule file missing' });
      continue;
    }
    const analysis = {
      elements: [],
      identifiers: new Map(),
      imports: [],
      exports: new Set(),
      calls: new Map(),
      newExpressions: new Map(),
      memberPaths: new Map(),
      typeReferences: new Map(),
      exportKinds: new Map(),
      propertyNames: new Map(),
      typeNodes: new Map(),
      typeMembers: new Map(),
      expressions: new Map(),
      statements: new Map(),
      objectProperties: [],
      objectPropertyTexts: new Map(),
      stringLiterals: [],
      cssText: [],
      classStrings: [],
    };
    for (const file of files) {
      const single = analyze(file, path.join(root, file));
      analysis.elements.push(...single.elements);
      for (const [key, value] of single.identifiers)
        analysis.identifiers.set(key, (analysis.identifiers.get(key) ?? 0) + value);
      analysis.imports.push(...single.imports);
      for (const value of single.exports) analysis.exports.add(value);
      for (const [key, value] of single.exportKinds) analysis.exportKinds.set(key, value);
      for (const [key, value] of single.propertyNames)
        analysis.propertyNames.set(key, (analysis.propertyNames.get(key) ?? 0) + value);
      for (const [key, value] of single.calls)
        analysis.calls.set(key, (analysis.calls.get(key) ?? 0) + value);
      for (const [key, value] of single.newExpressions)
        analysis.newExpressions.set(key, (analysis.newExpressions.get(key) ?? 0) + value);
      for (const [key, value] of single.memberPaths)
        analysis.memberPaths.set(key, (analysis.memberPaths.get(key) ?? 0) + value);
      for (const [key, value] of single.typeReferences)
        analysis.typeReferences.set(key, (analysis.typeReferences.get(key) ?? 0) + value);
      for (const [key, value] of single.typeNodes)
        analysis.typeNodes.set(key, (analysis.typeNodes.get(key) ?? 0) + value);
      for (const [key, value] of single.typeMembers)
        analysis.typeMembers.set(key, (analysis.typeMembers.get(key) ?? 0) + value);
      for (const [key, value] of single.expressions)
        analysis.expressions.set(key, (analysis.expressions.get(key) ?? 0) + value);
      for (const [key, value] of single.statements)
        analysis.statements.set(key, (analysis.statements.get(key) ?? 0) + value);
      analysis.objectProperties.push(...single.objectProperties);
      analysis.cssText.push(...single.cssText);
      for (const [key, value] of single.objectPropertyTexts)
        analysis.objectPropertyTexts.set(key, (analysis.objectPropertyTexts.get(key) ?? 0) + value);
      analysis.stringLiterals.push(...single.stringLiterals);
      analysis.classStrings.push(...single.classStrings);
    }
    violations.push(...checkFile(files.join(' + '), analysis, rule));
  }
  return violations;
}
