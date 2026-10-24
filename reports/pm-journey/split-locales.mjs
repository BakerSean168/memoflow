// One-shot codemod: split monolithic zh-CN.ts / en-US.ts into per-namespace modules.
import { mkdirSync, writeFileSync } from 'node:fs';

const zh = (await import('../../packages/app-vue/src/locales/zh-CN.ts')).default;
const en = (await import('../../packages/app-vue/src/locales/en-US.ts')).default;

const namespaces = [...new Set([...Object.keys(zh), ...Object.keys(en)])];
console.log('namespaces:', namespaces.join(', '));

function render(value) {
  return `export default ${JSON.stringify(value, null, 2)} as const;\n`;
}

for (const [tag, messages] of [
  ['zh-CN', zh],
  ['en-US', en],
]) {
  const dir = `packages/app-vue/src/locales/${tag}`;
  mkdirSync(dir, { recursive: true });
  for (const ns of namespaces) {
    writeFileSync(`${dir}/${ns}.ts`, render(messages[ns] ?? {}));
  }
  const imports = namespaces.map((ns) => `import ${ns} from './${ns}';`).join('\n');
  const body = namespaces.map((ns) => `  ${ns},`).join('\n');
  writeFileSync(`${dir}/index.ts`, `${imports}\n\nexport default {\n${body}\n} as const;\n`);
}
console.log('done');
