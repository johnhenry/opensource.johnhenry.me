---
title: "Operator reference"
description: "Every jth operator, grouped by category — arithmetic, stack, comparison, control flow, arrays, objects, combinators, async, and the dynamic patterns."
---

The complete operator vocabulary of `@johnhenry/jth-stdlib` (~110 operators),
as registered by the compiler's default preamble. Three reading notes first:

- **Arguments pop in push order.** `10 3 -` is `10 - 3`. Examples below show
  the stack as you'd write it.
- **Variadic operators consume the entire stack** — they are flagged in their
  descriptions. Don't leave stray values behind when you use one.
- Names with a `/` are aliases: both spellings resolve to the same operator.

## Arithmetic

| Operator | Description | Example |
|----------|-------------|---------|
| `+` / `plus` | Addition | `2 3 +` => `5` |
| `-` / `minus` | Subtraction | `10 3 -` => `7` |
| `*` / `mul` | Multiplication | `4 5 *` => `20` |
| `/` / `div` | Division | `15 4 /` => `3.75` |
| `%` / `mod` | Modulo | `17 5 %` => `2` |
| `%%` | Remainder | `-17 5 %%` => `-2` |
| `**` / `pow` | Exponentiation | `2 8 **` => `256` |
| `++` | Increment | `5 ++` => `6` |
| `--` | Decrement | `5 --` => `4` |
| `abs` | Absolute value | `-5 abs` => `5` |
| `sqrt` / `√` | Square root | `16 sqrt` => `4` |
| `floor` | Floor | `3.7 floor` => `3` |
| `ceil` | Ceiling | `3.2 ceil` => `4` |
| `round` | Round | `3.5 round` => `4` |
| `trunc` | Truncate | `3.9 trunc` => `3` |
| `log` | Natural logarithm | `1 log` => `0` |
| `⋅` | Multiply (unicode) | `4 5 ⋅` => `20` |
| `÷` | Divide (unicode) | `15 3 ÷` => `5` |

## Variadic math

All of these consume the whole stack.

| Operator | Description | Example |
|----------|-------------|---------|
| `Σ` | Sum of all stack values | `1 2 3 Σ` => `6` |
| `Π` | Product of all stack values | `2 3 4 Π` => `24` |
| `min` | Minimum of all stack values | `3 7 1 min` => `1` |
| `max` | Maximum of all stack values | `3 7 1 max` => `7` |

## Stack manipulation

| Operator | Description | Example |
|----------|-------------|---------|
| `noop` / `∅` | Do nothing | `5 noop` => stack unchanged |
| `clear` | Clear the stack | `1 2 3 clear` => `[]` |
| `...` | Spread (array to stack) | `[1 2 3] ...` => `1 2 3` on stack |
| `drop` | Remove top | `1 2 drop` => `[1]` |
| `dupe` / `dup` | Duplicate top | `5 dupe` => `[5, 5]` |
| `copy` | Duplicate entire stack | `1 2 copy` => `[1, 2, 1, 2]` |
| `swap` | Swap top two | `1 2 swap` => `[2, 1]` |
| `over` | Copy second to top | `1 2 over` => `[1, 2, 1]` |
| `rot` | Rotate third to top | `1 2 3 rot` => `[2, 3, 1]` |
| `reverse` | Reverse stack | `1 2 3 reverse` => `[3, 2, 1]` |
| `count` / `depth` | Push stack depth | `1 2 count` => `[1, 2, 2]` |
| `collect` | All items to array (variadic) | `1 2 3 collect` => `[[1, 2, 3]]` |
| `peek` | Log top (without removing) | `42 peek` => logs `42` |
| `peek-all` | Log entire stack | `1 2 peek-all` => logs `1 2` |

## Comparison

| Operator | Description | Example |
|----------|-------------|---------|
| `=` / `eq?` | Strict equal | `3 3 =` => `true` |
| `==` | Loose equal | `3 "3" ==` => `true` |
| `!=` / `ne?` | Not equal | `3 4 !=` => `true` |
| `<` / `lt?` | Less than | `2 5 <` => `true` |
| `<=` / `le?` | Less than or equal | `3 3 <=` => `true` |
| `>` / `gt?` | Greater than | `5 2 >` => `true` |
| `>=` / `ge?` | Greater than or equal | `3 3 >=` => `true` |
| `<=>` | Spaceship (three-way) | `3 5 <=>` => `1` |

Note the reversal from JavaScript: single `=` is *strict* equality; `==` is
loose.

## Logic

