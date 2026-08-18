#!/usr/bin/env node
/*
 * assert-classes-compile — every class token in app/** and components/** must
 * exist in the compiled CSS produced by the last `next build`.
 *
 * Why this exists: styles/globals.css resets Tailwind's namespaces
 * (`--container-*: initial`, `--color-*: initial`, …) so stock classes like
 * `max-w-3xl` and `min-h-touch` emit NO CSS rather than an error. `lint:tokens`
 * only guards the stock palette/font/radius families, so a class that compiles
 * to nothing is not a compile error and not a linter finding — it is a silent
 * no-op that renders as full-bleed or unstyled. Phase 03b shipped 14 of them.
 *
 * This checks the ARTIFACT, not the source: a class is only "real" if the built
 * CSS actually contains a selector for it. The source side collects class
 * tokens from ALL string literals (not just `className=`) because `cn()` takes
 * object keys and variant maps hold bare strings.
 *
 * A token counts as a class only if its base (after leading variants) starts
 * with a known Tailwind utility prefix or is one of the project's custom classes
 * (validated against styles/globals.css). i18n keys (`review.grade.again`),
 * identifiers (`listTitle`), attribute values (`current-password`) and bare
 * words (`mod`) do not match and are skipped. A false positive here gets the
 * whole check disabled — that is how "a green suite over an open hole" starts.
 *
 * Custom classes are a STATIC list, not parsed from globals.css at runtime:
 * parsing would grant amnesty when a rule is deleted — the usage would stop
 * being recognised and silently pass. Instead every name here must be present
 * in globals.css; deleting the rule fails the build. New custom classes must be
 * added here the day they are written.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

const cssDirArg = process.argv.indexOf('--css-dir');
const CSS_DIR =
  cssDirArg !== -1 && process.argv[cssDirArg + 1] ? process.argv[cssDirArg + 1] : '.next/static';

const rootsArg = process.argv.indexOf('--roots');
const ROOTS =
  rootsArg !== -1 && process.argv[rootsArg + 1]
    ? process.argv[rootsArg + 1].split(',')
    : ['app', 'components'];

const globalsArg = process.argv.indexOf('--globals');
const GLOBALS_CSS =
  globalsArg !== -1 && process.argv[globalsArg + 1]
    ? process.argv[globalsArg + 1]
    : 'styles/globals.css';

/* ------------------------------------------------------------------ */
/*  Class recognition                                                  */
/* ------------------------------------------------------------------ */

/**
 * Utility families: a class belongs to one of these when the prefix is
 * followed by a dash (`max-w` → `max-w-3xl`, `bg` → `bg-base`, `text` →
 * `text-primary`). The dash is REQUIRED so a bare identifier like `mod` or
 * `content.deck.invalid` cannot match `m` or `content`.
 */
const FAMILY_PREFIXES = [
  // layout / spacing (positive and negative)
  'm', 'mt', 'mr', 'mb', 'ml', 'mx', 'my',
  'p', 'pt', 'pr', 'pb', 'pl', 'px', 'py',
  '-m', '-mt', '-mr', '-mb', '-ml', '-mx', '-my',
  '-p', '-pt', '-pr', '-pb', '-pl', '-px', '-py',
  'gap', 'space-x', 'space-y', 'inset', 'top', 'right', 'bottom', 'left', 'z',
  '-top', '-right', '-bottom', '-left', '-inset', '-z',
  'w', 'h', 'size', 'min-w', 'min-h', 'max-w', 'max-h',
  'grid', 'auto-cols', 'auto-rows', 'col', 'col-span', 'row', 'row-span',
  'order', 'items', 'justify', 'content', 'place', 'self',
  'overflow', 'object', 'aspect', 'overscroll', 'divide',
  'sticky', 'inline',
  // typography
  'text', 'font', 'leading', 'tracking', 'align', 'whitespace', 'break',
  'indent', 'underline',
  // visual
  'bg', 'border', 'rounded', 'shadow', 'ring', 'outline', 'fill', 'stroke',
  'accent', 'caret', 'opacity', 'mix-blend', 'backdrop',
  // motion
  'transition', 'duration', 'ease', 'animate', 'transform', 'translate',
  'scale', 'rotate', 'skew', 'origin', 'perspective', 'transform-style',
  'backface', 'will-change', '-translate', '-rotate', '-scale', '-skew',
  // card flip (project utilities in styles/globals.css — a family so a typo
  // like `flip-front` is verified rather than skipped)
  'flip',
  // interactivity / misc
  'cursor', 'select', 'pointer-events', 'resize', 'touch', 'snap', 'scroll',
  'appearance',
];

/**
 * Bare utilities: a class is one of these only when it equals the token —
 * `flex`, `grid`, `hidden`, `border`. No dash required, no dash allowed.
 */
const BARE_UTILITIES = [
  'flex', 'grid', 'hidden', 'fixed', 'absolute', 'relative', 'static',
  'visible', 'invisible', 'collapse', 'block', 'inline', 'isolate',
  'sr-only', 'not-sr-only', 'truncate', 'uppercase', 'lowercase', 'capitalize',
  'normal-case', 'italic', 'not-italic', 'overline', 'line-through',
  'no-underline', 'tabular-nums', 'border', 'outline', 'ring',
];

/**
 * Project custom classes — every one must be defined in globals.css (checked
 * below). Tailwind prefixes do not cover these, so without this list a usage
 * would be skipped rather than verified.
 */
const CUSTOM_CLASSES = [
  'flipped',
  'ruled-grid',
  'measure',
  'pb-safe',
  'note-doc-view',
  'tiptap',
  'katex',
  'display-math',
  'inline-math',
];

