---
title: "Literal cross-package JSX"
description: "Nest fileable's <Dir>/<File>, servable's <Route>/<Group>, and hostable's <Host>/<Gateway> in one JSX expression under a single pragma — the payoff of the fileable → servable → hostable lineage."
---

Servable's own `<Route>`/`<Group>` can be written literally, nested
directly inside `<Gateway>`/`<Host>`, in the same file, under one
`@jsxImportSource @johnhenry/hostable` pragma:

```tsx
/** @jsxImportSource @johnhenry/hostable */
import { Gateway, Host, Group, Route, Upstream, compile } from "@johnhenry/hostable";

const app = (
  <Gateway>
    <Host name="a.example.com">
      <Group prefix="/api">
        <Route path="/users" method="GET">{{ users: [] }}</Route>
      </Group>
      <Upstream path="/*" handler={async () => new Response("fallback")} />
    </Host>
  </Gateway>
);
```

This works because hostable's `jsx()` calls any function-typed tag
directly with its props (`type(allProps)`) rather than treating it as
markup, and `Descriptor.tag`'s type is the general `symbol` (not
hostable's own exact `typeof FRAGMENT`) specifically so a sibling
package's differently-keyed Fragment marker still type-checks.

## Three packages, one expression

The same mechanism goes a layer deeper: fileable's `<Dir>`/`<File>` can be
nested directly inside servable's `<Group>`, which is itself nested inside
hostable's `<Host>` — three packages' JSX, one pragma, one expression:

```tsx
/** @jsxImportSource @johnhenry/hostable */
import { Dir, File } from "@johnhenry/fileable";
import { Gateway, Host, Group, Route, compile } from "@johnhenry/hostable";

const app = (
  <Gateway>
    <Host name="a.example.com">
      <Group prefix="/static">
        {/* "dist" IS part of the URL -- this file serves at
            https://a.example.com/static/dist/index.html. See servable's
            "Mounting a fileable tree" for the full naming rule (including
            the Fragment-based way to mount without a folder name at all,
            and mounting a bare <File> -- named or not -- with no <Dir>
            wrapper). */}
        <Dir name="dist">
          <File name="index.html">{"<h1>Home</h1>"}</File>
        </Dir>
      </Group>
      <Route path="/api/hello" method="GET">{{ hello: "world" }}</Route>
    </Host>
  </Gateway>
);
```

See `examples/05-nested-jsx` in the repo for the full, verified version
(static assets, a JSON API, and a reverse-proxied second domain, all in
one tree).

Fileable descriptors are recognized the same way here as in plain servable
— as a child of `<Group>`/`<Router>` (or that `Group`'s own `from=`),
never as a child of `<Route>`/`<Upstream>`. Putting one under `<Route>`
throws the same clear compile-time error servable's own compile stage
throws (hostable delegates to servable's `compile()` for everything below
`<Host>`, so this isn't reimplemented here) — use `<Route>`'s own
body/`src=` handling for a single file's content at one route instead.

## Fragments work at every layer

`<>...</>` works directly under `<Host>`/`<Gateway>` here, the same as it
does under servable's own `<Router>`/`<Group>`, and the same as fileable's
own `<>...</>` works as a mount root. All three compose in one nested tree
without conflicting:

```tsx
/** @jsxImportSource @johnhenry/hostable */
import { Dir, File } from "@johnhenry/fileable";
import { Gateway, Host, Group, Route, compile } from "@johnhenry/hostable";

// A fileable Fragment is genuinely necessary here: Group's `from=` only
// ever accepts ONE value, so mounting multiple named files with no
// enclosing folder name in the URL requires bundling them into that one
// slot.
const site = (
  <>
    <File name="index.html">{"home"}</File>
    <File name="about.html">{"about"}</File>
  </>
);

// A component function returning a Fragment is the OTHER place Fragment
// earns its keep: a function can only return one value, and Fragment is
// what lets that one value stand for several sibling Routes -- reusable
// across as many Hosts as you embed it in, not copy-pasted per domain.
function CommonRoutes() {
  return (
    <>
      <Route path="/health" method="GET">{{ ok: true }}</Route>
      <Route path="/version" method="GET">{{ version: "1.0.0" }}</Route>
    </>
  );
}

const app = (
  <Gateway>
    <Host name="a.example.com">
      <Group prefix="/static">{site}</Group>
      <CommonRoutes />
    </Host>
    <Host name="b.example.com">
      <CommonRoutes />
    </Host>
  </Gateway>
);
```

`<CommonRoutes />`, capitalized — not `<commonRoutes />`. This isn't
specific to this package: every JSX transform decides how to compile a tag
name from its capitalization alone, before any custom `jsx()` factory ever
runs — a lowercase-starting tag always compiles to a bare string
(`jsx("commonRoutes", {})`), which this family's `jsx()` then treats as an
unrecognized markup tag and rejects (`<commonRoutes> is not a servable
primitive here`); an uppercase-starting tag compiles to a lookup of the
`CommonRoutes` binding (`jsx(CommonRoutes, {})`), which `jsx()` already has
a branch for — `typeof type === "function"` — and calls directly. Same
convention this whole ecosystem uses for `Dir`/`File`/`Route`/`Group`/
`Host` themselves.

hostable's own exported `Fragment` (from `@johnhenry/hostable/jsx-runtime`,
what `<>...</>` compiles to under this package's `@jsxImportSource`) is
deliberately *servable's* Fragment symbol, re-exported rather than
redefined — hostable has no build/resolve/layout pipeline of its own, it
hands everything to servable's real `compile()`, so a genuinely distinct
hostable Fragment symbol would need servable's own `build()` to recognize
it too, which it never would (each layer's Fragment/`FILEABLE_DESCRIPTOR`
detection is scoped to its own, `Symbol.for()`-registry-keyed marker).

An earlier version of this package *did* mint its own distinct
`Symbol.for("hostable.fragment")` — a real bug, caught by actually
compiling and fetching a `<>...</>` under this pragma rather than just
reasoning about the symbol keys statically: it threw
`<Symbol(hostable.fragment)> is not a servable primitive here` the moment
it was used for anything beyond being re-exported. Fixed; see
`test/fragment.test.tsx` in the repo for the regression coverage (both the
standalone case and the fileable/hostable-Fragments-composed-together case
above).