| Operator | Description | Example |
|----------|-------------|---------|
| `&&` | Logical AND | `true false &&` => `false` |
| `\|\|` | Logical OR | `true false \|\|` => `true` |
| `xor` | Exclusive OR | `true false xor` => `true` |
| `nand` | NOT AND | `true true nand` => `false` |
| `nor` | NOT OR | `false false nor` => `true` |
| `~~` / `not` | Logical NOT | `true ~~` => `false` |

## Control flow

| Operator | Description | Example |
|----------|-------------|---------|
| `if` | Conditional branch (3-arg) | `#[ "no" ] #[ "yes" ] true if` => `"yes"` |
| `if` | Start conditional chain (2-arg) | `#[ "yes" ] true if` |
| `elseif` | Chain conditional | `#[ "alt" ] cond elseif` |
| `else` | Default branch | `#[ "default" ] else` |
| `when` | Keep if truthy | `42 true when` => `42` |
| `drop-when` | Drop if truthy | `42 true drop-when` => `[]` |
| `keep-if` | Keep value if truthy | `42 true keep-if` => `42` |
| `drop-if` | Drop value if truthy | `42 true drop-if` => `[]` |
| `times` | Repeat block N times | `#[ "hi" peek ] 3 times` |
| `while` | Loop while condition truthy | `#[ cond ] #[ body ] while` |
| `until` | Loop until condition truthy | `#[ cond ] #[ body ] until` |
| `break` | Exit current loop | `break` |

