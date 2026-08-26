---
title: "Tutorial"
description: "The jth language from zero: values, the stack, operators, blocks, definitions, control flow, errors, arrays, objects, modules, and interop."
---

Everything in jth follows one rule: **values go on the stack, operators pop
what they need and push what they produce.** There is no other evaluation
model to learn. This page walks the whole language in that order. Every
snippet runs as-is with `jth run -c '<code>'` or from a `.jth` file.

## Values and the stack

Every value you write is pushed onto the stack. Semicolons separate
statements; `peek` logs the top of the stack without removing it, `peek-all`
logs the entire stack.

```jth
42;              // stack: [42]
"hello";         // stack: [42, "hello"]
true peek;       // logs: true
1 2 3 peek-all;  // logs the whole stack
```

The value types:

| Type | Examples |
|---|---|
| Numbers | `1`, `3.14`, `0xFF`, `-5` |
| Strings | `"hello"`, `'world'`, `` `template` `` |
| Booleans | `true`, `false` |
| Null / undefined | `null`, `undefined` |
| Arrays | `[1 2 3]` — space-separated, no commas |
| Objects | `{ "key" "value" "n" 42 }` — alternating key, value |

Comments start with `//` or `#`. Note that `//` also acts as a statement
terminator, so `42 peek  // comment` is a complete statement.

## Arithmetic

Operators pop their arguments and push the result. Arguments are consumed in
push order — `10 3 -` is `10 - 3`:

```jth
2 3 + peek;    // 5
10 3 - peek;   // 7
15 4 / peek;   // 3.75
2 8 ** peek;   // 256
2 3 + 4 * peek;  // (2 + 3) * 4 = 20 — the stack carries values forward
```

That last line is the idiom that replaces parentheses: intermediate results
just sit on the stack until the next operator consumes them.

## Stack manipulation

You will constantly rearrange the stack. The core moves:

```jth
5 dupe;       // [5, 5]        duplicate the top (alias: dup)
3 7 swap;     // [7, 3]        swap the top two
1 2 3 drop;   // [1, 2]        discard the top
1 2 over;     // [1, 2, 1]     copy the second item to the top
1 2 3 rot;    // [2, 3, 1]     rotate the third item to the top
clear;        // []            empty the stack
```

Whole-stack operators: `reverse` reverses the stack, `copy` duplicates all of
it, `count` pushes the depth, and `collect` gathers everything into one array.

A housekeeping habit worth forming early: end demonstrations with `drop` (or
`clear`) so leftovers don't leak into the next computation. Several operators
later on this page consume the *entire* stack, and stray values change their
answers.

## Blocks and definitions

A block `#[ ... ]` is an anonymous function over the stack. It doesn't run
until something executes it. `:name` pops the top of the stack and registers
it as a named operator:

```jth
#[ dupe * ] :square;     // "square" now runs the block
5 square peek;           // 25

3.14159 :PI;             // non-block values become constants:
PI peek;                 // using PI pushes 3.14159
```

Definitions can call other definitions, so vocabulary composes:

```jth
#[ square square ] :fourth-power;
2 fourth-power peek;                    // 16

#[ square swap square + sqrt ] :hypotenuse;
3 4 hypotenuse peek;                    // 5
```

There is also `::name`, which pops a value into a JavaScript `const` for
interop with inline JS — it is *not* callable as a jth operator.

## Control flow

`if` pops three things: a condition, a true-block, and a false-block. Because
the condition is popped first, source order is **false-block, true-block,
condition**:

```jth
#[ "odd" ] #[ "even" ] 10 2 % 0 = if peek;   // "even"
```

Write the false branch first. Everyone gets this backwards once.

For multi-way branches, jth has flat `if`/`elseif`/`else` chains — `if` with
two arguments starts a chain, each `elseif` adds a condition, `else` is the
fallback, and only the first matching branch runs. FizzBuzz is the canonical
demo:

```jth
#[
  dupe 15 % 0 = #[ drop "FizzBuzz" ] swap if
  dupe 3 % 0 = #[ drop "Fizz" ] swap elseif
  dupe 5 % 0 = #[ drop "Buzz" ] swap elseif
  #[ ] else
] :fizzbuzz;
```

Loops and conditionals over values:

```jth
#[ "hi" peek ] 3 times;   // run a block N times
42 true when;             // keep 42 only if the condition is truthy
42 false when;            // stack: [] — value dropped
```

