---
title: "Mounting a fileable tree"
description: "Turn a fileable Dir/File tree into static routes — naming rules, the Fragment-based way to avoid a folder name, raw-child mounting, and a lone bare File."
---

[fileable](/fileable/) and servable are deliberately separate packages —
fileable stays a filesystem tool, servable stays a routing tool — but
servable can optionally *mount* a fileable tree as static routes, turning a
`Dir`/`File` template directly into live `Route`s with no build step in
between.

```tsx
import { Dir, File } from "@johnhenry/fileable"; // optional peer dependency
import { Router, Group, compile } from "@johnhenry/servable";

const site = Dir({ name: "dist", children: [File({ name: "index.html", children: ["<h1>Home</h1>"] })] });
const app = <Router><Group prefix="/static" from={site} /></Router>;
// serves at /static/dist/index.html -- "dist" IS part of the URL, see "Naming" below.
```

This runs fileable's own exported `build`/`resolve`/`layout` stages
(stopping short of Hash/Write — nothing is written to disk) to get a real
artifact list: paths, byte-exact content, binary-safety already solved by
fileable's UTF-8-round-trip detection. `@johnhenry/fileable` is an
**optional peer dependency**, lazily imported only when a `from` value
duck-types as a fileable tree — routing-only consumers never pay for it.

## Naming

A `Dir`/`File`'s name is *always* part of the mounted URL, root or nested —
no special-casing. If you give the mount root a name, it shows up in the
URL, exactly like a nested `Dir`'s name already does; there is no separate
"the outermost name doesn't count" rule to remember.

(An earlier version of this package stripped the mount root's own name,
mimicking `express.static('dist')` serving `dist`'s *contents* at the mount
point without `dist` itself appearing in the URL. That analogy didn't
actually fit: Express's argument is a bare filesystem path, never rendered
anywhere, but a fileable `Dir`/`File`'s `name` is a real, deliberately
authored part of the tree — the only reason to give one is for it to mean
something, and the only place it can mean something here is the URL.)

**Don't want a folder name in the URL at all?** Don't wrap the mount in a
named `Dir` — use a Fragment (`<>...</>`) as the mount root instead. A
Fragment has no `name` of its own; its children flatten into independent
top-level artifacts, each still keeping *its own* name:

```tsx
const site = (
  <>
    <File name="index.html">{"<h1>Home</h1>"}</File>
    <File name="about.html">{"<h1>About</h1>"}</File>
  </>
);
const app = <Router><Group prefix="/static" from={site} /></Router>;
// /static/index.html and /static/about.html -- no enclosing folder name anywhere.
```

Other mapping rules: a directory's `index.html` also serves at the
directory's own path. A fileable `symlink` artifact becomes a `Redirect`,
not a duplicate route — a symlink *means* "this path is really that other
path." An `encode="zip"`/`encode="wbn"` artifact **isn't mounted yet** —
fileable's own archive assembly lives in its internal
`write/zip.ts`/`write/wbn.ts`, not its public API; skipped with a warning
rather than reimplemented partially (build a `<Route src>`/`serveFile()`
route by hand for a zip/wbn download in the meantime — or see
[packfile](/packfile/), which serves a `.wbn` archive directly). A fileable
`Rm` node has nothing to serve; skipped with a warning.

## Mounting without `from=`

`from=` isn't the only way in — a fileable tree can sit directly as a raw
child of `<Router>`/`<Group>`, exactly like any other nested servable
primitive, since both frameworks' JSX is sugar over plain
`{tag,props,children}`-producing factory functions. That means fileable's
own `<Dir>`/`<File>` tags can be written **literally, nested inside
servable's `<Router>`/`<Group>` JSX, in the same expression** — one file,
one `@jsxImportSource @johnhenry/servable` pragma, both vocabularies used
adjacently:

