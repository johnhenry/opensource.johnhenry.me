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

/**
 * `git` source: read from a ref so a busy working tree is never touched.
 * `dir` source: copy from a checked-out path.
 */
const SOURCES = [
  {
    section: 'ai-matey',
    repo: path.join(PROJECTS, 'ai.matey'),
    ref: 'origin/main',
    subdir: 'packages/ai.matey.docs/src/content/docs',
    // 958 generated TypeDoc pages; regenerating them needs all 21 packages
    // built, so the API reference is deliberately out of this pass.
    exclude: (p) => p.startsWith('reference/'),
    patches: [
      {
        file: 'api/index.md',
        // These eight `/api/packages/*` targets never existed upstream — the
        // links were already dead on ai.matey's own docs site. Four have a
        // real equivalent under packages/; the rest are covered by the
        // overview page.
        find: /- \[ai\.matey\.core\]\(\/api\/packages\/ai\.matey\.core\)[\s\S]*?- \[ai\.matey\.cli\]\(\/api\/packages\/cli\) - CLI tools/,
        // Paths here are pre-rewrite (section prefix is added afterwards).
        replace: [
          '- [ai.matey.core](/packages/core) - Bridge, Router, Middleware',
          '- [ai.matey.frontend](/packages/frontend) - Frontend adapters',
          '- [ai.matey.backend](/packages/backend) - Backend adapters',
          '- [ai.matey.middleware](/packages/middleware) - Middleware',
          '',
          'For every package in the monorepo, including `http`, `react-core`,',
          '`wrapper` and `cli`, see the [full package list](/packages/overview).',
        ].join('\n'),
      },
    ],
  },
  {
    section: 'ecmanim',
    repo: path.join(PROJECTS, '@johnhenry/ecmanim'),
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
  },
  {
    section: 'objectify',
    repo: path.join(PROJECTS, '@johnhenry/objectify'),
    ref: 'origin/docs-site',
    subdir: 'docs-site/src/content/docs',
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