`while` and `until` take a condition block and a body block; `break` exits the
current loop. See the [operator reference](/jth/operators/#control-flow) for
the full set (`drop-when`, `keep-if`, `drop-if`).

## Error handling

`throw` pops a message and throws. `try` runs a block and, if it throws,
pushes the Error as a plain value instead of halting the program. `error?`
tests whether the top of the stack is an Error:

```jth
#[ "oops" throw ] try;
error? peek;              // true

#[ 2 3 + ] try;
dupe peek;                // 5 — successful blocks push results normally
error? peek;              // false
```

That turns failure into data: compute `error?`, then branch on it with `if`
like any other boolean.

## Arrays

```jth
[1 2 3] 4 push peek;      // [1, 2, 3, 4]
[2 3] 1 unshift peek;     // [1, 2, 3]
[1 2 3] ...;              // spread: stack is now 1, 2, 3
1 2 3 collect peek;       // gather: [1, 2, 3]
```

`pop` and `shift` push *two* values — the modified array and the removed item
(item on top). The higher-order trio works how you'd hope, with blocks as the
function argument:

```jth
[1 2 3 4 5] #[ 2 * ] map peek;           // [2, 4, 6, 8, 10]
[1 2 3 4 5 6] #[ 2 % 0 = ] filter peek;  // [2, 4, 6]
[1 2 3 4 5] 0 #[ + ] reduce peek;        // 15  (fold is an alias)
```

`bend` is the inverse of `fold` — an unfold that grows an array from a seed,
given a continue-predicate block and a step block that leaves
`value nextSeed` on the stack:

```jth
1 #[ 32 <= ] #[ dupe 2 * ] bend peek;    // [1, 2, 4, 8, 16, 32]
```

## Strings and objects

```jth
"hello" upper peek;              // "HELLO"
"hello" "world" strcat peek;     // "helloworld"
"  hi  " trim peek;              // "hi"

{ "a" 1 "b" 2 } keys peek;       // ["a", "b"]
{ "a" 1 "b" 2 } values peek;     // [1, 2]
```

Objects are written as `{ }` with alternating keys and values; `entries`,
`merge`, and `record` (build an object from stack pairs) round out the set.

## Variadic operators — they consume everything

A family of operators takes *the whole stack* as input: `Σ` (sum), `Π`
(product), `min`, `max`, and the statistics set `mean`, `median`, `mode`,
`modes`:

```jth
1 2 3 4 5 Σ peek;         // 15
2 4 4 4 5 5 7 9 mean peek;   // 5
```

This is a feature (no loop needed to sum a pile of numbers) and a trap: any
value you left on the stack participates. Start variadic computations from a
known-clean stack.

## Dynamic operators

Prefixing a number to an operator makes a one-argument version. The prefix
number is the **left** operand — semantics are `N op x`:

```jth
10 3+ peek;      // 13
100 10log peek;  // 2   (log base 10 of 100)
20 3- peek;      // -17 (3 - 20, not 20 - 3)
```

For commutative operators the distinction is invisible; for `-`, `/`, `%`,
`**`, and `log` it is the whole point. Dynamic operators shine in pipelines:
`3+ 2* peek` reads as "add 3, double, log".

## Modules

jth files export named operators and import them from other files:

```jth
// math.jth
#[ dupe * ] :square;
#[ dupe dupe * * ] :cube;
::export square cube;
```

```jth
// main.jth
::import "./math.jth" { square cube };
5 square peek;   // 25
```

The same directive loads operator *packages*: `::import "@johnhenry/jth-html";`
pulls in the HTML DSL's `h-*` operators (see [Embedding](/jth/embedding/)).

## Inline JavaScript and async

Double parentheses embed a raw JavaScript expression as a value. Combined with
`:name`, that's the escape hatch to the host platform:

```jth
((Math.random())) peek;
((x => x * 2)) :double;
5 double peek;            // 10
```

`_` awaits a promise on top of the stack; `__` runs `Promise.all` over the
entire stack (variadic):

```jth
((fetch("https://example.com"))) _ peek;
```

Note that inline JS is rejected outright in jth-eval's sandbox modes — see
[Embedding](/jth/embedding/#sandboxing) if you plan to run untrusted programs.

## Where next

- [Operators](/jth/operators/) — every operator, with examples
- [Examples](/jth/examples/) — eleven runnable programs, from hello to an HTML page builder
- [CLI](/jth/cli/) — compiling programs into self-contained JavaScript
