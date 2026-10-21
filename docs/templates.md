# ESP templates

td;dr can write an email as an ESP template: fields and blocks are left for the sending platform's
engine to fill at send time, written in that engine's syntax. Two dialects exist, `handlebars` and
`liquid`. The compiler never calls a template engine.

## Authoring

### Native component code

In a React or Vue module with `export const template = ["handlebars", "liquid"]`, write the
component as usual. In a template render its props are symbolic values that know their path:

| You write | Template gets |
|---|---|
| `{order.total}`, `` `Hi ${user.name}` ``, `href={order.url}` | a field |
| `items.map((item) => …)`, `v-for` | a loop |
| `cond && <A/>`, `cond ? <A/> : <B/>`, `v-if` / `v-else-if` / `v-else` | if / else-if / else |
| `!`, `===`, `!==`, `==`, `!=`, `&&`, `\|\|`, parentheses | the condition, lowered for the dialect |
| `if (…) return …` guard clauses, if / else-if chains | one branch value, as `?:` would |
| `switch` on a field with returning cases (grouped cases, `default`) | an else-if chain |
| `let v; if (c) v = A; else v = B;` | `v` is a branch value |

The `tddr()` Vite plugin rewrites those operators and statements in email modules, never in
dependencies. The rewrite is syntactic: no sample runs, every arm is rendered once, the template is
the same on every build, and on plain data the rewritten code behaves exactly like the original, so
the same module renders real data as HTML.

What a dialect can't do with a field is a `TemplateError` at the component line, with a hint:
arithmetic, formatting, string methods, sorting, `typeof`, iterating a branch value, a loop whose
test is a field, `break` / `continue` out of a branch, a field-dependent `return` inside a loop or
`try`, a branch with side effects (`push`, `+=`, mutating an outer object). Send ready values in the
data (formatted money and dates, booleans) and branch in the markup. Functions called in an arm
must be pure; the rewrite can't see into them, and the [equivalence check](#the-equivalence-check)
catches a difference when the email has data sets.

`tddr/react` and `tddr/vue` also export `If` / `ElseIf` / `Else` (prop `when`) and `Each` (prop
`of`; children as a function, or a scoped slot in Vue) as an escape hatch.

### Hints in plain HTML

For HTML passed to `compile(html, { template })`:

```html
<div data-email-if="order.status == 'paid'">Paid in full.</div>
<div data-email-else-if="order.shipped">On its way.</div>
<div data-email-else>Being prepared.</div>

<div data-email-each="order.items" data-email-as="line">
  <p>{{line.name}}</p>   <!-- write fields with field("line.name") -->
</div>
```

- `data-email-each` + `data-email-as` (default `item`), `-if`, `-unless`, `-else-if`, `-else`
  (valueless, on the element right after its if / else-if, only whitespace between). With several
  hints on one element, `if` / `unless` open first and `each` last.
- `<tddr-if test>`, `<tddr-else-if test>`, `<tddr-else>`, `<tddr-each of as>` stand for their
  children.
- `field("order.total")` returns a placeholder string that becomes a field in text or an attribute.
- `preview(html, props)` evaluates the hints against sample data, without an engine.
  `writeString(text, dialect)` writes a subject or preheader string: fields only, no blocks.

## Where constructs may sit

