#!/usr/bin/env node
/**
 * Part 19 §19.11.3 / §19.11.7 — `en.json` and `hi.json` must have IDENTICAL key
 * sets. A Hindi string may temporarily equal the English one; it may not be
 * missing. CI fails on a mismatch, naming the keys.
 *
 * Node standard library only (ADR-021).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (name) => JSON.parse(readFileSync(join(root, 'locales', name), 'utf8'));

const en = read('en.json');
const hi = read('hi.json');

const enKeys = new Set(Object.keys(en));
const hiKeys = new Set(Object.keys(hi));

const missingInHi = [...enKeys].filter((key) => !hiKeys.has(key));
const missingInEn = [...hiKeys].filter((key) => !enKeys.has(key));
const nested = [...enKeys, ...hiKeys].filter((key) => typeof (en[key] ?? hi[key]) === 'object');

let failed = false;

if (missingInHi.length) {
  failed = true;
  console.error(`✗ ${missingInHi.length} key(s) missing from locales/hi.json:`);
  missingInHi.forEach((key) => console.error(`    ${key}`));
}
if (missingInEn.length) {
  failed = true;
  console.error(`✗ ${missingInEn.length} key(s) missing from locales/en.json:`);
  missingInEn.forEach((key) => console.error(`    ${key}`));
}
if (nested.length) {
  failed = true;
  console.error('✗ keys must be FLAT strings, not nested objects (§19.11.3):');
  nested.forEach((key) => console.error(`    ${key}`));
}

if (failed) process.exit(1);

console.log(`✓ locales in step — ${enKeys.size} keys in en and hi`);
