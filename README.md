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
| ai.matey | `ai-matey/` | 25° |
| Agent Query (mcp-query, a2a-query, acp-query, mcp-gate) | `agent-query/` | 240° |
| Math (`@johnhenry/math`, math-plus, math-grapher, iteration) | `math/` | 320° |
| ecmanim | `ecmanim/` | 280° |
| http-fields | `http-fields/` | 220° |
| wsh | `wsh/` | 340° |
| Optical Artifact Transport | `oat/` | 115° |
| andbox | `andbox/` | 95° |
| objectify | `objectify/` | 70° |
| Circuit | `circuit/` | 45° |
| isomorphic-jj | `isomorphic-jj/` | 135° |
| jth | `jth/` | 260° |
| raijin | `raijin/` | 300° |
| temporals | `temporals/` | 155° |
| semantic-chunker | `semantic-chunker/` | 175° |
| spintax | `spintax/` | 195° |
| tester | `tester/` | 0° |

The registry is a 20°-spaced grid (the nominos arc `[122°, 219°]`, once
reserved, is open — nominos is a private erisera product and will never appear
here). At 17 stops with ≥20° spacing the wheel is full: an 18th section needs
a policy change (relax spacing to ~15°, or share a hue with a related family).

Styling comes from [`@erisera-code/circuit`](https://github.com/erisera-code/circuit)
via `src/styles/circuit-bridge.css`, which maps Circuit's tokens onto Starlight's
own CSS variables. Circuit's rules hold: neutrals never rotate with the accent, and
semantic and syntax colors are fixed — only `--hue` changes per section.

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
