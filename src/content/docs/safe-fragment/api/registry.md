---
title: "Registry"
description: "How safe-fragment stores profiles and DOMPurify state: the globalThis-keyed shared state that the ESM and CJS builds share, and the public functions that read it."
sidebar:
  order: 105
---

Profiles are held in a process-wide registry. It is read and written only through the public functions
[`registerProfile`, `unregisterProfile`, `deriveProfile`, `getProfile` and `listProfiles`](/safe-fragment/api/profiles/); this page
documents what that registry is.

## Contents

- A `Map` from profile name to a deeply frozen `ProfileDefinition`, seeded lazily with the four built-ins (`plain-text-v1`,
  `article-v1`, `ui-v1`, `email-v1`).
- A set of the built-in names, which is how `registerProfile` and `unregisterProfile` refuse to replace or remove them.

Reading it never touches a DOM global, so `getProfile` and `listProfiles` work in Node.

## Shared across builds

An application can load both the ESM and CJS builds of the package (its own code as ESM, a dependency via `require`). Each build is
a separate module instance, so module-level state would exist twice. The registry therefore lives in **one object on `globalThis`**,
under the key `Symbol.for("@johnhenry/safe-fragment/shared-state/v1")`, created lazily inside functions (never at module top level),
non-enumerable and non-writable.

That object also holds the DOMPurify loader, the loader promise, and a per-window cache of DOMPurify instances. The consequences:

- A profile registered through one build is visible to the other.
- There is **one DOMPurify instance per window**, so the Trusted Types `dompurify` policy is registered once
  ([Trusted Types and CSP](/safe-fragment/trusted-types-and-csp/)).
- `SafeFragmentError` uses a duck-typed `Symbol.hasInstance` so `instanceof` also holds across builds.

The repository's `test/package/dual-package.test.ts` loads both built files in Node and checks all of this. Do not add other
module-level mutable state.

## Semantics

- **Names are unique.** Registering an existing name throws `INVALID_PROFILE`; `unregisterProfile` it first. Built-ins can never be
  replaced or unregistered.
- **Profiles are immutable once registered.** There is no update call: register a new versioned name instead
  ([Profiles](/safe-fragment/profiles/#versioning-and-immutability)).
- **A profile is visible everywhere** the name is used: `<safe-fragment profile="...">`, `sanitizeToFragment({ profile })` and
  `deriveProfile(base)`.
- **Registering before the first render** is required for the element to find it; an unknown profile rejects with
  `UNKNOWN_PROFILE`.
