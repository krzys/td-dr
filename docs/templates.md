# Templates

td;dr can write an email as an ESP template: the fields and blocks are left for the sending
platform's engine to fill at send time, and td;dr writes them in that engine's syntax. Two dialects
exist, `handlebars` and `liquid`. What a client finally sees is the expanded email: the same email
as the source, with the repeated parts repeated and the dropped parts gone.

## Three ways to write a template

All three produce the same thing internally: placeholders for fields, and block markers for loops
and conditions. Lowering treats them like any other content; the last pipeline step writes them in
the dialect.

### 1. Native component code

In a React or Vue email module with `export const template = ["handlebars", "liquid"]`, write the
component as usual. In a template render its props are symbolic values that know their path:

| You write | Template gets |
|---|---|
| `{order.total}`, `` `Hi ${user.name}` ``, `href={order.url}` | a field |
| `items.map((item) => …)`, `v-for` | a loop over `items` |
| `cond && <A/>`, `cond ? <A/> : <B/>`, `v-if` / `v-else-if` / `v-else` | if / else-if / else blocks |
| `!`, `===`, `!==`, `==`, `!=`, `&&`, `\|\|`, parentheses | the condition, lowered for the dialect |
| `if (…) return …` guard clauses and if / else-if chains | one branch value, as `?:` would |
| `switch` on a field whose cases return (grouped cases, `default`) | an else-if chain |
| `let v; if (c) v = A; else v = B;` | `v` is a branch value |

The `tddr()` Vite plugin rewrites those operators and statements in email modules (never in
dependencies) at build time. The rewrite is purely syntactic: every arm is rendered once, the
template is the same on every build, and on plain data the rewritten code behaves exactly like the
original. The same module renders real data as HTML.

What a dialect can't do with a field is a `TemplateError` at the component line, with a hint:
arithmetic, formatting, string methods, sorting, `typeof`, iteration over a branch value, a loop
whose test is a field, `break` / `continue` out of a branch, a `return` inside a loop or `try` that
depends on a field, a branch with side effects (`push`, `+=`, a dropped call, mutating an outer
object). The rule of thumb: send ready values in the data (formatted money, dates, booleans) and
branch in the markup.

Functions called inside an arm must be pure: every arm runs once in the template render, so a
counter incremented in two arms reads differently from the HTML render. The rewrite can't see into a
called function; the equivalence check catches it when the email has data sets.

### 2. Escape-hatch components

`tddr/react` and `tddr/vue` export `If` / `ElseIf` / `Else` (prop `when`, a native expression) and
`Each` (prop `of`; children as a function, or a scoped slot in Vue).

### 3. Hints in plain HTML

For hand-written HTML passed to `compile(html, { template })`:

```html
<div data-email-if="order.status == 'paid'">Paid in full.</div>
<div data-email-else-if="order.shipped">On its way.</div>
<div data-email-else>Being prepared.</div>

<div data-email-each="order.items" data-email-as="line">
  <p>{{line.name}}</p>   <!-- write fields with field("line.name") -->
</div>
```

- `data-email-each` + `data-email-as` (default `item`), `-if`, `-unless`, `-else-if`, `-else`
  (valueless, on the element right after its if / else-if; only whitespace between them). With
  several hints on one element, `if` / `unless` open first and `each` last.
- Transparent elements `<tddr-if test>`, `<tddr-else-if test>`, `<tddr-else>`, `<tddr-each of as>`
  stand for their children.