| Placement | Result |
|---|---|
| A block that is a row of a stack, a whole flex row or grid, a child of a flex column | markers between rows |
| A text-level element in a line | markers around the element |
| An item of a flex row, a grid cell | **E012** (column widths would depend on data); lowered unconditionally. Wrap the row, or put the construct inside the cell. |
| Invalid path or alias (`a[0]`, `my line`), `-as` without `-each` | **E012**; that part is left out |
| An else not right after its if, an else with a value, `-if` and `-else-if` on one element | **E012**; shown as plain content |
| A hint on or inside a preheader | **E012**: the preheader is one string |
| `-if` reading the same element's `each` variable | **E012**: put it on a child |
| A placeholder in CSS other than a [whole colour](#colours-from-data) | **E013** |
| A placeholder in a `class`, on any element | **E013**: the stylesheet is inlined at build, so no rule follows a class filled in later |
| A placeholder in an attribute lowering drops | **E013** for a presentational one, else **E012** |
| Block syntax typed by hand (`{{#`, `{{/`, `{{else`, `{%`) | **E012**, written as text |
| Fields or markers in a compile without `template` | **E014** |

Where a construct is a row, the whole `<tr>…</tr>` of one repetition or branch sits between the
markers; `each` emits its child once and the ESP repeats it. A text-level element gets the markers
around it (whitespace between chain members is dropped, so put spaces inside the branches). Around
Outlook-only content the construct stays outside the conditional, so the ESP resolves it before
Outlook reads the comment.

Margins are collapsed for the block as written, so a construct that renders nothing (an empty `each`, a
false `if`) doesn't let the margins around it collapse through the gap. Keep that spacing in padding.

```html
<tr><td>Always there.</td></tr>
{{#if paid}}<tr><td style="padding:16px 24px;background-color:#dcfce7;">Paid in full.</td></tr>{{/if}}
{{#each order.items as |line|}}<tr><td>{{line.name}} {{@root.order.currency}}</td></tr>{{/each}}
<p style="margin:0">Your order is {{#if paid}}<b>paid</b>{{else}}<b>not paid yet</b>{{/if}}.</p>
```

## Dialects

Each dialect is a table of writers (`src/template/dialects.ts`):

| | Handlebars | Liquid |
|---|---|---|
| Field | `{{a.b}}` (the engine escapes) | `{{ a.b \| escape }}` |
| Loop | `{{#each items as \|line\|}}` … `{{/each}}`; outer paths inside are `@root.path` | `{% for line in items %}` … `{% endfor %}` |
| Chain | `{{#if a}}…{{else if b}}…{{else}}…{{/if}}`; `{{else if}}` only for plain paths, else nested | `{% if a %}…{% elsif b %}…{% else %}…{% endif %}` |
| Author text that looks like template syntax | `\{{` | `{{ "{" }}` |
| A lone `{` before or `}` after a field | `&#123;` / `&#125;`; `writeString` throws | `{{ "{" }}` / `}` |

Conditions, written for `if` (an `unless` or `!` negates them):

| Condition | Handlebars | Liquid |
|---|---|---|
| `a` / `!a` | `{{#if a}}` / `{{#unless a}}` | `{% if a and a != 0 and a != "" %}` / `unless` |
| `a == null` / `!= null` | `{{#unless a}}` / `{{#if a}}` | `{% if a == nil %}` / `!= nil` |
| `a.length != 0` / `== 0` | `{{#if a}}` / `{{#unless a}}` | `{% if a.size > 0 %}` / `== 0` |
| `a == 'x'`, `n == 1`, `a == b` | `{{#equals a "x"}}`, `{{#equals n 1}}`, `{{#equals a b}}` | `{% if a == "x" %}`, … |
| `a == true` / `false` | `{{#if a}}` / `{{#unless a}}` | `{% if a == true %}` / `== false` |
| `a == 'x' && b` | `{{#equals a "x"}}{{#if b}}A{{/if}}{{/equals}}` | `{% if a == "x" and b and … %}` |
| `a \|\| b` | `{{#if a}}A{{else}}{{#if b}}A{{/if}}{{/if}}` | a `tddr-N` flag assigned per operand, then `{% if tddr-N %}` |

- **Handlebars** has no operators: `&&` nests, `||` repeats the branch body in the first operand's
  `{{else}}` (a long `||` grows the output), a negated comparison flips `equals` / `notEquals`. The
  output needs `equals` and `notEquals` block helpers; with plain Handlebars the sender registers
  them.
- **Liquid** has `and` / `or` but no parentheses or `not`, grouped right to left. The condition is
  put in negation normal form and written inline when at most one operand is itself a chain (it goes
  last); anything else is computed into a `tddr-N` flag first (a hyphen is in no data path).
- Comparisons put the field on the left; numbers are unquoted.

Not implemented: logic-less or `{% elif %}`-style dialects, other comparison helpers, and
per-platform subject / preheader / text-part outputs. A new dialect is a new writer table plus
real-engine tests.

## Condition semantics

A condition means what the same test means in JavaScript on the JSON data (a missing field reads as
`undefined`): that is what the HTML render runs. Each dialect writes it exactly, or exactly under a
stated data need; nothing is replaced by something close. `src/template/semantics.ts` is the
contract; `parseCond` reads the one spelling used in markers and hints.

| Spelling | Meaning in JS | Recorded from a component |
|---|---|---|
| `p` / `!p` | `!!p` / `!p` | `p`, `!p`, `p && …`, `p \|\| …`, `p ? … : …` |
| `p == null` / `p != null` | null or missing | `p == null`, `p == undefined`; `p ?? q` |
| `p.length != 0` / `== 0` | (not) empty list or string | `p.length > 0`, `>= 1`, `!== 0`, `=== 0`, `< 1`, bare `p.length` |
| `p == 'x'`, `p == 1`, `p == true`, `p == q`, and `!=` | `===` / `!==` | `===` / `!==` with a string, number, boolean or field |
| `!c`, `c && c`, `c \|\| c`, `( )` | as JS | as JS |

**Refused**, with a hint: `=== null` / `=== undefined` (ESP data can't tell null from missing; write
`== null`); loose `==` with a value in component code (write `===`); `length` compared with anything
but 0; `<` / `>` on fields; a literal on the left; `switch (true)`; template keywords and helper
names as the first name of a path (`and`, `or`, `forloop`, `nil`, `if`, `each`, `lookup`, `equals`,
…); literal words (`true`, `null`, `this`) or `Object.prototype` members as any name; string
literals with quotes, backslashes, `<` `>`, `--`, `{{`, `{%` or control characters; numbers that
aren't plain digits up to 2^53.

**Data needs** (verified against handlebars 4.7 and liquidjs 10):

| Condition | Handlebars needs | Liquid needs |
|---|---|---|
| `p` | not `[]` | – |
| `p == null` | null, missing, or not `false` `0` `""` `[]` | – |
| `p.length != 0` | a list or string | same |
| a loop over `p` | a list, null or missing | same |
| `p == 'x'` (non-empty) / `p == 1` | string / number, null or missing | – |
| `p == ''` | string | – |
| `p == true` / `false` | boolean, null or missing / boolean | – |
| `p == q` | two strings or two numbers | not two lists |
| a path through `size`, `first`, `last` | – | the object has its own field of that name |

`!=` has the needs of `==`. Senders who register their own `equals` / `notEquals` need only this:
for two strings or two numbers, equality as `===`; a null or missing value equals no non-empty
string and no number. Strict helpers and helpers that compare as text both qualify.

React shows `0` for `x && <A/>` with `x = 0`, which a template can't, so such data is refused
(write `x ? <A/> : null`); Vue prints the falsy value, and so does the template.
`preview(html, props, { dialects })` throws a `TemplateDataError` for data that doesn't meet a
need; the equivalence check reports it as E016. Printing a field is not covered by any check: a
boolean prints `true` / `false` in a template where React prints nothing.

## Colours from data

A placeholder may be the **whole value** of `color`, `background-color`, `background`,
`border-color`, `border-*-color`, or the colour of a `border` shorthand, in a `style` attribute. It
is opaque (never lowered or mixed) and goes whole into every attribute that carries the colour:

```html
<td bgcolor="{{brand.bg}}" style="padding:24px;background-color:{{brand.bg}};">
<v:roundrect … fillcolor="{{brand.button}}" strokecolor="{{brand.line}}">
```

`bgcolor` and VML need `#rrggbb` or a colour name in the data; `rgba()` works in CSS clients only.
Anywhere else in CSS a placeholder
is E013, and so is one in a `class`: td;dr inlines the stylesheet when it builds, so a class the
ESP fills in matches no rule. Write one copy of the element per look, each with fixed styles under
its own condition (`v-if` / `v-else`, `cond ? <A/> : <B/>`, `data-email-if` / `-unless`).

## Spacing around blocks

Browsers collapse adjacent vertical margins; table cells don't, and after filling, a construct's
neighbours are different elements (a block dropped, an arm picked, an item repeated 0, 1 or n
times). `collapse-margins` makes the padding right for every outcome: what all outcomes share stays
**outside** the construct, on the blocks before (A) and after (C); only what an arm adds goes
**inside**.

```
A  mb16                    A  pb16          (outside)
IF  B mt24 mb24     =>     IF  B pt8 pb24   (inside)
C  mt16                    C  pt0
```

- `if` without else: an absent block leaves `max(a, c)` between A and C.
- `if` / `else`: every arm gets its own inside padding; the smallest gap goes outside, on A.
- `each`: the gap between items is inside the loop, the edges outside; exact when the parts add up
  for 0, 1 and n items (`margin-bottom` on the items).
- A flex column's `gap` becomes padding-top of what the ESP repeats.

Not solved (W003, margins left on the item): an empty open container as an arm, `margin: 8px 0`
items, a neighbour margin larger than the items', constructs next to constructs or opaque content
where margins meet, nested templates as arms, spacing at an open container edge, a construct first
in a gapped stack.

## The equivalence check

`tddr build <dir>` (and the dev server, for the data on screen) checks every template email against
its own data sets (`*.json` beside it):

1. Render the component with the data as HTML and compile it.
2. Compile the template per dialect and fill it with the real engine (`handlebars`, `liquidjs`).
3. Normalize both sides (`adapters/vite/normalize/`) and compare them line by line.
4. A difference is E016 naming the email, data set, dialect and first differing line; so is data
   that doesn't meet a dialect's needs. The file is not written. `--no-verify` skips the check.

Normalization compares what a reader sees: one line per node, whitespace collapsed (in CSS, dropped
beside `;`, `{` and `}`, where the line wrap may break), attributes sorted; plain full-width
padding-only wrapper tables dissolve into the surrounding cell (or become the outside gap of a
painted cell); gaps between stacked single-cell rows are summed onto the upper row. Painted and
hidden boxes, columns, widths, alignment and MSO markup must match exactly.

Limits: an email without data sets or without the engine installed is skipped (I005); branches no
data set reaches are not compared; it compares markup, not pixels; a sending platform's own engine
build or helpers can still differ.

## Markers

Inside the compiler a field is a placeholder (the path between U+E000 and U+E001) and a loop or
branch is a pair of block markers (`<!--tddr:each items line-->` … `<!--/tddr:each-->`,
`<!--tddr:if c-->` / `<!--tddr:elseif c-->` / `<!--tddr:else-->` … `<!--/tddr:if-->`). Lowering
treats them like any other content; the template step (`src/template/write.ts`), last but for the
line wrap, writes them in the dialect, and an unpaired marker can only be a td;dr bug (W006).
