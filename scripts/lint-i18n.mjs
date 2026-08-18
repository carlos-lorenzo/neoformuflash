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
 *
 * Phase 03b adds four checks to the same AST walk, closing the hole this script
 * had for three phases: it detected hardcoded literals but never verified a
 * key resolved. The defects that prompted them all shipped past this green.
 *
 *   1. Key existence   — every t('…') resolves to NS.… present in en.json.
 *   2. Template prefix — t(`grade.${rating}`) resolves the static prefix and
 *      requires at least one leaf under it.
 *   3. Shortcut labels — every useShortcut must carry a string-literal label
 *      that resolves as a ROOT key (shortcut-overlay reads labels at root).
 *      Missing label is an error, not a default.
 *   4. Locale parity   — the leaf key sets of en.json and es.json are equal.
 *
 * The checker also counts translation call sites it cannot resolve — a t() that
 * is prop-drilled, aliased or given a dynamic key is invisible to key
 * existence, and silence there is the same hole as a missing check. The suite
 * asserts that count is zero for the real codebase.
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

const messagesArg = process.argv.indexOf('--messages');
const MESSAGES_DIR =
  messagesArg !== -1 && process.argv[messagesArg + 1]
    ? process.argv[messagesArg + 1]
    : 'messages';

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

/* ------------------------------------------------------------------ */
/*  Catalog                                                            */
/* ------------------------------------------------------------------ */

/** Flatten a message tree to a set of full keys ("review.grade.again"). */
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = true;
  }
  return out;
}

