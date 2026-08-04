#!/usr/bin/env node
/*
 * lint:tokens — the enforcement mechanism for specs/design-system.md.
 *
 * Written rules are hopes. This script is the guarantee (design-system.md §9).
 *
 * Why it exists even though styles/globals.css resets every Tailwind namespace
 * to `initial`: that reset makes off-token utilities produce NO CSS, it does
 * not make them an error. A developer who writes `p-5` gets zero padding and
 * no warning. This turns that silent no-op into a build failure.
 *
 * It also catches the two things the reset cannot touch at all:
 *   - `duration-<number>`, which Tailwind accepts as a bare value
 *   - raw values in plain CSS, inline styles and arbitrary `[...]` utilities
 *
 * Escape hatch: `token-lint-disable-next-line` in a comment above the line.
 */

import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';

/** `--roots a,b` overrides the defaults so the test suite can point at a fixture. */
const rootsArg = process.argv.indexOf('--roots');
const ROOTS =
  rootsArg !== -1 && process.argv[rootsArg + 1]
    ? process.argv[rootsArg + 1].split(',')
    : ['app', 'components', 'styles', 'lib'];

/*
 * The two declaration sites. tokens.css holds the raw values; globals.css maps
 * them onto Tailwind's namespaces. Everything else consumes tokens by name.
 *
 * They are also the only files where an off-4px-grid length is correct: the
 * radii (4/6/10px) and the shadow offsets are specified that way in §4, and
 * §3's grid rule governs spacing, not shape.
 */
const EXEMPT = new Set(['styles/tokens.css', 'styles/globals.css']);

/** The nine spacing steps from §3, keyed by their true 4px multiplier. */
const SPACING_STEPS = new Set(['0', 'px', '1', '2', '3', '4', '6', '8', '11', '12', '16', '24']);

const SPACING_PREFIX =
  '(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|inset-x|inset-y|top|right|bottom|left|basis)';

const STOCK_PALETTE =
  '(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';

/**
 * Each rule is a pattern plus what to do instead. The advice matters more than
 * the detection — a linter that only says "no" gets disabled.
 */
