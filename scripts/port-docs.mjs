#!/usr/bin/env node
// One-shot importer for the per-tool docs sites this site replaces.
//
// Each source site was its own Starlight root, so every internal link is
// root-absolute (`/guides/cli/`). Here those pages live under a section
// directory, so the links need the section prefix — that rewrite is the only
// transformation applied; page content is otherwise copied verbatim.
//
// Kept in the repo (rather than run once and deleted) so re-importing after
// an upstream docs change is a single command rather than a manual pass.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SITE_ROOT = path.resolve(import.meta.dirname, '..');
const DOCS_ROOT = path.join(SITE_ROOT, 'src/content/docs');
const PROJECTS = path.join(process.env.HOME, 'Projects');
// Library repos were consolidated under ~/Packages/@johnhenry during the
// 2026-08 reorg; the docs site itself (and andbox/objectify) stayed in
// ~/Projects. A SOURCES entry must point wherever its repo actually lives.
const PACKAGES = path.join(process.env.HOME, 'Packages');

/**
 * `git` source: read from a ref so a busy working tree is never touched.
 * `dir` source: copy from a checked-out path.
 */
const SOURCES = [
  {
    section: 'ai-matey',
    repo: path.join(PACKAGES, '@johnhenry/ai.matey'),
    ref: 'origin/main',
    subdir: 'packages/ai.matey.docs/src/content/docs',
    // Generated TypeDoc pages; regenerating them needs the whole monorepo
    // built, so the API reference is deliberately out of this pass.
    exclude: (p) => p.startsWith('reference/'),
    // The api/index.md dead-link patch that used to live here was retired
    // 2026-08-26: ai.matey PR #34 fixed those links properly upstream.
  },
  {
    section: 'ecmanim',
    repo: path.join(PACKAGES, '@johnhenry/ecmanim'),
    ref: 'origin/main',
    subdir: 'website/src/content/docs',
    // Logo images referenced from the index page's <picture> element.
    assets: 'website/public/assets',
    patches: [
      {
        file: 'index.md',
        // The <picture> switched logo variants on prefers-color-scheme, but
        // Starlight themes via data-theme on <html>. When the two disagree —
        // OS dark, site set to light — the dark-mode logo renders on a light
        // background and is invisible. Swapped for two images toggled by the
        // same attribute the rest of the theme uses (.only-light/.only-dark
        // live in circuit-bridge.css).
        find: /<picture>[\s\S]*?<\/picture>/,
        replace: [
          '<img alt="ecmanim" class="only-light" width="450"',
          '     src="/assets/ecmanim-logo-light.png">',
          '<img alt="ecmanim" class="only-dark" width="450"',
          '     src="/assets/ecmanim-logo-dark.png">',
        ].join('\n'),
      },
      {
        file: 'index.md',
        // Neither the loop nor the replay handler catches, and `loop()` is
        // called bare — so a playback failure becomes an argument-less
        // "Uncaught (in promise)", which is what hid ecmanim#40 (a missing
        // `new` that threw mid-animation) until a .catch was added here.
        // Upstream fixed the `new`; the swallowed-rejection path is still
        // open, and it is the first thing a reader sees if they open devtools
        // on the page meant to showcase the library.
        find: /^loop\(\);\ndocument\.getElementById\('replay'\)\.addEventListener\('click', run\);$/m,
        replace: [
          "loop().catch((err) => console.warn('ecmanim demo playback stopped:', err));",
          "document.getElementById('replay').addEventListener('click', () =>",
          "  run().catch((err) => console.warn('ecmanim demo replay failed:', err)));",
        ].join('\n'),
      },
      {
        file: 'index.md',
        find: /  const blob = await record\(Demo, \{ quality: 'high', background: '#0d1117' \}\);/,
        replace: [
          '  let blob;',
          '  try {',
          "    blob = await record(Demo, { quality: 'high', background: '#0d1117' });",
          '  } catch (err) {',
          "    console.warn('ecmanim demo recording failed:', err);",
          '    return;',
          '  }',
        ].join('\n'),
      },
    ],
  },
  {
    section: 'andbox',
    repo: path.join(PROJECTS, '@johnhenry/andbox'),
    ref: 'origin/docs-site',
    subdir: 'docs-site/src/content/docs',
    // The docs-site branch predates the @johnhenry scope adoption (PR #2) and
    // is dead (superseded, closed unmerged as PR #1) — it will never be
    // updated with the new install commands itself, so the fix has to live
    // here rather than upstream.
    patches: [
      {
        file: 'index.md',
        find: /Zero dependencies\. Uses only Web Workers and standard browser APIs\./,
        replace: [
          'Zero dependencies. Uses only Web Workers and standard browser APIs.',
          '',
          '> Previously published as `andbox` (last unscoped version 0.1.1). Same',
          '> library, same API — the scoped package restarts its version line at',
          '> 0.0.0: a new address and era, not a maturity signal.',
        ].join('\n'),
      },
      {
        file: 'index.md',
        find: /npm install andbox/,
        replace: 'npm install @johnhenry/andbox',
      },
      {
        file: 'index.md',
        find: /import \{ createSandbox \} from 'https:\/\/esm\.sh\/andbox';/,
        replace: "import { createSandbox } from 'https://esm.sh/@johnhenry/andbox';",
      },
      {
        file: 'index.md',
        find: /import \{ createSandbox \} from 'andbox';/,
        replace: "import { createSandbox } from '@johnhenry/andbox';",
      },
      {
        file: 'api.md',
        find: /import \{ gateCapabilities \} from 'andbox';/,
        replace: "import { gateCapabilities } from '@johnhenry/andbox';",
      },
      {
        file: 'api.md',
        find: /import \{ createNetworkFetch \} from 'andbox';/,
        replace: "import { createNetworkFetch } from '@johnhenry/andbox';",
      },
    ],
  },
  {
    section: 'objectify',
    repo: path.join(PROJECTS, '@johnhenry/objectify'),
    ref: 'origin/docs-site',
    subdir: 'docs-site/src/content/docs',
    // The docs-site branch predates the npm binary distribution (objectify
    // PR #2) and is dead — like andbox's, it will never learn the npm
    // install story itself, so the site's hand-edits (this repo's PR #1)
    // are re-applied here to survive a re-port.
    patches: [
      {
        file: 'index.md',
        find: /Requires \[Rust\]\(https:\/\/rustup\.rs\) 1\.70\+\./,
        replace: [
          'The easiest way, if you have Node.js 18+:',
          '',
          '```sh',
          'npm install -g @johnhenry/objectify',
          '# or run it without installing:',
          'npx @johnhenry/objectify --help',
          '```',
          '',
          'This installs a small platform-detection shim plus a prebuilt binary for your',
          'OS/architecture — no Rust toolchain required. Prebuilt binaries currently',
          'ship for macOS (Apple Silicon and Intel), Linux (x64 and arm64, glibc), and',
          'Windows (x64); see the [CLI reference](/cli-reference/) for the',
          'full platform list and how the package works internally.',
          '',
          'Or build from source, if you have [Rust](https://rustup.rs) 1.70+:',
        ].join('\n'),
      },
      {
        file: 'cli-reference.md',
        find: /Run `objectify --help` or `objectify <command> --help` for built-in documentation including examples\. Every command has a `--help` flag with a description, per-argument docs, format reference, and examples\.\n/,
        replace: [
          'Run `objectify --help` or `objectify <command> --help` for built-in documentation including examples. Every command has a `--help` flag with a description, per-argument docs, format reference, and examples.',
          '',
          '### How the npm package works',
          '',
          '`npm install -g @johnhenry/objectify` does not compile anything — objectify',
          'is a Rust binary, and `@johnhenry/objectify` is a thin Node.js shim',
          '(`bin/objectify.js`) that detects your OS/CPU at install time and delegates',
          'to a prebuilt binary shipped in one of five tiny per-platform packages,',
          'installed automatically as `optionalDependencies` (the same pattern used by',
          '`esbuild`, `@swc/core`, and `turbo`):',
          '',
          '| Platform | Package |',
          '|---|---|',
          '| macOS, Apple Silicon | `@johnhenry/objectify-darwin-arm64` |',
          '| macOS, Intel | `@johnhenry/objectify-darwin-x64` |',
          '| Linux, x64 (glibc) | `@johnhenry/objectify-linux-x64` |',
          '| Linux, arm64 (glibc) | `@johnhenry/objectify-linux-arm64` |',
          '| Windows, x64 | `@johnhenry/objectify-win32-x64` |',
          '',
          'No postinstall script runs and no binary is downloaded over the network at',
          "install time — npm's own `os`/`cpu`-based optional-dependency filtering picks",
          'the right package, and the compiled binary ships inside its tarball like any',
          'other npm package asset. There is currently no `musl` build (e.g. for',
          'Alpine-based Docker images); if you need one, open an issue on the repo.',
          '',
          "If you'd rather build from source or need a platform not listed above, see",
          '[Installation](/#installation) for the `cargo build --release`',
          'path.',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    section: 'circuit',
    repo: path.join(PROJECTS, '@erisera/circuit'),
    ref: 'origin/main',
    subdir: 'docs/src/content/docs',
  },
];

// Paths that stay at the site root rather than moving under a section:
// assets mirrored from npm packages by sync-circuit-assets.mjs.
const SHARED_ROOTS = ['/src/', '/ecmanim-dist/'];

/**
 * Each source site was its own root, so a root-absolute path meant "this
 * site". Here it has to mean "this section". Covers markdown links and the
 * HTML src/srcset/href attributes the pages also use — the ecmanim logo is
 * an <img>, not a markdown image, and would silently 404 otherwise.
 */
function rewritePaths(body, section) {
  const prefix = (href) =>
    href.startsWith('//') || SHARED_ROOTS.some((r) => href.startsWith(r))
      ? null
      : `/${section}${href}`;

  return body
    .replace(/\]\((\/[^)\s]*)\)/g, (whole, href) => {
      const next = prefix(href);
      return next ? `](${next})` : whole;
    })
    .replace(/\b(src|href)="(\/[^"]*)"/g, (whole, attr, href) => {
      const next = prefix(href);
      return next ? `${attr}="${next}"` : whole;
    })
    .replace(/\bsrcset="(\/[^"]*)"/g, (whole, href) => {
      const next = prefix(href);
      return next ? `srcset="${next}"` : whole;
    });
}