- Conditions use the language under [Condition semantics](#condition-semantics).
- Fields: `field("order.total")` returns a placeholder string; anywhere in text or an attribute
  value it becomes a field.

`preview(html, props)` evaluates the same hints against sample data, for previews without an engine.
`writeString(text, dialect)` writes a subject or preheader string: fields only, no blocks.

## Where constructs may sit

| Placement | Result |
|---|---|
| A block that becomes a row of a stack, a whole flex row or grid, a child of a flex column | markers between rows |
| A text-level element in a line | markers around the element |
| An item of a flex row, a grid cell; a chain or `<tddr-each>` among row items | **E012** (column widths would depend on data); lowered once, unconditionally. Wrap the row, or put the construct inside the cell. |
| Invalid path or alias (`a[0]`, `my line`), `data-email-as` without `-each` | **E012**; that part is left out |
| An else not right after its if, an else with a value, `-if` and `-else-if` on one element, a `<tddr-*>` with other attributes or without `test` / `of` | **E012**; shown as plain content |
| A hint on or inside a preheader | **E012**: the preheader is one string |
| `-if` reading the same element's `each` variable | **E012**: the condition opens outside the loop; put it on a child |
| A placeholder in CSS other than a whole colour, in `<style>` or the `css` option | **E013** |
| A placeholder in an attribute lowering drops (`title` on a box, any `data-`) | **E013** for a presentational one, else **E012** |
| Block syntax typed by hand (`{{#`, `{{/`, `{{^`, `{{>`, `{{else`, `{%`) | **E012**, written as text |
| Fields or markers in the output with no dialect | **E014** |

## What the output looks like

Where a construct is a row of a stack, the **whole `<tr>…</tr>` of one repetition or branch** sits
between a pair of block markers. For `each` the child is emitted once; the ESP repeats it. An empty
list leaves no rows. All branches of a chain share one slot.

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
<tr><td>Always there.</td></tr>
{{#if paid}}
<tr><td style="padding:16px 24px;background-color:#dcfce7;">Paid in full.</td></tr>
{{/if}}
{{#each order.items as |line|}}
<tr><td style="padding:10px 0;">{{line.name}} {{@root.order.currency}}</td></tr>
{{/each}}
<tr><td>Before</td></tr>
{{#if paid}}<tr><td>Paid.</td></tr>{{else if shipped}}<tr><td>On its way.</td></tr>{{else}}<tr><td>Being prepared.</td></tr>{{/if}}
</table>
```

A text-level element gets the markers around it as authored; whitespace between chain members is
dropped, so put spaces inside the branches:

```html
<p style="margin:0">Your order is {{#if paid}}<b style="color:#15803d">paid</b>{{else}}<b>not paid yet</b>{{/if}}.</p>
```

A construct that is the IR root or a cell's only content is emitted as `marker + node + marker`
with no row around it. Around an Outlook-only element the construct stays outside the conditional:
`{{#if x}}<!--[if mso]>…<![endif]-->{{/if}}`; markers always pair up inside one conditional, so the
ESP resolves them before Outlook reads the comment.

Internally a loop is `<!--tddr:each items line-->` … `<!--/tddr:each-->`, a branch
`<!--tddr:if c-->` / `<!--tddr:elseif c-->` / `<!--tddr:else-->` … `<!--/tddr:if-->`, and a field
is the path between the private-use characters U+E000 and U+E001. `writeTemplate`
(`src/template/write.ts`) turns them into the dialect; an unpaired marker can only be a td;dr bug
(W006).

## Dialects

Each dialect is a table of writers (`src/template/dialects.ts`). What each writes:

| | Handlebars | Liquid |
|---|---|---|
| Field | `{{a.b}}` (the engine escapes) | `{{ a.b \| escape }}` |
| Loop | `{{#each items as \|line\|}}` … `{{/each}}`; inside it, a path that doesn't start at a loop variable is `@root.path` | `{% for line in items %}` … `{% endfor %}`; the outer scope stays visible |
| Chain | `{{#if a}}…{{else if b}}…{{else}}…{{/if}}`; `{{else if}}` only for plain paths, anything else nests in `{{else}}` | `{% if a %}…{% elsif b %}…{% else %}…{% endif %}` |
| Author text that looks like template syntax | `\{{` (with `{{!}}` keeping a typed backslash a backslash) | `{{ "{" }}` |
| A lone `{` before or `}` after a field | `&#123;` / `&#125;` in HTML; `writeString` throws | `{{ "{" }}` / `}` |

Conditions, written for `if` (an `unless` or `!` negates them):

| Condition | Handlebars | Liquid |
|---|---|---|
| `a` | `{{#if a}}` | `{% if a and a != 0 and a != "" %}` |
| `!a` | `{{#unless a}}` | `{% unless a and a != 0 and a != "" %}` |
| `a == null` / `a != null` | `{{#unless a}}` / `{{#if a}}` | `{% if a == nil %}` / `!= nil` |
| `a.length != 0` / `== 0` | `{{#if a}}` / `{{#unless a}}` | `{% if a.size > 0 %}` / `== 0` |
| `a == 'x'` / `a != 'x'` | `{{#equals a "x"}}` / `{{#notEquals a "x"}}` | `{% if a == "x" %}` / `!=` |
| `n == 1` | `{{#equals n 1}}` | `{% if n == 1 %}` |
| `a == true` / `a == false` | `{{#if a}}` / `{{#unless a}}` | `{% if a == true %}` / `== false` |
| `a == b` (two fields) | `{{#equals a b}}` | `{% if a == b %}` |
| `!(s == 'x')` | `{{#notEquals s "x"}}` | `{% unless s == "x" %}` |
| `a == 'x' && b` | `{{#equals a "x"}}{{#if b}}A{{/if}}{{/equals}}` | `{% if a == "x" and b and b != 0 and b != "" %}` |
| `a == 'x' \|\| b == 'y'` | `{{#equals a "x"}}A{{else}}{{#equals b "y"}}A{{/equals}}{{/equals}}` | `{% if a == "x" or b == "y" %}` |
| `a \|\| b` | `{{#if a}}A{{else}}{{#if b}}A{{/if}}{{/if}}` | a flag: `{% assign tddr-1 = false %}{% if a and … %}{% assign tddr-1 = true %}{% endif %}{% if b and … %}{% assign tddr-1 = true %}{% endif %}{% if tddr-1 %}A{% endif %}` |

- **Handlebars** has no operators: `&&` nests, `||` repeats the branch body in the first operand's
  `{{else}}` (a long `||` grows the output), a negated path is `{{#unless}}`, a negated comparison
  flips `equals` / `notEquals`. The output needs `equals` and `notEquals` block helpers; some
  platforms provide them, with plain Handlebars the sender registers them.
- **Liquid** has `and` / `or` but no parentheses and no `not`, and groups them right to left. The
  condition is put in negation normal form and written inline when at most one operand is itself an
  `and` / `or` chain (a path test is one), which goes last; a single negated branch becomes
  `{% unless %}`. Anything else is computed into a `tddr-N` flag first; a hyphen is in no data path,
  so a flag never hides a field.
- Comparisons put the field on the left. Numbers are written unquoted.

What a dialect refuses:

- In a hint, a condition outside the language, a bad path or a bad literal is E012 at the element,
  with a hint; in component code the same is a `TemplateError` at the component line.
- A field whose path isn't a data path is E012 and left out; template syntax typed by hand is E012
  and written as text.
- Fields or markers in the output of a compile without `template` are E014.
- `writeString` throws on blocks, and in Handlebars on a lone brace next to a field.
- Data that doesn't meet a dialect's needs (below) is refused by `preview()` with a
  `TemplateDataError`, and by the equivalence check as E016.

Not implemented: logic-less dialects (sections only, no comparisons or else-if), `{% elif %}`-style
dialects, Handlebars variants with other comparison helpers or without output escaping, and
separate subject / preheader / text-part outputs per platform. A new dialect is a new writer table
plus real-engine tests.

## Condition semantics

A condition means what the same test means in JavaScript on the JSON data the ESP is sent (a
missing field reads as `undefined`): that is what the HTML render runs. Each dialect writes it
exactly, or exactly under a stated **data need**; nothing is silently replaced by something close.
`src/template/semantics.ts` is the contract: `evaluate` runs a condition as JS does on one data set
and checks the needs of every test JS reaches (not the right of a false `&&`), which is what
`preview()` shows.

**The language** (IR `Cond` in `src/ir/types.ts`; one spelling in markers and hints, read back
exactly by `parseCond`):

| Spelling | Meaning in JS | Recorded from a component |
|---|---|---|
| `p` / `!p` | `!!p` / `!p` | `p`, `!p`, `p && …`, `p \|\| …`, `p ? … : …` |
| `p == null` / `p != null` | `p == null` (null or missing) | `p == null`, `p == undefined`; `p ?? q` takes `q` only then |
| `p.length != 0` / `p.length == 0` | the list or string is (not) empty | `p.length > 0`, `>= 1`, `!== 0`, `=== 0`, `< 1`, bare `p.length` |
| `p == 'x'`, `p == 1`, `p == true`, `p == q`, and `!=` | `p === …` / `p !== …` | `===` / `!==` with a string, number, boolean or field |
| `!c`, `c && c`, `c \|\| c`, `( )` | as JS; `!` binds tighter than `&&`, `&&` tighter than `\|\|` | as JS |

Hints also accept `p.length > 0` and `>= 1`. A trailing `.length` is always a list's length.

**Refused**, with a hint: `=== null` / `=== undefined` (write `== null`: ESP data can't tell null
from missing); loose `==` with a string, number, boolean or field in component code (JS `==` also
matches `"1" == 1`; write `===`); `length` compared with anything but 0; `<` `>` on fields; a
literal on the left; `true === field` (the `switch (true)` idiom). Names: no template keyword,
Liquid operator or loop object (`and`, `or`, `not`, `contains`, `forloop`, `nil`, `empty`, …) or
Handlebars helper (`if`, `each`, `with`, `lookup`, `log`, `equals`, …) as the first name of a path,
and no literal word (`true`, `null`, `this`, …) or `Object.prototype` member (`constructor`,
`toString`, …) as any name. String literals can't hold quotes, a backslash, `<` `>`, `--`, `{{`
`}}`, `{%` `%}` or control characters; numbers must be plain digits that read back exactly (no
exponent, nothing past 2^53).

**Data needs per dialect** (verified against handlebars 4.7 and liquidjs 10):

| | Handlebars writes | needs of the data | Liquid writes | needs |
|---|---|---|---|---|
| `p` | `{{#if p}}` | not `[]` | `p and p != 0 and p != ""` | – |
| `p == null` | `{{#unless p}}` | null, missing, or not `false` `0` `""` `[]` | `p == nil` | – |
| `p.length != 0` | `{{#if p}}` | a list or string (every dialect) | `p.size > 0` | same |
| `p == 'x'` (non-empty) | `{{#equals p "x"}}` | string, null or missing | `p == "x"` | – |
| `p == ''` | `{{#equals p ""}}` | string | `p == ""` | – |
| `p == 1` | `{{#equals p 1}}` | number, null or missing | `p == 1` | – |
| `p == true` / `false` | `{{#if p}}` / `{{#unless p}}` | boolean, null or missing / boolean | `p == true` / `p == false` | – |
| `p == q` | `{{#equals p q}}` | two strings or two numbers | `p == q` | not two lists |
| a loop over `p` | `{{#each}}` | a list, null or missing (every dialect) | `{% for %}` | same |
| any path `a.size`, `a.first`, `a.last` | – | – | | `a` has its own field of that name (else Liquid reads its built-in) |

`!=` has the needs of `==`. The Handlebars output relies on `equals` / `notEquals` only for this:
for two strings, or two numbers, equality as `===`; a null or missing value equals no non-empty
string and no number. Strict helpers and helpers that compare as text both qualify.

**React and `x && <A/>`**: a falsy `x` is the value. React shows nothing for it but `0` for `0`,
which the template can't show, so the block carries `prints-zero="x"` and data with `x = 0` is
refused (write `x ? <A/> : null`). Vue prints the falsy value, and so does the template.

**Checking data.** `preview(html, props, { dialects })` (default: all) throws a
`TemplateDataError` naming the value, the need, why, and a hint, for a data set that doesn't meet
one. Printing a field is not covered: a boolean prints `true` / `false` in a template where React
shows nothing.

## Colours from data

A placeholder may be the **whole value** of `color`, `background-color`, `background` (when that is
all it holds), `border-color`, `border-*-color`, or the colour part of a `border` shorthand, in a
`style` attribute. It is an opaque colour: never lowered, flattened or mixed; translucent colours
over it stay as written (W001). It goes whole into every attribute that carries the colour:

```html
<td bgcolor="{{brand.bg}}" style="padding:24px;background-color:{{brand.bg}};">
<td style="padding:16px 24px;border-top:3px solid {{brand.accent}};">
<v:roundrect … fillcolor="{{brand.button}}" strokecolor="{{brand.line}}">
<v:fill type="frame" src="…" color="{{brand.bg}}"/>
```

`bgcolor` and VML need `#rrggbb` or a colour name in the data; `rgba()` works in CSS clients only.
Anywhere else in CSS a placeholder is E013: send a ready class or branch on the style. A class
holding a placeholder stays; dead-class removal can't judge it.

## Spacing around blocks

Adjacent vertical margins collapse to the larger one in a browser. The ESP may drop a block (`if`
false), pick an arm (`else`) or repeat one 0, 1 or n times, so after filling a construct's
neighbours are different elements. Table cells don't collapse, so the spacing has to be padding
that is right for every outcome. The emitter writes the same rows and cells; only which element
carries the space differs.

`collapse-margins` solves it per construct in a collapsing stack. A is the unconditional block
before (bottom margin `a`), C the one after (top margin `c`), the arm has `bt` / `bb`:

| Outcome | Space the browser shows |
|---|---|
| arm shown: above / below it | `max(a, bt)` / `max(bb, c)` |
| construct empty (`if` false, 0 items) | `max(a, c)` between A and C |
| `each`, between two items | `max(bb, bt)` |

As much as possible stays **outside** the construct, on A and C; only what an arm adds goes
**inside**, as its own margin (later padding):

```
A  mb16                    A  pb16          (outside)
IF  B mt24 mb24     =>     IF  B pt8 pb24   (inside)
C  mt16                    C  pt0
```

- `if` without else: `A.bottom + C.top = max(a, c)`, so an absent block collapses its neighbours.
- `if` / `else-if` / `else`: every arm gets its own inside padding; with an `else` nothing is
  absent, so the smallest gap above the arms goes outside, on A, as in the HTML render.
- `each`: the item carries the gap between items inside the loop; the edges against A and C are
  outside. Exact only when the parts add up for 0, 1 and n items (for example `margin-bottom` on the
  items).
- At a container edge that has padding or a border there is no A or C; the construct keeps what it
  needs inside.
- A flex column's `gap` becomes padding-top of what the ESP repeats.
- `bleed` and `collapse-margins` never merge across a construct.

Not solved, margins left on the item with **W003**: an arm that is an empty open container;
`margin: 8px 0` items (which sit 16px apart); a neighbour margin larger than the items' that would
show for one item only; a construct next to another construct or an opaque (`raw`, text-level)
neighbour where margins meet; a nested template as an arm; spacing at an **open** container edge (no
padding or border) beyond the container's own margin; a construct that is the first child of a
gapped stack. One unsolved construct, or run of constructs, gives one W003. An open wrapper reports
even when its own parent is padded (the pass doesn't look past it), so the warning is conservative
there.

## The equivalence check

`tddr build <dir>` (and the dev server, for the data on screen) checks every template email against
its own data sets:

1. Render the component with the data set as HTML and compile it (hints and `<tddr-*>` blocks are
   evaluated the way the engine would, through `preview()`).
2. Compile the template once per dialect and fill it with the real engine (`handlebars`,
   `liquidjs`).
3. Normalize both sides (`adapters/vite/normalize/`) and compare them line by line.
4. Any remaining difference is E016, naming the email, data set, dialect and the first differing
   line of each side. A data set that doesn't meet a dialect's data needs is E016 too, naming the
   value instead. The file is not written. `--no-verify` skips the check.

The filled template and the HTML render can spell the same spacing differently: a gap on A in one,
inside the arm in the other; a plain wrapper table kept in one, flattened in the other.
Normalization compares what a reader sees:

- Parse, one line per node, formatting whitespace collapsed, attributes sorted, entities decoded.
  The space beside an inline element (by its `display`, else its tag) is kept, also past a comment;
  preformatted text and attribute values other than `class` and `style` are kept as written.
- A table is **plain** only with `cellpadding="0"` and `cellspacing="0"` written out (without them
  cells get 1px padding and 2px spacing), and no paint, border, `rules` or `frame`.
- A **plain wrapper** dissolves: a `td` whose only content is a plain table at width 100%, with a
  bare section and row, one `td` holding nothing but px padding. Its padding joins the cell around
  it; nested wrappers add up. A fixed-layout wrapper dissolves only inside a fixed-layout table with
  a width.
- A wrapper around a **painted** cell (background, border, outline, shadow, height, hidden)
  dissolves too, its padding becoming that cell's gap outside the box, only from a single-cell row
  with no attributes and no rowspan reaching into it, and only for a box without its own width or
  span.
- Between stacked single-cell rows, the gap is the bottom of the upper plus the top of the lower,
  kept on the upper. Never across columns or beside a rowspan; never onto or off a cell or row with
  a class (a head rule can restyle it), and padding inside a painted or hidden cell never moves.
- Not dissolved: other widths, `align` / `valign`, text styles, classes, borders or cellpadding on
  the wrapper; text styles, `mso-*`, `align`, `dir`, `nowrap` or a class on the outer cell, its row
  or section (text styles, `dir` or a class on its table); an outer `th`; MSO comments inside;
  non-px padding.

The sum at each boundary is kept, so a gap that is bigger, smaller, or on the other side of a
painted box is still E016. Painted and hidden boxes, columns, widths, alignment and MSO markup must
match exactly.

Limits:

- It is only as good as the data sets. An email without data sets, or without the engine
  installed, is skipped with I005. Branches no data set reaches are not compared.
- It compares markup, not pixels.
- It proves the template matches the HTML render for those data sets only, filled by the reference
  engines; a sending platform's own engine build or helpers can still differ.
