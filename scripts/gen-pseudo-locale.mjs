#!/usr/bin/env node
/*
 * Generate messages/pseudo.json from messages/en.json.
 *
 * Acceptance criterion 10: every string padded 40% must show no overflow or
 * truncation at 390px. German and Catalan run substantially longer than English
 * and Spanish, so a layout that only ever saw `en` will break the first time it
 * meets a real translation. This finds it now, mechanically, in CI, instead of
 * after a Catalan catalog lands in phase 04.
 *
 * Three properties the output needs:
 *   1. ~40% longer, to catch overflow
 *   2. visually obviously not English, so an untranslated string stands out
 *   3. wrapped in brackets, so truncation is visible — if you cannot see the
 *      closing bracket, the string was cut off rather than merely long
 *
 * ICU placeholders are left untouched. Mangling `{count}` would make the
 * pseudo-locale crash instead of merely look strange, and a crashing test
 * teaches nothing about layout.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const ACCENTS = {
  a: 'ä', b: 'ƀ', c: 'ç', d: 'ð', e: 'ë', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'ï', j: 'ĵ',
  k: 'ķ', l: 'ĺ', m: 'ɱ', n: 'ń', o: 'ö', p: 'ƥ', q: 'ɋ', r: 'ŕ', s: 'ś', t: 'ţ',
  u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Ä', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'Ë', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Ï', J: 'Ĵ',
  K: 'Ķ', L: 'Ĺ', M: 'Ṁ', N: 'Ń', O: 'Ö', P: 'Ƥ', Q: 'Ɋ', R: 'Ŕ', S: 'Ś', T: 'Ţ',
  U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const PAD_RATIO = 0.4;

/** Split on ICU placeholders so `{count}` and `{name, plural, ...}` survive intact. */
function pseudoify(value) {
  const segments = value.split(/(\{[^}]*\})/g);

  const accented = segments
    .map((segment) =>
      segment.startsWith('{') && segment.endsWith('}')
        ? segment
        : [...segment].map((char) => ACCENTS[char] ?? char).join('')
    )
    .join('');

  const padLength = Math.ceil(value.length * PAD_RATIO);
  return `[${accented}${'·'.repeat(padLength)}]`;
}

function walk(node) {
  if (typeof node === 'string') return pseudoify(node);
  if (Array.isArray(node)) return node.map(walk);
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value)]));
  }
  return node;
}

const source = JSON.parse(readFileSync('messages/en.json', 'utf8'));
const output = walk(source);

writeFileSync('messages/pseudo.json', `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const count = JSON.stringify(source).match(/"/g).length / 4;
console.log(`messages/pseudo.json — regenerated from en.json (~${Math.round(count)} strings, +${PAD_RATIO * 100}%)`);