function readCatalog(locale) {
  try {
    return flatten(JSON.parse(readFileSync(`${MESSAGES_DIR}/${locale}.json`, 'utf8')));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Key resolution                                                     */
/* ------------------------------------------------------------------ */

/** Conventional names for a translation function — bound to nothing, they are
 *  reported rather than silently skipped (phase-03b risk 4). */
const CONVENTIONAL_T_NAMES = new Set(['t', 'tc', 'tn', 'common', 'translations']);

function collectKeyFindings(file, source, catalog) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  let unresolvable = 0;
  const lines = source.split('\n');
  const positionOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const report = (node, text, reason) =>
    findings.push({ file, line: positionOf(node) + 1, text: text.trim().slice(0, 60), reason });

  /** `i18n-dynamic-key` — acknowledges a t(variable) that is inherently dynamic. */
  const isDynamicKey = (line) =>
    lines[line]?.includes('i18n-dynamic-key') || lines[line - 1]?.includes('i18n-dynamic-key');

  /* ---- lexical scope stack of name → namespace ('' is root) ---- */
  const scopes = [new Map()];
  const pushScope = () => scopes.push(new Map());
  const popScope = () => scopes.pop();
  const bind = (name, ns) => scopes[scopes.length - 1].set(name, ns);
  const rootBound = new Set();

  const lookupNs = (name) => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].has(name)) return scopes[i].get(name);
    }
    return rootBound.has(name) ? '' : undefined;
  };

  const SCOPED_KINDS = new Set([
    ts.SyntaxKind.SourceFile,
    ts.SyntaxKind.Block,
    ts.SyntaxKind.ArrowFunction,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.Constructor,
    ts.SyntaxKind.GetAccessor,
    ts.SyntaxKind.SetAccessor,
    ts.SyntaxKind.CatchClause,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.ModuleBlock,
    ts.SyntaxKind.SwitchStatement,
    ts.SyntaxKind.WithStatement,
  ]);

  /** Namespace from a useTranslations/getTranslations initializer. */
  function hookNamespace(expr) {
    if (!expr) return undefined;
    let e = ts.isAwaitExpression(expr) ? expr.expression : expr;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const callee = e.expression.text;
      if (callee === 'useTranslations' || callee === 'getTranslations') {
        const arg = e.arguments[0];
        if (!arg) return ''; // useTranslations() — root
        if (ts.isStringLiteral(arg)) return arg.text;
        return undefined; // dynamic namespace — cannot map
      }
    }
    return undefined;
  }

  const isStringArg = (arg) =>
    !!arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg));

  const visit = (node) => {
    const isScope = SCOPED_KINDS.has(node.kind);
    if (isScope) pushScope();

    // const t = useTranslations('review')  |  const { t } = useTranslations('review')
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        // Array destructuring: const [t, locale] = await Promise.all([...])
        if (ts.isArrayBindingPattern(decl.name)) {
          let init = decl.initializer;
          if (ts.isAwaitExpression(init)) init = init.expression;

          // Unwrap Promise.all([...]) → the array argument.
          let arr = null;
          if (ts.isArrayLiteralExpression(init)) arr = init;
          else if (
            ts.isCallExpression(init) &&
            ts.isPropertyAccessExpression(init.expression) &&
            init.expression.name.text === 'all'
          ) {
            const arg = init.arguments[0];
            if (ts.isArrayLiteralExpression(arg)) arr = arg;
          }

          if (arr) {
            for (let i = 0; i < decl.name.elements.length; i++) {
              const el = decl.name.elements[i];
              if (el && ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
                const arrayEl = arr.elements[i];
                if (arrayEl) {
                  const elNs = hookNamespace(arrayEl);
                  if (elNs !== undefined) bind(el.name.text, elNs);
                }
              }
            }
          }
          continue;
        }

        // Object or simple: const t = useTranslations('review') | const { t } = ...
        const ns = hookNamespace(decl.initializer);
        if (ns === undefined) continue;
        if (ts.isIdentifier(decl.name)) bind(decl.name.text, ns);
        else if (ts.isObjectBindingPattern(decl.name)) {
          for (const el of decl.name.elements) {
            if (ts.isIdentifier(el.name)) bind(el.name.text, ns);
          }
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const ns = lookupNs(name);
      const arg0 = node.arguments[0];

      if (ns !== undefined) {
        if (isStringArg(arg0)) {
          const key = ns ? `${ns}.${arg0.text}` : arg0.text;
          if (!catalog[key]) {
            report(arg0, `${name}('${arg0.text}')`, `missing key — '${key}' is not in messages/en.json`);
          }
        } else if (arg0 && ts.isTemplateExpression(arg0)) {
          const head = arg0.head.text;
          if (head) {
            const prefix = ns ? `${ns}.${head}` : head;
            if (!Object.keys(catalog).some((k) => k.startsWith(prefix))) {
              report(arg0, `${name}(\`${head}…\`)`, `template prefix — no catalog leaf starts with '${prefix}'`);
            }
          }
        } else if (arg0) {
          // t(keyVar) or t('a.' + name) — dynamic and uncheckable.
          if (!isDynamicKey(positionOf(node))) unresolvable += 1;
        }
      } else if (
        arg0 &&
        CONVENTIONAL_T_NAMES.has(name) &&
        (isStringArg(arg0) ||
          ts.isTemplateExpression(arg0) ||
          ts.isIdentifier(arg0) ||
          ts.isBinaryExpression(arg0))
      ) {
        if (!isDynamicKey(positionOf(node))) unresolvable += 1;
      }

      // useShortcut(scope, keys, onPress, options) — the label must resolve at root.
      if (name === 'useShortcut') {
        const scopeText = node.arguments[0]?.getText(sourceFile) ?? '?';
        const options = node.arguments[3];
        if (!options || !ts.isObjectLiteralExpression(options)) {
          report(node, `useShortcut(${scopeText}, …)`, 'shortcut registered with no options object — add { label }');
        } else {
          const labelProp = options.properties.find(
            (p) => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'label'
          );
          if (!labelProp) {
            report(node, `useShortcut(${scopeText}, …)`, 'shortcut registered with no label');
          } else {
            const init = labelProp.initializer;
            if (ts.isStringLiteral(init)) {
              if (!catalog[init.text]) {
                report(init, `label '${init.text}'`, 'shortcut label is not a root catalog key (shortcut-overlay resolves labels at root)');
              }
            } else {
              report(init, 'label: …', 'shortcut label must be a string literal');
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
    if (isScope) popScope();
  };

  // Pre-scan `declare const t` (fixture pattern) — file-scoped, so it must be
  // known before the walk reaches the calls that use it.
  const collectDeclared = (node) => {
    if (
      ts.isVariableStatement(node) &&
      (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) rootBound.add(decl.name.text);
      }
    }
    ts.forEachChild(node, collectDeclared);
  };
  collectDeclared(sourceFile);

  visit(sourceFile);
  return { findings, unresolvable };
}

/* ------------------------------------------------------------------ */
/*  Locale parity                                                      */
/* ------------------------------------------------------------------ */

function checkLocaleParity() {
  const findings = [];
  const en = readCatalog('en');
  const es = readCatalog('es');
  if (!en) findings.push({ file: `${MESSAGES_DIR}/en.json`, line: 1, text: MESSAGES_DIR, reason: 'en.json catalog is missing or unreadable' });
  if (!es) findings.push({ file: `${MESSAGES_DIR}/es.json`, line: 1, text: MESSAGES_DIR, reason: 'es.json catalog is missing or unreadable' });
  if (!en || !es) return findings;

  const enKeys = new Set(Object.keys(en));
  const esKeys = new Set(Object.keys(es));
  for (const key of [...enKeys].sort()) {
    if (!esKeys.has(key)) {
      findings.push({ file: `${MESSAGES_DIR}/es.json`, line: 1, text: key, reason: 'key present in en.json but missing from es.json' });
    }
  }
  for (const key of [...esKeys].sort()) {
    if (!enKeys.has(key)) {
      findings.push({ file: `${MESSAGES_DIR}/en.json`, line: 1, text: key, reason: 'key present in es.json but missing from en.json' });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/*  Run                                                               */
/* ------------------------------------------------------------------ */

/*
 * Test files are skipped. The rule is "no user-visible literal reaches a
 * screen", and a `*.test.tsx` never renders to a person — its strings are
 * fixtures. The alternative is an `i18n-exempt` comment on every line of every
 * component test, which is the silenced-linter failure described above.
 */
const isTestFile = (file) => /\.test\.tsx$/.test(file);

async function collectFiles() {
  const files = [];
  for (const root of ROOTS) {
    for await (const entry of glob(`${root}/**/*.tsx`)) {
      if (isTestFile(entry)) continue;
      files.push(entry);
    }
  }
  return files.sort();
}

const files = await collectFiles();
const catalog = readCatalog('en') ?? {};
const literalFindings = [];
const keyFindings = [];
let unresolvable = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  literalFindings.push(...collectFindings(file, source));
  const result = collectKeyFindings(file, source, catalog);
  keyFindings.push(...result.findings);
  unresolvable += result.unresolvable;
}
const parityFindings = checkLocaleParity();
const allFindings = [...literalFindings, ...keyFindings, ...parityFindings];

if (allFindings.length === 0 && unresolvable === 0) {
  console.log(
    `lint:i18n — clean (${files.length} files, ${Object.keys(catalog).length} keys, ` +
      `${parityFindings.length} parity gaps)`
  );
  process.exit(0);
}

for (const finding of literalFindings) {
  console.error(`${finding.file}:${finding.line}  ${finding.text}\n    ${finding.reason}. Move it to messages/*.json and read it with useTranslations().`);
}
for (const finding of keyFindings) {
  console.error(`${finding.file}:${finding.line}  ${finding.text}\n    ${finding.reason}.`);
}
for (const finding of parityFindings) {
  console.error(`${finding.file}:${finding.line}  ${finding.text}\n    ${finding.reason}.`);
}
if (unresolvable > 0) {
  console.error(`\nlint:i18n — ${unresolvable} translation call site(s) could not be resolved to a namespace.`);
  console.error('A t() that is prop-drilled, aliased or given a dynamic key is invisible to key existence.');
}
console.error(
  `\nlint:i18n — ${literalFindings.length} hardcoded string(s), ${keyFindings.length} key finding(s), ` +
    `${parityFindings.length} locale parity gap(s), ${unresolvable} unresolvable site(s), ` +
    `across ${files.length} files.`
);
console.error('If it is genuinely not language (a brand name, a keyboard key), add an `i18n-exempt` comment.');
process.exit(1);