```tsx
/** @jsxImportSource @johnhenry/servable */
import { Dir, File } from "@johnhenry/fileable";
import { Router, Group, Route, compile } from "@johnhenry/servable";

const app = (
  <Router>
    <Group prefix="/static">
      {/* "dist" is part of the URL -- this file serves at
          /static/dist/index.html. See "Naming" above for why. */}
      <Dir name="dist">
        <File name="index.html">{"<h1>Home</h1>"}</File>
      </Dir>
      <Route path="/api" method="GET">{{ ok: true }}</Route>
    </Group>
  </Router>
);
```

This works because servable's `jsx()` calls any function-typed tag directly
with its props (`type(allProps)`) rather than treating it as markup — so
`<Dir>`/`<File>`, evaluated under servable's pragma, invoke fileable's
*own* `Dir`/`File` functions and produce real fileable `Descriptor`s,
identical to calling them by hand. `Descriptor.tag`'s type is widened to
the general `symbol` (not each package's own exact `typeof FRAGMENT`)
specifically so this type-checks: fileable's Fragment marker is a
different `Symbol.for(...)` key than servable's.

If you're building the tree programmatically (conditionally including a
subtree, mapping over data) rather than writing it out literally, calling
`Dir({...})`/`File({...})` as plain functions and embedding the result via
`{}` works exactly the same way:

```tsx
const site = Dir({ name: "dist", children: [File({ name: "index.html", children: ["<h1>Home</h1>"] })] });
const app2 = <Router><Group prefix="/static">{site}</Group></Router>; // /static/dist/index.html
// or, with no Group at all -- mounts at the root:
const app3 = <Router>{site}</Router>; // /dist/index.html
```

Detection uses `FILEABLE_DESCRIPTOR`, a `Symbol.for("fileable.descriptor")`
global-registry brand `@johnhenry/fileable@0.0.1`+ stamps onto every
descriptor it creates — so a raw fileable tree is recognized wherever a
servable primitive could appear as a child of `Router`/`Group`, not just
behind `from=`. `from=` and a raw child are two spellings of the same
mount, not two features.

## Mounting a single bare `<File>`

A lone `<File>` — not wrapped in a `<Dir>` — mounts too, whether named or
not:

```tsx
// Named: the name is part of the URL -- this serves at /static/page.html.
<Group prefix="/static"><File name="page.html">{"<h1>hi</h1>"}</File></Group>

// Nameless: there's no developer-supplied name to put anywhere, so it
// serves directly at the Group's own prefix, /static:
<Group prefix="/static"><File>{"<h1>hi</h1>"}</File></Group>
```

Fileable itself requires a name on any root-level `File` — a nameless bare
`File` mounted directly as a `Group`/`Router` child gets a synthetic
internal name servable gives it purely to satisfy that requirement (never
your own name being discarded; there isn't one to discard). That synthetic
name also picks the default `Content-Type: text/html` (nameless File
content is almost always markup/text). If you need a different
`Content-Type`, give the `File` a real `name=` with the extension you want
— at that point your own name is used and kept.

## Fileable descriptors are only recognized under `Router`/`Group`

A `<Dir>`/`<File>` is **not** recognized as a child of `<Route>` (or
anything else) — only `<Router>`/`<Group>` are scanned for a mounted
fileable tree. Putting one under `<Route>` throws a clear compile-time
error rather than silently doing something else:

```tsx
// Throws: "a fileable <file> descriptor can't be used here, under <route>"
<Route path="/oops" method="GET">
  <File name="x.html">{"content"}</File>
</Route>
```

For a single file's content at one specific `Route`, you almost always
want `Route`'s own body handling instead — it already accepts a string,
`Response`, any `BodyInit`, or a plain object (JSON) as its children, plus
a dedicated `src=` prop for serving an on-disk file with correct
`Content-Type`/range-request/caching support, independent of fileable
entirely (see [API](/servable/api/), "Standard Web API usage"). Reaching
for fileable's `File` here would just be solving a problem `Route` already
solves on its own — `File`'s real job is being part of a `Dir` tree
(multi-file layout, content hashing, symlinks, ...), not a single-value
response.
