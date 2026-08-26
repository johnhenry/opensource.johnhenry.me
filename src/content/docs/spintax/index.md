---
title: "spintax"
description: "Combinatorial string generation from {a|b} choice and {1,10} range templates — lazy iterators, back references, count-before-you-expand."
---

**`@johnhenry/spintax`** expands template strings with `{...}` patterns into
every possible combination — `{red|green|blue}` choices, `{1,10,2}` numeric
ranges, and `{$0}` back references — as a lazy iterator, so a million-variant
template costs nothing until you actually walk it. One 672-line ES module,
zero dependencies.

> Previously published as `spintax` (last unscoped release 1.1.2, now
> deprecated). Renamed to `@johnhenry/spintax` and restarted at 0.0.0 on
> import into the @johnhenry family — a new address and era, not a maturity
> signal.

## Install

```sh
npm install @johnhenry/spintax
```

## Quick start

```javascript
import parse, { count, choose } from "@johnhenry/spintax";

// parse returns a lazy iterable — nothing is generated until you iterate
for (const s of parse("Hello, {world|friend|universe}!")) {
  console.log(s);
}
// Hello, world!
// Hello, friend!
// Hello, universe!

// Ranges, steps, and multiple patterns multiply together
[...parse("{Product|Service} #{1,3}")];
// ["Product #1", "Product #2", "Product #3",
//  "Service #1", "Service #2", "Service #3"]

// How many would that be? (cheap — never expands the cross product)
count("/api/v{1,3}/{users|items}/{1,100}"); // 600

// Pick one combination without generating the rest
const pick = choose("Hello {world|nurse}!");
pick(0); // "Hello world!"
pick();  // random: "Hello world!" or "Hello nurse!"
```

## Braces are structural everywhere — there is no escape syntax

Every `{...}` in the template is consumed as a pattern, and the scan is flat:
a pattern runs from a `{` to the *first* `}`. There is no backslash escape,
so JSON-shaped templates get silently mangled:

```javascript
[...parse('{"mode": "{strict|lenient}"}')][0];
// '"mode": "{strict'  ← outer brace consumed, inner pattern never seen
```

The fix is to swap the delimiters, not to escape them:

```javascript
parse('{"mode": "<strict|lenient>"}', { patternStart: "<", patternEnd: ">" });
// {"mode": "strict"} / {"mode": "lenient"}
```

(The lone exception: `{}` with nothing inside is left alone — patterns need
at least one character.)

## Count before you iterate — patterns multiply

Each pattern multiplies the total: ten four-option choices is 4¹⁰ =
1,048,576 strings. `count()` computes that product from the pattern sizes
alone — it never expands the cross product — so it's the safe pre-flight
check before a `[...parse(t)]` that would materialize everything:

```javascript
count("{a|b|c|d} ".repeat(10)); // 1048576 — returns instantly
```

If you must walk a huge space, keep it lazy (`for…of` the iterable) or grab
representatives with `choose()` instead of spreading into an array.

## Iteration order is guaranteed: rightmost varies fastest

Combinations come out in odometer order — the last pattern cycles through
all its values before the one to its left advances:

```javascript
[...parse("{A|B} - {1,3}")];
// "A - 1", "A - 2", "A - 3", "B - 1", "B - 2", "B - 3"
```

This is a documented guarantee (the test suite pins it), so you can rely on
`choose(t)(i, j, …)` indices and slice positions being stable.

## Whitespace: ranges ignore it, choices keep it

`{ 1, 5 }` equals `{1,5}` — range patterns strip all whitespace. But in
choices, whitespace is part of the option: `{A |B}` yields `"A "` with a
trailing space. Padding a choice list for readability changes its output.
The full rules are on the [syntax page](/spintax/syntax/).

## The pages here

- [Pattern syntax](/spintax/syntax/) — the complete grammar: how a pattern
  is classified, ranges (steps, decimals, the always-included end value),
  choices, back references, custom delimiters, and the edge cases the test
  suite pins down

## Status

Stable, small, and fully tested — 34 tests across six suites cover parsing,
ranges, back references, `count`, `choose`, and the README's own examples.
The API is five functions (`parse` — also the default export — `compile`,
`range`, `count`, `choose`) and has been unchanged since the 1.x line of the
unscoped package.

Source: [github.com/johnhenry/spintax](https://github.com/johnhenry/spintax)