/** Remove leading variant prefixes so the base can be classified. */
function stripVariants(token) {
  let prev;
  do {
    prev = token;
    // A variant is everything up to the first unescaped `:`.
    token = token.replace(/^[^:]+:/, '');
  } while (token !== prev);
  return token;
}

function isClassLike(token) {
  if (!token || token.startsWith('--')) return false;
  // Shape guard: a class name is lowercase with dashes, and optional `/` or
  // `[...]` (opacity modifiers, arbitrary values). Uppercase identifiers
  // (`collapseSidebar`), translation keys (`content.deck.invalid`) and CSS
  // variable names (`--font-geist-mono`) cannot be classes.
  if (!/^[a-z0-9\[\]\/_\-]+$/.test(token)) return false;

  const base = stripVariants(token);
  if (CUSTOM_CLASSES.includes(base)) return true;
  if (BARE_UTILITIES.includes(base)) return true;
  return FAMILY_PREFIXES.some((prefix) => base.startsWith(`${prefix}-`));
}

/* ------------------------------------------------------------------ */
/*  Compiled CSS side                                                  */
/* ------------------------------------------------------------------ */

/**
 * Escape a class name the way Tailwind writes it in a selector. `_` in an
 * arbitrary value means a space (Tailwind rewrites the class attribute too), so
 * it is converted before escaping.
 */
function cssEscape(token) {
  const spaced = token.replace(/_/g, ' ');
  return spaced.replace(/[:/\[\].%#,!'"()!&*+>=?@^$|~]/g, (c) => `\\${c}`);
}

/**
 * Membership is a substring search for `.` + the escaped class name against the
 * whole compiled CSS. Parsing selectors is how the earlier version missed
 * `divide-subtle` (selector `.divide-subtle>:not(:last-child)`), `aria-disabled:opacity-50`
 * (selector `.aria-disabled\:opacity-50[aria-disabled=true]`) and compound
 * `.a.b` — a substring test is exact and cannot mis-segment.
 */
function collectCompiledCss(dir) {
  let css = '';
  if (!existsSync(dir)) return css;
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.css')) {
        css += readFileSync(full, 'utf8');
      }
    }
  };
  walk(dir);
  return css;
}

/** Informational: rough count of class selectors in the compiled CSS. */
function countSelectors(css) {
  let n = 0;
  for (const match of css.matchAll(/\.((?:\\.|[^\\:.,{}\s>~+])+)/g)) {
    if (match[1].length > 1) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  Source side                                                        */
/* ------------------------------------------------------------------ */

async function collectSourceTokens(roots) {
  const tokens = new Set();
  for (const root of roots) {
    for await (const entry of glob(`${root}/**/*.{tsx,ts}`)) {
      if (/\.test\.(tsx?|ts)$/.test(entry)) continue;
      const source = readFileSync(entry, 'utf8');
      const sourceFile = ts.createSourceFile(
        entry,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      const add = (text) => {
        for (const token of text.split(/\s+/)) {
          if (isClassLike(token)) tokens.add(token);
        }
      };

      const visit = (node) => {
        if (ts.isStringLiteral(node)) add(node.text);
        else if (ts.isNoSubstitutionTemplateLiteral(node)) add(node.text);
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return tokens;
}

/* ------------------------------------------------------------------ */
/*  Custom-class amnesty guard                                         */
/* ------------------------------------------------------------------ */

/** Every custom class must still exist in globals.css. */
function validateCustomClasses() {
  let globalsText = '';
  try {
    globalsText = readFileSync(GLOBALS_CSS, 'utf8');
  } catch {
    return `${GLOBALS_CSS} is missing or unreadable — cannot validate custom classes.`;
  }
  const missing = CUSTOM_CLASSES.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match either: .name{  .name,  or  :is(..., .name)  or  .name)
    return !new RegExp(`(^|[.\\s,])${escaped}(\\s*[\\{,]|\\s*\\))`).test(globalsText);
  });
  return missing.length
    ? `${missing.join(', ')} listed in assert-classes-compile.mjs but not defined in ${GLOBALS_CSS}. ` +
        `Either the rule was deleted (add it back or remove the usage) or the list is stale.`
    : null;
}

/* ------------------------------------------------------------------ */
/*  Run                                                               */
/* ------------------------------------------------------------------ */

const failures = [];

const customError = validateCustomClasses();
if (customError) {
  failures.push(`assert-classes-compile — ${customError}`);
}

const compiledCss = collectCompiledCss(CSS_DIR);
if (compiledCss.length === 0) {
  failures.push(
    `assert-classes-compile — found no CSS under ${CSS_DIR}. Run it after \`next build\`, ` +
      `not against a fresh checkout.`
  );
}

const tokens = await collectSourceTokens(ROOTS);
const missing = [...tokens]
  .filter((token) => !compiledCss.includes('.' + cssEscape(token)))
  .sort();

if (missing.length === 0 && failures.length === 0) {
  console.log(
    `assert-classes-compile — clean (${tokens.size} class tokens, ${countSelectors(compiledCss)} compiled selectors)`
  );
  process.exit(0);
}

for (const failure of failures) console.error(failure);
for (const token of missing) {
  console.error(
    `${token} compiles to no CSS. It is a silent no-op — either the token is wrong ` +
      `(check styles/globals.css for what replaced it) or it belongs to a rule that was deleted.`
  );
}
console.error(
  `\nassert-classes-compile — ${missing.length} dead class(es) in ${ROOTS.join(', ')}, ` +
    `${failures.length} configuration problem(s).`
);
process.exit(1);
