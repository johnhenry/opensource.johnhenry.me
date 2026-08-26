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
import { fileURLToPath } from 'node:url';

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
  // andbox and objectify were removed from SOURCES 2026-08-26: both ported
  // from dead `docs-site` branches that will never update again, so every
  // site-side improvement was accreting as another patch here. Their
  // sections are now hand-maintained in this repo like the other
  // hand-authored sections; the final ported content is committed history.
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
 *
 * src/href/srcset are matched with either quote style — a source site is
 * under no obligation to use double quotes, and a single-quoted attribute
 * passing through unrewritten would silently keep pointing at the old
 * site's root.
 */
export function rewritePaths(body, section) {
  const prefix = (href) =>
    href.startsWith('//') || SHARED_ROOTS.some((r) => href.startsWith(r))
      ? null
      : `/${section}${href}`;

  return body
    .replace(/\]\((\/[^)\s]*)\)/g, (whole, href) => {
      const next = prefix(href);
      return next ? `](${next})` : whole;
    })
    .replace(/\b(src|href)=(?:"(\/[^"]*)"|'(\/[^']*)')/g, (whole, attr, dq, sq) => {
      const quote = dq !== undefined ? '"' : "'";
      const href = dq !== undefined ? dq : sq;
      const next = prefix(href);
      return next ? `${attr}=${quote}${next}${quote}` : whole;
    })
    .replace(/\bsrcset=(?:"([^"]*)"|'([^']*)')/g, (whole, dq, sq) => {
      const quote = dq !== undefined ? '"' : "'";
      const value = dq !== undefined ? dq : sq;
      // A candidate is `url` or `url descriptor` (e.g. `/img-2x.png 2x`); each
      // one is a separate URL and must be rewritten independently, not just
      // the first, or later candidates 404 post-port.
      const rewritten = value
        .split(',')
        .map((candidate) => {
          const trimmed = candidate.trim();
          const spaceIdx = trimmed.search(/\s/);
          const url = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
          const descriptor = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx);
          if (!url.startsWith('/')) return trimmed;
          const next = prefix(url);
          return next ? `${next}${descriptor}` : trimmed;
        })
        .join(', ');
      return `srcset=${quote}${rewritten}${quote}`;
    });
}

/**
 * A section's index page becomes that section's landing page. Source index
 * pages often use `template: splash`, which suppresses the sidebar — wrong
 * for a section inside a larger site, so it's dropped along with the hero
 * block that only renders under it.
 */
export function normalizeIndex(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return raw;
  const [, frontmatter, body] = match;
  const cleaned = frontmatter
    .split('\n')
    .filter((line) => !/^template:\s*splash\s*$/.test(line))
    .join('\n')
    .replace(/^hero:\n(?:(?:[ \t]+.*)?\n?)*/m, '');
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

// Everything below is guarded so importing this module (e.g. from tests, to
// exercise the pure functions above in isolation) never touches the
// filesystem or runs the destructive rmSync calls — only running the file
// directly does.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
function main() {
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
}

if (isMain) main();
