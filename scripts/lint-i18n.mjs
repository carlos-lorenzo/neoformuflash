#!/usr/bin/env node
/*
 * lint:i18n — acceptance criterion 9 of specs/phase-00-foundation.md:
 * no user-visible string literal anywhere in app/ or components/.
 *
 * This exists because retrofitting i18n across a finished app means touching
 * every component. Catching the first hardcoded string on the day it is written
 * costs seconds; catching the four hundredth costs a week.
 *
 * It parses with the TypeScript compiler rather than matching regexes. Regex
 * over JSX produces false positives, false positives get silenced, and a
 * silenced linter is worse than no linter because it looks like coverage.
 *
 * Escape hatch: `i18n-exempt` in a comment above the line. Use it for things
 * that genuinely are not language — a brand name, a keyboard key, "·".
 */

import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import ts from 'typescript';

const ROOTS_DEFAULT = ['app', 'components'];

const rootsArg = process.argv.indexOf('--roots');
const ROOTS =
  rootsArg !== -1 && process.argv[rootsArg + 1]
    ? process.argv[rootsArg + 1].split(',')
    : ROOTS_DEFAULT;

/** Attributes whose string value is read aloud or displayed to a person. */
const USER_VISIBLE_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'placeholder',
  'title',
]);

/**
 * Text that is not language: punctuation, separators, digits, currency.
 * A bare "·" or "/" between breadcrumbs does not need translating.
 */
function isNotLanguage(text) {
  return !/\p{Letter}{2,}/u.test(text);
}

function collectFindings(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  const lines = source.split('\n');

  const positionOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;

  /** `i18n-exempt` on the line itself or the line above it. */
  const isExempt = (line) =>
    lines[line]?.includes('i18n-exempt') || lines[line - 1]?.includes('i18n-exempt');

  const report = (node, text, reason) => {
    const line = positionOf(node);
    if (isExempt(line)) return;
    findings.push({ file, line: line + 1, text: text.trim().slice(0, 60), reason });
  };

  const visit = (node) => {
    // Literal text between JSX tags: <p>Sign in</p>
    if (ts.isJsxText(node)) {
      const text = node.text;
      if (text.trim() && !isNotLanguage(text)) {
        report(node, text, 'literal text in JSX');
      }
    }

    // A user-visible attribute given a literal: placeholder="Search"
    if (ts.isJsxAttribute(node) && node.name && node.initializer) {
      const name = node.name.getText(sourceFile);
      if (USER_VISIBLE_ATTRIBUTES.has(name)) {
        const init = node.initializer;

        const literal = ts.isStringLiteral(init)
          ? init
          : ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)
            ? init.expression
            : null;

        if (literal && !isNotLanguage(literal.text)) {
          report(node, `${name}="${literal.text}"`, 'literal in a user-visible attribute');
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

async function collectFiles() {
  const files = [];
  for (const root of ROOTS) {
    for await (const entry of glob(`${root}/**/*.tsx`)) {
      files.push(entry);
    }
  }
  return files.sort();
}

const files = await collectFiles();
const findings = files.flatMap((file) => collectFindings(file, readFileSync(file, 'utf8')));

if (findings.length === 0) {
  console.log(`lint:i18n — clean (${files.length} files)`);
  process.exit(0);
}

for (const finding of findings) {
  console.error(`${finding.file}:${finding.line}  ${finding.text}\n    ${finding.reason}. Move it to messages/*.json and read it with useTranslations().`);
}
console.error(`\nlint:i18n — ${findings.length} hardcoded string(s) across ${files.length} files.`);
console.error('If it is genuinely not language (a brand name, a keyboard key), add an `i18n-exempt` comment.');
process.exit(1);
