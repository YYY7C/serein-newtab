import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/js');
const SKIP = new Set(['en.js', 'i18n.js', 'city-data.js']);

function sourceFiles(dir = SRC, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'locales') sourceFiles(full, out);
    } else if (entry.name.endsWith('.js') && !SKIP.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function unescape(text) {
  return text.replace(/\\(['"\\n])/g, (_, char) => (char === 'n' ? '\n' : char));
}

function literalKeys() {
  const keys = new Map();
  for (const file of sourceFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    const re = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    let match;
    while ((match = re.exec(source))) {
      const key = unescape(match[1] ?? match[2]);
      if (!key) continue;
      if (!keys.has(key)) keys.set(key, new Set());
      keys.get(key).add(path.basename(file));
    }
  }
  return keys;
}

function dictionary() {
  const file = path.join(SRC, 'locales/en.js');
  const source = fs.readFileSync(file, 'utf8').replace('export const EN =', 'return');
  return new Function(source)();
}

const placeholders = (value) => new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

test.describe('translation coverage', () => {
  test('every t() literal in the source has an English entry', () => {
    const keys = literalKeys();
    const EN = dictionary();
    const missing = [...keys.entries()]
      .filter(([key]) => /[\u4e00-\u9fff]/.test(key) && !Object.hasOwn(EN, key))
      .map(([key, files]) => `${[...files].join(',')}: ${key}`);

    expect(keys.size).toBeGreaterThan(400);
    expect(missing).toEqual([]);
  });

  test('English placeholders match the Chinese source keys', () => {
    const EN = dictionary();
    const mismatched = [];
    for (const [key, value] of Object.entries(EN)) {
      if (typeof value !== 'string') continue;
      const expected = [...placeholders(key)].sort().join(',');
      const actual = [...placeholders(value)].sort().join(',');
      if (expected !== actual) mismatched.push(`${key} -> ${value}`);
    }
    expect(mismatched).toEqual([]);
  });

  test('English strings contain no leftover Chinese copy', () => {
    const EN = dictionary();
    const leftovers = Object.entries(EN)
      .filter(([, value]) => typeof value === 'string' && /[\u4e00-\u9fff]/.test(value))
      .map(([key, value]) => `${key} -> ${value}`);
    expect(leftovers).toEqual([]);
  });
});
