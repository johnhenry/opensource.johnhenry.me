---
title: "Configuration"
description: "Config files, the four-layer priority order, programmatic and workspace overrides, deep-merge semantics, and resetting."
---

Configuration is dot-notation keys over JSON, merged from up to four
layers. Later layers win:

| Priority | Layer | Persisted? |
| --- | --- | --- |
| 1 (lowest) | `.jj/config.json` (global) | yes |
| 2 | `config.load({ override })` | no — session only |
| 3 | `.jj/workspace-config.json` | yes |
| 4 (highest) | `config.load({ workspace })` | no — session only |

## The API

```javascript
await jj.config.set({ name: 'user.name', value: 'Alice' });  // persists to .jj/config.json
await jj.config.get({ name: 'user.email' });                 // merged view; null if unset
await jj.config.list();                                      // whole merged object
await jj.config.load({ override, workspace });               // reload + apply layers
```

`name` takes dot paths (`user.email`, `custom.nested.value`); values can be
anything JSON. (`key` is accepted as a legacy alias for `name`; `set` also
takes a `scope` of `'user' | 'repo' | 'global'`.)

## Programmatic layers

No file I/O — merged in memory over whatever the files say:

```javascript
await jj.config.load({ override: { ui: { theme: 'light' } } });

// workspace outranks override:
await jj.config.load({
  override:  { ui: { theme: 'light' } },
  workspace: { ui: { theme: 'high-contrast' } },   // ← this wins
});
```

Three patterns this exists for:

```javascript
// Tests — configure without touching the filesystem
await repo.config.load({ workspace: { user: { name: 'Test', email: 't@e.st' } } });

// Browser — config from user input, no IndexedDB writes
await repo.config.load({ workspace: { user: { email: emailInput.value } } });

// Environment switches
const cfg = process.env.NODE_ENV === 'production' ? prodCfg : devCfg;
await repo.config.load({ workspace: cfg });
```

## Workspace config files

Drop overrides in `.jj/workspace-config.json` (layer 3) for per-checkout
settings that *should* persist — e.g. a work email in a work clone:

```json
{ "user": { "email": "alice@work.example" } }
```

Call `config.load()` after writing it (or on your next session) to apply.

## Deep-merge semantics

Objects merge recursively; overriding one nested key keeps its siblings:

```javascript
await jj.config.set({ name: 'user.name',  value: 'Alice' });
await jj.config.set({ name: 'user.email', value: 'alice@global.example' });
await jj.config.load({ workspace: { user: { email: 'alice@work.example' } } });

await jj.config.get({ name: 'user.name'  });  // 'Alice'            (kept)
await jj.config.get({ name: 'user.email' });  // 'alice@work.example' (overridden)
```

## Resetting

Programmatic layers are session-only. A bare `load()` drops them and
returns you to what the files say:

```javascript
await jj.config.load({ workspace: { temp: { flag: true } } });
await jj.config.load();                       // temp.flag gone; files rule again
```

To reset user identity wholesale: `jj.userConfig.init({ userName,
userEmail })` + `jj.userConfig.save()`.

## What lives in config

The schema is open. The keys the library itself reads are `user.name` /
`user.email` (commit authorship); everything else — `ui.*`, `merge.*`, your
own namespaces — is yours to define and read back. This is *library*
configuration: real jj's config-file discovery (`/etc/jj`, TOML files,
conditional scopes) is out of scope here.

Everything above works identically in the browser; file-backed layers just
live in IndexedDB via LightningFS.

Next: [Migration from isomorphic-git](/isomorphic-jj/migration-from-isomorphic-git/).