/**
 * A section's index page becomes that section's landing page. Source index
 * pages often use `template: splash`, which suppresses the sidebar — wrong
 * for a section inside a larger site, so it's dropped along with the hero
 * block that only renders under it.
 */
function normalizeIndex(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return raw;
  const [, frontmatter, body] = match;
  const cleaned = frontmatter
    .split('\n')
    .filter((line) => !/^template:\s*splash\s*$/.test(line))
    .join('\n')
    .replace(/^hero:\n(?:[ \t]+.*\n?)*/m, '');
  return `---\n${cleaned.trimEnd()}\n---\n${body}`;
}

function listFiles(repo, ref, subdir) {
  const out = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, subdir], {
    cwd: repo,
    encoding: 'utf8',
  });
  return out.split('\n').filter((p) => /\.mdx?$/.test(p));
}

const PUBLIC_ROOT = path.join(SITE_ROOT, 'public');

/** Copies a source site's public assets under public/<section>/, matching the path rewrite. */
function copyAssets(repo, ref, assetDir, section) {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, assetDir], {
    cwd: repo,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  for (const file of files) {
    const target = path.join(PUBLIC_ROOT, section, path.relative(path.dirname(assetDir), file));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      execFileSync('git', ['show', `${ref}:${file}`], {
        cwd: repo,
        maxBuffer: 128 * 1024 * 1024,
      })
    );
  }
  return files.length;
}

