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
| Agent Query (mcp-query, a2a-query, acp-query, mcp-gate) | `agent-query/` | 250° |
| Math (`@johnhenry/math`, math-plus, math-grapher, iteration) | `math/` | 315° |
| ecmanim | `ecmanim/` | 285° |
| andbox | `andbox/` | 95° |
| objectify | `objectify/` | 70° |
| Circuit | `circuit/` | 45° |

Hues avoid the arc reserved by the closed nominos family (`[122°, 219°]`); a new
section should pick a free hue in `(45°, 122°)` or `(219°, 365°)`, at least 20°
from every existing stop.

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