const RULES = [
  {
    id: 'raw-colour',
    pattern: /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g,
    message: 'raw colour. Use a semantic token: bg-raised, text-secondary, border-subtle.',
  },
  {
    id: 'arbitrary-value',
    pattern: /-\[[^\]]*(?:#|\d+px|\d+m?s|rgb|hsl|oklch)[^\]]*\]/g,
    message: 'arbitrary Tailwind value. Every value comes from a token in specs/design-system.md.',
  },
  {
    id: 'stock-palette',
    pattern: new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|outline)-${STOCK_PALETTE}-\\d+\\b`, 'g'),
    message: "Tailwind's stock palette. Semantic names only — `bg-raised`, never `slate-800`.",
  },
  {
    id: 'stock-black-white',
    pattern: /\b(?:bg|text|border|fill|stroke)-(?:black|white)\b/g,
    message: 'black/white. Dark and light are different materials, not an inversion. Use bg-base / text-primary.',
  },
  {
    id: 'stock-font-size',
    pattern: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
    message: "Tailwind's font scale. Use the interface scale (text-ui-sm) or reading scale (text-read-base).",
  },
  {
    id: 'stock-radius',
    pattern: /\brounded(?:-[trbl][lr]?)?-(?:none|xs|xl|[2-4]xl)\b/g,
    message: 'off-token radius. Only rounded-sm / md / lg / full exist (§4).',
  },
  {
    id: 'stock-shadow',
    pattern: /\bshadow-(?:xs|sm|md|lg|xl|[2-9]xl|inner|none)\b/g,
    message: 'off-token shadow. Only overlays cast shadows: shadow-overlay, shadow-dialog (§4).',
  },
  {
    id: 'stock-font-weight',
    pattern: /\bfont-(?:thin|extralight|light|bold|extrabold|black)\b/g,
    message: 'off-token weight. 400/500/600 only — hierarchy is size, colour and space, not weight (§2).',
  },
  {
    id: 'numeric-duration',
    pattern: /\bduration-\d+\b/g,
    message: 'raw duration. Use duration-instant (80ms), duration-fast (140ms) or duration-base (200ms) (§5).',
  },
  {
    id: 'animated-layout-property',
    pattern: /\btransition-(?:all|\[?(?:height|width|top|left)\]?)\b/g,
    message: 'animate transform and opacity only, never height/width/top/left (§5).',
  },
];

/** Spacing needs a numeric check rather than a flat pattern. */
function checkSpacing(line) {
  const findings = [];
  const re = new RegExp(`(?<![\\w-])${SPACING_PREFIX}-(\\d+(?:\\.\\d+)?)(?![\\w./-])`, 'g');
  let match;
  while ((match = re.exec(line)) !== null) {
    const step = match[1];
    if (!SPACING_STEPS.has(step)) {
      findings.push({
        id: 'off-grid-spacing',
        text: match[0],
        message: `off-grid spacing. The 4px grid allows ${[...SPACING_STEPS].join(' ')} and nothing else (§3).`,
      });
    }
  }
  return findings;
}

/** Raw px in plain CSS must land on the 4px grid; 1px and 2px are hairlines and the focus ring. */
function checkCssPixels(line) {
  const findings = [];
  const re = /(?<![\w.-])(\d+)px\b/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    const value = Number(match[1]);
    if (value !== 0 && value !== 1 && value !== 2 && value % 4 !== 0) {
      findings.push({
        id: 'off-grid-px',
        text: match[0],
        message: 'off-grid pixel value. Every length is a multiple of 4px (1px hairlines and the 2px focus ring excepted).',
      });
    }
  }
  return findings;
}

/** Durations declared directly in CSS, outside tokens.css. */
function checkCssDuration(line) {
  const findings = [];
  const re = /(?<![\w-])(\d+(?:\.\d+)?)(ms|s)(?![\w-])/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    findings.push({
      id: 'raw-duration',
      text: match[0],
      message: 'raw duration. Use var(--dur-instant | --dur-fast | --dur-base) (§5).',
    });
  }
  return findings;
}

/**
 * Blank out comments while preserving line numbers and line count.
 *
 * Without this the linter flags its own documentation: a comment saying "never
 * write bg-red-500" is itself a match. That is the failure mode where people
 * stop writing comments to keep the linter quiet.
 */
function stripComments(source) {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
  out = out
    .split('\n')
    .map((line) => {
      // `//` only starts a comment when it is not part of a URL (`https://`).
      const index = line.search(/(?<!:)\/\//);
      return index === -1 ? line : line.slice(0, index);
    })
    .join('\n');
  return out;
}

async function collectFiles() {
  const files = [];
  for (const root of ROOTS) {
    for await (const entry of glob(`${root}/**/*.{ts,tsx,css}`)) {
      if (!EXEMPT.has(entry)) files.push(entry);
    }
  }
  return files.sort();
}

const files = await collectFiles();
const findings = [];

for (const file of files) {
  const isCss = file.endsWith('.css');
  const source = readFileSync(file, 'utf8');
  // Scan with comments blanked out, but read the opt-out marker from the raw
  // text — the marker lives in a comment, which stripping would remove.
  const rawLines = source.split('\n');
  const lines = stripComments(source).split('\n');

  lines.forEach((line, index) => {
    const previous = index > 0 ? rawLines[index - 1] : '';
    if (previous?.includes('token-lint-disable-next-line')) return;

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of line.matchAll(rule.pattern)) {
        findings.push({ file, line: index + 1, id: rule.id, text: match[0], message: rule.message });
      }
    }

    const extra = isCss
      ? [...checkCssPixels(line), ...checkCssDuration(line)]
      : checkSpacing(line);

    for (const finding of extra) {
      findings.push({ file, line: index + 1, ...finding });
    }
  });
}

if (findings.length === 0) {
  console.log(`lint:tokens — clean (${files.length} files)`);
  process.exit(0);
}

for (const finding of findings) {
  console.error(`${finding.file}:${finding.line}  ${finding.text}\n    ${finding.id}: ${finding.message}`);
}
console.error(`\nlint:tokens — ${findings.length} violation(s) across ${files.length} files.`);
console.error('Every value comes from a token in specs/design-system.md. If you need one that is not there, stop and ask.');
process.exit(1);