// Validate every source before touching anything. The per-section rmSync
// below is destructive, so a single bad entry (a moved repo, a deleted
// branch) must fail the whole run up front — not after earlier sections have
// already been wiped. A missing cwd makes execFileSync throw ENOENT with a
// message indistinguishable from "git is not installed", which is how a
// stale repo path once deleted 29 pages and then lied about why.
const problems = [];
for (const { section, repo, ref, subdir } of SOURCES) {
  if (!fs.existsSync(repo)) {
    problems.push(`${section}: repo path does not exist: ${repo}`);
    continue;
  }
  try {
    listFiles(repo, ref, subdir);
  } catch (err) {
    problems.push(`${section}: git ls-tree ${ref} ${subdir} failed in ${repo}: ${err.message}`);
  }
}
if (problems.length) {
  console.error('Refusing to run — fix these SOURCES entries first:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

let total = 0;
let patchesApplied = 0;
let assetCount = 0;
for (const { section, repo, ref, subdir, exclude, patches, assets } of SOURCES) {
  const dest = path.join(DOCS_ROOT, section);
  fs.rmSync(dest, { recursive: true, force: true });

  if (assets) assetCount += copyAssets(repo, ref, assets, section);

  const files = listFiles(repo, ref, subdir);
  let count = 0;

  for (const file of files) {
    const rel = path.relative(subdir, file);
    if (exclude?.(rel)) continue;

    const raw = execFileSync('git', ['show', `${ref}:${file}`], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

    const isIndex = rel === 'index.md' || rel === 'index.mdx';
    let staged = isIndex ? normalizeIndex(raw) : raw;

    // Patches repair links that were already broken upstream, so they run
    // before the section prefix is applied and fail loudly if the upstream
    // text they target has changed.
    for (const patch of patches ?? []) {
      if (patch.file !== rel) continue;
      if (!patch.find.test(staged)) {
        throw new Error(
          `Patch for ${section}/${rel} did not match — upstream content changed, re-check it.`
        );
      }
      staged = staged.replace(patch.find, patch.replace);
      patchesApplied += 1;
    }

    const content = rewritePaths(staged, section);

    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    count += 1;
  }

  console.log(`${section.padEnd(10)} ${String(count).padStart(3)} pages  (${ref})`);
  total += count;
}

console.log(
  `\n${total} pages imported, ${assetCount} asset(s) copied, ` +
    `${patchesApplied} upstream link fix(es) applied.`
);
