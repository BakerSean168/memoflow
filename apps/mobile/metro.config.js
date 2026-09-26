const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * MemoFlow's Node ESM workspace packages use explicit `.js` relative specifiers
 * in TypeScript source so their emitted ESM is valid in Node. Expo's Metro
 * resolver consumes those packages through tsconfig source aliases, where the
 * corresponding source file is still `.ts` / `.tsx`. Retry only relative `.js`
 * imports originating from MemoFlow workspace source without the emitted
 * extension, allowing Metro to select its normal platform/source extension.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isWorkspaceSource = context.originModulePath.includes(`${path.sep}packages${path.sep}`);
  const isRelativeEmittedSpecifier =
    (moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js');

  if (isWorkspaceSource && isRelativeEmittedSpecifier) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // Preserve Metro's canonical error for a genuinely missing module.
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