In the 3-argument `if`, remember the source order: false-block, true-block,
condition. See the [tutorial](/jth/tutorial/#control-flow).

## Error handling

| Operator | Description | Example |
|----------|-------------|---------|
| `try` | Catch errors from block | `#[ "fail" throw ] try` => `Error` on stack |
| `throw` | Throw an error | `"oops" throw` |
| `error?` | Check if top is Error | `err error?` => `true` |

## Strings

| Operator | Description | Example |
|----------|-------------|---------|
| `len` | Length | `"hello" len` => `5` |
| `upper` | Uppercase | `"hi" upper` => `"HI"` |
| `lower` | Lowercase | `"HI" lower` => `"hi"` |
| `trim` | Trim whitespace | `" hi " trim` => `"hi"` |
| `strcat` | Concatenate | `"ab" "cd" strcat` => `"abcd"` |
| `strseq` | Reverse concat | `"ab" "cd" strseq` => `"cdab"` |
| `startsWith` / `starts?` | Starts with prefix? | `"hello" "hel" starts?` => `true` |
| `endsWith` / `ends?` | Ends with suffix? | `"hello" "llo" ends?` => `true` |
| `indexOf` / `index-of` | Index of substring | `"hello" "ell" indexOf` => `1` |

## Type checking

| Operator | Description | Example |
|----------|-------------|---------|
| `typeof` | Push type string | `42 typeof` => `"number"` |
| `number?` | Is number? | `42 number?` => `true` |
| `string?` | Is string? | `"hi" string?` => `true` |
| `array?` | Is array? | `[1] array?` => `true` |
| `nil?` | Is null/undefined? | `null nil?` => `true` |
| `function?` | Is function? | `#[ ] function?` => `true` |
| `empty?` | Is empty? | `"" empty?` => `true` |
| `contains?` | Contains element? | `[1 2 3] 2 contains?` => `true` |

## Arrays

| Operator | Description | Example |
|----------|-------------|---------|
| `push` | Append to array | `[1 2] 3 push` => `[1,2,3]` |
| `pop` | Remove last (pushes array, then item) | `[1 2 3] pop` => `[1,2]` and `3` |
| `shift` | Remove first (pushes array, then item) | `[1 2 3] shift` => `[2,3]` and `1` |
| `unshift` | Prepend to array | `[2 3] 1 unshift` => `[1,2,3]` |
| `suppose` | Add to collection | `[1 2] 3 suppose` => `[1,2,3]` |
| `flatten` | Flatten all stack values (variadic) | `[1] [2 3] flatten` => `1 2 3` on stack |
| `map` | Apply block to each element | `[1 2 3] #[ 2 * ] map` => `[2,4,6]` |
| `filter` | Keep elements where block is truthy | `[1 2 3 4] #[ 2 % 0 = ] filter` => `[2,4]` |
| `reduce` | Accumulate with block and init | `[1 2 3] 0 #[ + ] reduce` => `6` |
| `fold` | Alias for reduce (catamorphism) | `[1 2 3] 0 #[ + ] fold` => `6` |
| `bend` | Unfold/anamorphism from seed | `1 #[ 5 <= ] #[ dupe 1 + ] bend` => `[1,2,3,4,5]` |

## Objects / dictionaries

| Operator | Description | Example |
|----------|-------------|---------|
| `keys` | Get keys | `{ "a" 1 } keys` => `["a"]` |
| `values` | Get values | `{ "a" 1 } values` => `[1]` |
| `entries` | Get entries | `{ "a" 1 } entries` => `[["a",1]]` |
| `merge` | Merge objects | `obj1 obj2 merge` |
| `record` | Build object from stack pairs (variadic) | `1 "a" record` => `{a: 1}` |

## Serialization

| Operator | Description | Example |
|----------|-------------|---------|
| `into-json` | Stringify to JSON | `{ "a" 1 } into-json` => `'{"a":1}'` |
| `from-json` | Parse JSON string | `'{"a":1}' from-json` => `{a: 1}` |
| `to-json` | Parse JSON (legacy alias for `from-json`) | `'{"a":1}' to-json` => `{a: 1}` |
| `into-lines` | Join by newline | `["a" "b"] into-lines` => `"a\nb"` |
| `from-lines` | Split by newline | `"a\nb" from-lines` => `["a","b"]` |
| `to-lines` | Split by newline (legacy alias for `from-lines`) | `"a\nb" to-lines` => `["a","b"]` |

Watch the legacy aliases: `to-json` *parses* (it does not stringify). Prefer
the unambiguous `into-`/`from-` pairs in new code.

## Async

| Operator | Description | Example |
|----------|-------------|---------|
| `_` | Await a promise | `promise _` |
| `__` | Promise.all (variadic, consumes stack) | `p1 p2 __` |

## Meta / execution

| Operator | Description | Example |
|----------|-------------|---------|
| `apply` / `exec` | Execute block | `#[ 2 3 + ] apply` => `5` |
| `$` | Execute block (legacy) | `#[ 2 3 + ] $` => `5` |
| `$$` | Execute and spread | `#[ 2 3 + ] $$` |
| `<<-` | Rewind all | Moves pointer to start |
| `->>` | Skip all | Moves pointer to end |

## Combinators

| Operator | Description | Example |
|----------|-------------|---------|
| `each` | Apply block to each stack item | `1 2 3 #[ 2 * ] each` |
| `fanout` | Run value through multiple blocks | `5 #[ 2 * ] #[ 1 + ] fanout` => `10, 6` |
| `zip` | Pair elements from two arrays | `[1 2] ["a" "b"] zip` => `[[1,"a"],[2,"b"]]` |
| `compose` | Combine blocks into pipeline | `#[ 2 * ] #[ 1 + ] compose` |

## Iterators

| Operator | Description | Example |
|----------|-------------|---------|
| `iter` | Create iterator | `[1 2 3] iter` |
| `next` | Get next value | `iterator next` |
| `..` | Exhaust to array | `iterator ..` |

## Sequences

| Operator | Description | Example |
|----------|-------------|---------|
| `fibonacci` | Fibonacci step: pops `(a, b)`, pushes `(b, a, a+b)` | `0 1 fibonacci` => `1 0 1` |

## Statistics

All statistics operators are variadic — they consume the entire stack.

| Operator | Description | Example |
|----------|-------------|---------|
| `mean` / `x̄` | Arithmetic mean | `1 2 3 mean` => `2` |
| `median` | Median value | `1 2 3 median` => `2` |
| `mode` | Most frequent | `1 1 2 mode` => `1` |
| `modes` | All modes | `1 1 2 2 modes` => `[1, 2]` |

## Hyperoperations

| Operator | Description | Example |
|----------|-------------|---------|
| `***` | Tetration | `2 3 ***` |
| `****` | Pentation | `2 3 ****` |

## Dynamic operator patterns

Prefix any number to an arithmetic operator to make a one-argument version.
Semantics: `N op x` — the prefix number is the **left** operand:

| Pattern | Description | Example |
|---------|-------------|---------|
| `N+` | N + x | `10 3+` => `13` |
| `N-` | N - x | `20 3-` => `-17` (3 - 20) |
| `N*` | N * x | `7 2*` => `14` |
| `N/` | N / x | `50 100/` => `2` (100 / 50) |
| `N%` | N % x | `17 5%` => `5` |
| `N**` | N ** x | `3 2**` => `8` (2 ** 3) |
| `Nlog` | Log base N of x | `100 10log` => `2` |

Dynamic patterns are resolved through the runtime registry's pattern
mechanism, which is also why [jth-eval's restricted sandbox](/jth/embedding/#sandboxing)
denies them: an open-ended name family can't be enumerated into an allowlist.
