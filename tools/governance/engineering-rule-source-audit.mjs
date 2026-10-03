#!/usr/bin/env node
/** Validate native Engineering source and deterministically regenerate its external pin only. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ENGINEERING_RULE_SOURCE,
  ENGINEERING_RULE_PINS,
  resolveEngineeringRuleFile,
  validateEngineeringRuleSource,
  loadEngineeringRuleSource,
} from './lib/engineering-rule-source.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--write'].includes(args[0])) {
    throw new Error('Usage: engineering-rule-source-audit.mjs --check|--write');
  }
  if (args[0] === '--check') loadEngineeringRuleSource({ root: ROOT });
  else {
    const source = validateEngineeringRuleSource(
      JSON.parse(readFileSync(resolveEngineeringRuleFile(ROOT, ENGINEERING_RULE_SOURCE), 'utf8')),
    );
    const pins = {
      schemaVersion: 1,
      sources: [{ path: ENGINEERING_RULE_SOURCE, semanticHash: source.semanticHash }],
    };
    writeFileSync(
      resolveEngineeringRuleFile(ROOT, ENGINEERING_RULE_PINS),
      `${JSON.stringify(pins, null, 2)}\n`,
    );
  }
  console.log('[engineering-rule-source] native source and external semantic pin verified');
} catch (error) {
  console.error(`[engineering-rule-source] ${error.message}`);
  process.exitCode = 1;
}
