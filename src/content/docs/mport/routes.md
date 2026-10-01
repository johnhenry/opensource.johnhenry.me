---
title: "Routes and specifiers"
description: "Object and array route tables, how patterns are ranked and matched, and every specifier form mport understands."
sidebar:
  order: 3
---

`createRouter(routes, options)` takes either an object or an array.

**Object form.** An exact key beats a glob, a longer glob beats a shorter one, and `"*"` is the catch-all. Only a trailing `*` is a wildcard, and it is a plain prefix match: `"react*"` also matches `react-dom`.

```js
createRouter({
  "*": [esmSh(), jsDelivr(), unpkg()],
  "react*": esmSh(),
  "@std/*": jsr(),
  "@company/*": custom("https://modules.company.com/{bare}.js"),
});
```

**Array form.** The first match wins. `match` may also be a `RegExp` or a function.

```js
import { route } from "@johnhenry/mport";
createRouter([
  route("@std/*", jsr()),
  route("github:*", github()),
  route("*", [esmSh(), jsDelivr(), unpkg()]),
]);
```

**An app-owned prefix** (your own `/components/` directory) is routed like any package, with no registry lookup: a `custom()` template that has neither `{version}` nor `{entry}` asks the registry nothing.

```js
createRouter({
  "components/*": custom("/components/{path}", { name: "app", build: "app" }),   // components/button.js → /components/button.js
  "*": [esmSh(), jsDelivr()],
});
```

`components/` as a specifier gives the prefix mapping `"components/": "/components/"` (a directory specifier is matched as written too, so a `"components/*"` route captures it). Set `name` and `build` explicitly (a path-only template has no host to default them from); `build: "app"` keeps the lockfile from handing the path to a CDN. [API › Recipe: an app-owned prefix](/mport/api/router/#recipe-an-app-owned-prefix-no-registry); [example 20](/mport/examples/).

What each route value means:
- An array is shorthand for `fallback(...)`.
- A string is shorthand for `custom(url)`.
- Anything else is a provider or a strategy.

## Specifiers

| Specifier | Meaning |
|---|---|
| `react`, `react@^19`, `react@19.2.0/jsx-runtime` | npm package, optional range, optional sub-path |
| `@scope/pkg@1.2.3/dist/x.js` | scoped npm package |
| `npm:lodash-es@4` | explicit npm |
| `jsr:@std/path@^1` | JSR |
| `github:user/repo@ref/path` or `gh:` | a GitHub repository |
| `lit/` (trailing slash) | a prefix mapping in the import map. Raw file CDNs (jsDelivr, unpkg, jspm, `local()`) skip it for packages with an `exports` map, and `jsDelivr({ esm: true })` always skips it, so the route falls through to e.g. esm.sh |
| `{ name, version, path, registry }` | object form |
| `./x.js`, `/x.js`, `https://…`, `node:fs`, `@scope` | not routed: `resolve()` returns `null` |

Patterns match the specifier without its version, e.g. `npm:react/jsx-runtime`. Three rules affect which route and registry apply:
- An explicit specifier such as `npm:react` also matches bare routes (`react*`).
- `gh:` specifiers match as `github:`, so write route patterns as `"github:*"`.
- A bare scoped name such as `@std/path` that reaches a JSR-only provider is treated as a JSR package.
