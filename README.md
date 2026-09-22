# opensource.johnhenry.me

Documentation hub for John Henry's open-source JavaScript libraries and tools.

One [Astro Starlight](https://starlight.astro.build/) site, one section per project.
It replaces the six per-tool docs subdomains that previously lived on `erisera.com`
(those are retired). Commercial products remain at [erisera.com](https://erisera.com).

## Structure

Each project gets a directory under `src/content/docs/`, and the sidebar
autogenerates from it. The first path segment also selects the section's accent
hue (see `src/styles/circuit-bridge.css`).

| Section | Directory | Hue |
|---|---|---|
| tester | `tester/` | 0° |
| aimatey | `aimatey/` | 25° (family default — see `circuit-bridge.css`) |
| Circuit | `circuit/` | 45° |
| objectify | `objectify/` | 70° |
| fileable | `fileable/` | 70° — shares with objectify: the two are near-exact duals (objectify turns a directory tree into structured data; fileable turns structured JSX into a directory tree, and fileable's own `eject` command runs objectify's exact direction) |
| andbox | `andbox/` | 95° |
| packfile | `packfile/` | 95° — shares with andbox: packfile has a real npm dependency on `@johnhenry/andbox`, whose `createVirtualModuleRegistry()` resolves JS module specifiers for packfile's `createBlobPreview()` |
| Optical Artifact Transport | `oat/` | 115° |
| isomorphic-jj | `isomorphic-jj/` | 135° |
| temporals | `temporals/` | 155° |
| css-signals | `css-signals/` | 155° — shares with temporals: both are built on the Temporal API (temporals turns it into lazy sequences/ranges/recurrence rules; css-signals' `date()` source reads Temporal to publish the current time in any IANA zone as CSS custom properties) |
| semantic-chunker | `semantic-chunker/` | 175° |
| spintax | `spintax/` | 195° |
| leserve | `leserve/` | 208° — no genuine technical link to an existing section (its only dependencies are non-family packages), so it takes the ≈15°-spacing fallback in the former 195°–220° gap instead of a flimsy share |
| letterpress | `letterpress/` | 208° — shares with leserve: letterpress carries an explicit devDependency on `@johnhenry/leserve`, and its own usage examples run entirely through leserve's `serve()` |
| http-fields | `http-fields/` | 220° |
| Agent Query (mcp-query, a2a-query, acp-query, mcp-gate) | `agent-query/` | 240° |
| jth | `jth/` | 260° |
| ecmanim | `ecmanim/` | 280° |
| raijin | `raijin/` | 300° |
| Math (`@johnhenry/math`, math-plus, math-grapher, iteration) | `math/` | 320° |
| wsh | `wsh/` | 340° |
| browsermesh | `browsermesh/` | 340° — shares with wsh: browsermesh-netway's `GatewayBackend` is a real wsh-proxied backend, not just a thematic pairing |

This table must match `src/styles/circuit-bridge.css` exactly — that file is
the source of truth for what actually renders (see `Head.astro`, which sets
`data-tool` from the first URL path segment); this table exists so the
registry can be read without digging through CSS.

The registry is a 20°-spaced grid (the nominos arc `[122°, 219°]`, once
reserved, is open — nominos is a private erisera product and will never appear
here). There are 17 grid stops with ≥20° spacing between them, and the wheel
was genuinely full at that count — no further stop was ≥20° from every
existing neighbor. Three sections added after the wheel filled (browsermesh,
fileable, css-signals) each hue-shared an existing stop instead of repacking
the whole grid tighter; see "when the registry is full" below for the policy
that produced that choice. Two more (packfile, letterpress) followed the same
hue-share policy, and one (leserve) had no existing section with a genuine
technical link to share with, so it took that policy's other stated
fallback — a new stop at ≈15° spacing instead of the grid's usual 20° —
inside the `195°–220°` gap. 18 distinct hue values total as of their
addition.

Styling comes from [`@erisera-code/circuit`](https://github.com/erisera-code/circuit)
via `src/styles/circuit-bridge.css`, which maps Circuit's tokens onto Starlight's
own CSS variables. Circuit's rules hold: neutrals never rotate with the accent, and
semantic and syntax colors are fixed — only `--hue` changes per section.

### Adding a new library's docs section

Two ways content gets into `src/content/docs/<name>/`:

- **Hand-author it directly**, like most sections here (browsermesh,
  css-signals, fileable, objectify, andbox, leserve, packfile,
  letterpress, and most of the rest). This is the default.
- **Run `scripts/port-docs.mjs`**, but only if the library has its own
  *actively-maintained* external Starlight docs source you intend to keep
  re-importing from — a `SOURCES` entry names a `repo`/`ref`/`subdir` to pull
  from and rewrites that source's root-absolute links to live under the
  section prefix. It is built for the case where upstream keeps changing and
  a full re-import is meant to stay a single command. It is explicitly *not*
  a one-time content-migration convenience: `aimatey`, `ecmanim`, and
  `circuit` are the only three `SOURCES` entries today, precisely because
  they're the only sections still getting docs updates from a live source
  elsewhere. `andbox` and `objectify` were removed from `SOURCES` on
  2026-08-26 when their upstream `docs-site` branches went dead — once there
  is no more upstream to re-import from, the ported content becomes
  hand-maintained here like everything else, not a permanent importer entry.

  Decision rule: if you're adding docs for a library that doesn't have a live,
  still-changing external docs source, hand-author the section. Only reach
  for `port-docs.mjs` when re-running the import later is a real, expected
  need.

When the hue registry has no free arc left — no candidate hue is ≥20° from
every existing stop, the spacing this table's 17 grid stops already use —
don't repack the grid. The established policy (used for browsermesh,
fileable, css-signals, packfile, and letterpress) is to hue-share with an
existing section that has a genuine *technical* link to the new one, not just
a thematic one, and to record that link as a one-line comment both in
`circuit-bridge.css` next to the shared `--hue` rule and in this README's
table. If no existing section has a real technical link to share with, that's
the signal to fall back to the other stated option — relaxing grid spacing to
~15° — rather than forcing a thematically-flimsy hue-share. leserve took that
fallback: it had no real dependency on, or wasn't depended on by, any
existing section, so it took its own new ≈15°-spaced stop instead of
piggybacking on an unrelated one. (letterpress then shared leserve's new
stop, once leserve's real devDependency made that link genuine — the
fallback stop a new section creates can itself become a future hue-share
target the same way any other stop can.)

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
```

## Deploy

Deployed to `opensource.johnhenry.me` via Dokku:

```sh
git push dokku main
```

Nixpacks builds it and runs the `Procfile`, which serves `dist/` on `$PORT`.
The Node version is pinned in `.node-version`, `.nvmrc`, and `engines.node` —
keep all three in sync, since Nixpacks does not consistently prefer one.
