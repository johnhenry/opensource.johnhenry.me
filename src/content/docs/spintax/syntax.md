---
title: "Pattern syntax"
description: "The complete spintax grammar — pattern classification, ranges, choices, back references, custom delimiters — with the edge cases the test suite pins down."
---

A template is plain text plus `{...}` patterns. The parser scans flat and
left-to-right: each pattern runs from a `{` to the **first** `}` — patterns
never nest. Each pattern body is then classified, in this order:

| Precedence | Body looks like | Classified as | Example |
| --- | --- | --- | --- |
| 1 | Exactly `$n` (marker + digits, nothing else — not even whitespace) | Back reference | `{$0}` |
| 2 | 2–3 comma-separated numbers (whitespace ignored) | Range | `{1,10,2}` |
| 3 | Anything else, split on `\|` | Choices | `{red\|green\|blue}` |

Classification consequences worth knowing:

- `{a,b|c}` contains a pipe, so the comma never makes it a range — it's the
  two choices `"a,b"` and `"c"`. Choices win over ranges.
- `{5}` has no comma, so it isn't a one-value range — it's a single-option
  choice that yields `"5"` (the braces vanish).
- `{}` matches nothing (patterns need at least one character) and passes
  through literally.

All the behavior below is pinned by the repo's test suite; the delimiters
and separators themselves are configurable (see
[custom delimiters](#custom-delimiters-the-only-escape-hatch)).

## Ranges

`{start,end}` or `{start,end,step}` — two or three numbers separated by
commas. Both endpoints are inclusive; the default step is 1.

```javascript
[...parse("Value: {1,5}")];
// "Value: 1" … "Value: 5"

[...parse("Value: {0,10,2}")];
// "Value: 0", "Value: 2", "Value: 4", "Value: 6", "Value: 8", "Value: 10"
```

| Pattern | Yields | Why |
| --- | --- | --- |
| `{1,5}` | 1 2 3 4 5 | step defaults to 1 |
| `{0,10,2}` | 0 2 4 6 8 10 | end lands on the step |
| `{7,30,7}` | 7 14 21 28 **30** | end is always included, even off-step |
| `{-2,2}` | -2 -1 0 1 2 | negative numbers are fine |
| `{0.5,1.5,0.5}` | 0.5 1 1.5 | decimals are fine |
| `{ 1, 3 }` | 1 2 3 | whitespace ignored in ranges |
| `{1,3, }` | 1 2 3 | trailing commas ignored |
| `{5,1}` | *(nothing)* | descending ranges are empty — see below |

### The end value is always included

Ranges behave like `range(start, end, step, includeEnd = true)`: if the
step would overshoot the end, the end is appended anyway. `{7,30,7}` yields
`…28, 30`, not `…28`. If you want a strict step grid, pick an end that lands
on it — or call `range(start, end, step, false)` directly through `compile`.

### A descending range silently zeroes the whole template

Ranges only count up. `{5,1}` yields no values, and because every pattern
multiplies into the cross product, one empty pattern makes the *entire*
template produce zero combinations — no error, just nothing:

```javascript
[...parse("n {5,1}")]; // []
count("n {5,1}");      // 0
```

There is no reverse syntax; write `{1,5}` and reverse the collected array
if you need descending order. (A negative step is also not supported —
don't reach for `{5,1,-1}`.)

### Decimal steps inherit floating-point drift

Steps accumulate by repeated addition, so binary-unrepresentable steps show
artifacts in the output strings:

```javascript
[...parse("{0,1,0.3}")];
// "0", "0.3", "0.6", "0.8999999999999999", "1"
```

The end value (1) is still appended exactly, but intermediate values are
whatever IEEE 754 says they are. For clean decimal output, use an integer
range and divide in your own code, or pass pre-formatted choices.

## Choices

Options separated by `|`. Every option is taken *verbatim* — including
whitespace and any characters that aren't the delimiters themselves.

```javascript
[...parse("Color: {red|green|blue}")];
// "Color: red", "Color: green", "Color: blue"
```

| Pattern | Options | Note |
| --- | --- | --- |
| `{red\|green\|blue}` | `red`, `green`, `blue` | |
| `{A \|B}` | `A `, `B` | whitespace is **part of the option** |
| `{single}` | `single` | one option; braces disappear |
| `{a\|}` | `a`, `` (empty) | empty options are allowed |
| `{a,b\|c}` | `a,b`, `c` | commas are literal inside choices |

The whitespace rule is the sharp edge: ranges strip all whitespace, choices
preserve all of it. `{option1 |option2}` yields `"option1 "` with a trailing
space — don't pad choice lists for readability.

## Multiple patterns and iteration order

Every pattern multiplies into a cartesian product, generated in odometer
order — the **rightmost pattern varies fastest**:

```javascript
[...parse("{small|large} {box|circle}")];
// "small box", "small circle", "large box", "large circle"
```

`{small|large} {box|circle} in {red|blue}` is 2 × 2 × 2 = 8 strings;
`/api/v{1,3}/{users|items}/{1,100,10}` is 3 × 2 × 11 = 66. Use `count()`
to get that product without expanding anything.

## Back references

`{$n}` repeats the value chosen by the *n*-th real pattern (0-based,
counting only non-back-reference patterns, left to right). Back references
do **not** multiply the combination count — they echo choices already made:

```javascript
[...parse("The {blue|straw|rasp}berries taste like {$0}berries")];
// "The blueberries taste like blueberries"
// "The strawberries taste like strawberries"
// "The raspberries taste like raspberries"

[...parse("Number {1,3} doubled is {$0} * 2")];
// works with ranges too: "Number 1 doubled is 1 * 2", …

count("The {a|b}berries taste like {$0}berries"); // 2, not 4
```

With several patterns, indices skip the back references themselves:

```javascript
[...parse("The {red|blue|green} {box|circle} is a {$0} {$1}.")];
// 6 results — "The red box is a red box.", …
```

Rules and edge cases:

| Case | Behavior |
| --- | --- |
| `{$0}` after a pattern | replaced with that pattern's current value |
| `{$2}` with only 2 patterns | invalid — left literally as `{$2}` in output |
| `{$0}` *before* any pattern | back references only look **backwards** — left as `{$0}` |
| `${10\|20}` | `$` outside braces is plain text: `"$10"`, `"$20"` |
| `{$0}` with marker option `@` | `backReferenceMarker: "@"` makes it `{@0}` |

A pattern is only a back reference if its body is *exactly* the marker plus
digits — `{$0 extra}` would be an ordinary single-option choice.

Back references also work with [`choose`](#choose-indices-follow-the-same-numbering):
the picker resolves them after the real choices are made.

## Custom delimiters (the only escape hatch)

There is **no escape character**. If your text needs a literal `{`, `}`,
`|`, or a comma inside a range-looking body, change the delimiters instead
— every marker is an option on `parse`, `count`, and `choose`:

| Option | Default | Controls |
| --- | --- | --- |
| `patternStart` | `{` | opening delimiter |
| `patternEnd` | `}` | closing delimiter |
| `separatorRange` | `,` | range separator |
| `separatorChoices` | `\|` | choices separator |
| `backReferenceMarker` | `$` | back-reference sigil |

The canonical use case is JSON-shaped templates, which the default braces
mangle:

```javascript
// Broken — the outer { is eaten as a pattern delimiter:
[...parse('{"mode": "{strict|lenient}"}')][0];
// '"mode": "{strict'

// Fixed — move the pattern syntax onto <>:
[...parse('{"size": "<small|medium|large>", "count": <1,3>}', {
  patternStart: "<",
  patternEnd: ">",
})][0];
// '{"size": "small", "count": 1}'
```

## `choose` indices follow the same numbering

`choose(template)` returns a picker. Its positional arguments are 0-based
option indices for each real (non-back-reference) pattern in left-to-right
order; omit one (or all) for a random pick in that slot:

```javascript
const gen = choose("Count: {1,5} {A|B|C}");
gen(0, 0); // "Count: 1 A"
gen(1, 2); // "Count: 2 C"
gen();     // random combination
```

Indices are not validated: `choose("Hi {a|b}")(5)` returns `"Hi undefined"`.
Keep them below the pattern's option count (`count` on the single pattern
tells you the bound).

## Whitespace semantics, summarized

| Context | Whitespace |
| --- | --- |
| Plain text between patterns | preserved exactly |
| Inside a range body `{ 1, 5 }` | ignored entirely |
| Inside a choices body `{A \|B}` | preserved as part of each option |
| Around a back reference `{ $0 }` | **breaks it** — the body must be exactly `$n`, so `{ $0 }` is a single-option choice yielding `" $0 "` |
