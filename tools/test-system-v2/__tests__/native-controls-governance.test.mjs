import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const registryPath = path.join(repositoryRoot, 'tools/test-system-v2/native-controls-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const componentLibrary = 'ui-vue-shadcn';
const allowedKinds = ['button', 'input', 'textarea', 'file-input'];
const allowedCategories = ['custom-control', 'controlled-input', 'hidden-file-input'];

// Native controls belong inside the component library. A business component may
// keep one only when it is itself the interaction surface, or when a hidden file
// input is opened by a library control. Everything else composes ui-vue-shadcn.
function businessVueFiles() {
  const files = [];
  for (const base of ['packages', 'apps']) {
    const baseDirectory = path.join(repositoryRoot, base);
    if (!existsSync(baseDirectory)) continue;
    for (const name of readdirSync(baseDirectory)) {
      if (base === 'packages' && name === componentLibrary) continue;
      const src = path.join(baseDirectory, name, 'src');
      if (!existsSync(src)) continue;
      for (const file of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
        if (!file.endsWith('.vue')) continue;
        if (/\.spec\.|\.stories?\./.test(file)) continue;
        if (/(^|\/)(__stories__|stories)\//.test(file)) continue;
        files.push(`${base}/${name}/src/${file.split(path.sep).join('/')}`);
      }
    }
  }
  return files.sort();
}

function stripComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

function inputType(tag) {
  const type = /\btype\s*=\s*["']([^"']+)["']/.exec(tag)?.[1];
  return type ?? 'text';
}

function isHiddenFileInput(tag) {
  return inputType(tag) === 'file' && /\bclass\s*=\s*["'][^"']*\bhidden\b/.test(tag);
}

function nativeControlsIn(source) {
  const markup = stripComments(source);
  const kinds = [];
  if (/<button(?=[\s>]|$)/m.test(markup)) kinds.push('button');

  const inputs = [...markup.matchAll(/<input\b[^>]*>/gs)].map((match) => match[0]);
  const visibleInput = inputs.some(
    (tag) => !['hidden', 'file'].includes(inputType(tag)),
  );
  if (visibleInput) kinds.push('input');

  const fileInputs = inputs.filter((tag) => inputType(tag) === 'file');
  if (fileInputs.some((tag) => !isHiddenFileInput(tag))) {
    // A visible file input is never allowed; the registry has no kind for it.
    kinds.push('visible-file-input');
  } else if (fileInputs.length > 0) {
    kinds.push('file-input');
  }

  if (/<textarea(?=[\s>]|$)/m.test(markup)) kinds.push('textarea');
  return kinds;
}

function collectNativeControls(files) {
  const found = new Map();
  for (const file of files) {
    const source = readFileSync(path.join(repositoryRoot, file), 'utf8');
    const kinds = nativeControlsIn(source);
    if (kinds.length > 0) found.set(file, kinds);
  }
  return found;
}

function validateRegistry(candidate) {
  const issues = [];
  if (candidate.version !== 1) issues.push(`unexpected-version:${candidate.version}`);
  if (candidate.enforcement !== 'full') {
    issues.push(`unknown-enforcement:${candidate.enforcement}`);
  }
  if (!Array.isArray(candidate.nativeKinds) || candidate.nativeKinds.length === 0) {
    issues.push('missing-native-kinds');
  } else if (!candidate.nativeKinds.every((kind) => allowedKinds.includes(kind))) {
    issues.push('unknown-native-kind');
  }

  const seen = new Set();
  for (const section of ['exceptions', 'converted']) {
    for (const [index, entry] of (candidate[section] ?? []).entries()) {
      const label = entry.path ?? `${section}#${index}`;
      if (!entry.path) {
        issues.push(`entry-incomplete:${label}`);
        continue;
      }
      if (seen.has(entry.path)) issues.push(`duplicate-path:${label}`);
      seen.add(entry.path);
      if (!Array.isArray(entry.native) || entry.native.length === 0) {
        issues.push(`missing-native-kinds:${label}`);
      } else if (!entry.native.every((kind) => allowedKinds.includes(kind))) {
        issues.push(`unknown-native-kind:${label}`);
      }
      if (!existsSync(path.resolve(repositoryRoot, entry.path))) {
        issues.push(`missing-file:${label}`);
      }
      if (section === 'exceptions') {
        if (!allowedCategories.includes(entry.category)) {
          issues.push(`unknown-category:${label}`);
        }
        if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
          issues.push(`empty-reason:${label}`);
        }
      }
    }
  }
  return issues;
}

test('native control registry is structurally sound', () => {
  assert.deepEqual(validateRegistry(registry), []);
});

test('every native control in business code is registered', () => {
  const found = collectNativeControls(businessVueFiles());
  const registered = new Map(registry.exceptions.map((entry) => [entry.path, entry.native]));

  const unregistered = [...found.keys()].filter((file) => !registered.has(file));
  assert.deepEqual(
    unregistered,
    [],
    'compose ui-vue-shadcn Button/Input/Textarea, or register the file as an exception with a reason',
  );

  const mismatched = [...found.entries()].filter(
    ([file, kinds]) => registered.has(file) && registered.get(file).join(',') !== kinds.join(','),
  );
  assert.deepEqual(
    mismatched.map(([file]) => file),
    [],
    'registered native kinds must match the tags the file actually renders',
  );
});

test('registered exceptions are not rotten', () => {
  for (const entry of registry.exceptions) {
    assert.ok(existsSync(path.resolve(repositoryRoot, entry.path)), entry.path);
    assert.ok(entry.reason.trim().length > 0, `${entry.path} needs a reason`);
    const source = readFileSync(path.resolve(repositoryRoot, entry.path), 'utf8');
    assert.deepEqual(
      nativeControlsIn(source),
      entry.native,
      `${entry.path} no longer matches its registered native kinds`,
    );
  }
});

test('converted files stay free of native controls', () => {
  for (const entry of registry.converted) {
    assert.ok(existsSync(path.resolve(repositoryRoot, entry.path)), entry.path);
    const source = readFileSync(path.resolve(repositoryRoot, entry.path), 'utf8');
    assert.deepEqual(
      nativeControlsIn(source),
      [],
      `${entry.path} was converted to the component library and must not regain a native control`,
    );
  }
});

test('the guard sees native controls and ignores the component library and hidden inputs', () => {
  const source = [
    '<template>',
    '  <button type="button">Save</button>',
    '  <Button variant="ghost">Save</Button>',
    '  <input v-model="name" />',
    '  <Input v-model="name" />',
    '  <input type="hidden" v-model="id" />',
    '  <input type="file" class="hidden" />',
    '  <textarea v-model="notes" />',
    '  <Textarea v-model="notes" />',
    '</template>',
  ].join('\n');
  assert.deepEqual(nativeControlsIn(source), ['button', 'input', 'file-input', 'textarea']);
});

test('a visible file input is rejected', () => {
  assert.deepEqual(nativeControlsIn('<input type="file" accept="image/*" />'), [
    'visible-file-input',
  ]);
});

test('validation fails closed for stale paths, empty reasons and unknown categories', () => {
  const invalid = structuredClone(registry);
  invalid.exceptions[0].path = 'packages/does-not-exist/src/Nope.vue';
  invalid.exceptions[1].reason = '   ';
  invalid.exceptions[2].category = 'guessed';

  const issues = validateRegistry(invalid);
  for (const prefix of ['missing-file:', 'empty-reason:', 'unknown-category:']) {
    assert.ok(issues.some((issue) => issue.startsWith(prefix)), `${prefix} must be reported`);
  }
});

test('validation fails closed when a file is claimed by both sections', () => {
  const invalid = structuredClone(registry);
  invalid.converted[0].path = invalid.exceptions[0].path;

  assert.ok(
    validateRegistry(invalid).some((issue) => issue.startsWith('duplicate-path:')),
  );
});
