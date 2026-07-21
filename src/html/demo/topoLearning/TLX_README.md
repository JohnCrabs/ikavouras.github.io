# TopoLearning TLX v0.1 — Command Reference

This document describes the first working version of the **TLX** syntax used by TopoLearning.

TLX is a lightweight LaTeX-like authoring format. It is not full LaTeX. Its goal is to let you write pages and lessons in simple structured commands, which are then parsed by JavaScript and rendered as HTML blocks.

---

## 1. Basic file logic

A `.tlx` file is loaded from the navigation configuration in `data/site.json`.

Example navigation item:

```json
{
  "title": "Αρχική",
  "description": "Επιστροφή στην αρχική σελίδα του TopoLearning",
  "hash": "#home",
  "tlxPath": "views/home.tlx"
}
```

When the user opens:

```text
#home
```

TopoLearning loads:

```text
views/home.tlx
```

and renders it inside:

```html
<main id="lesson-root"></main>
```

---

## 2. Comments

Lines starting with `%` are treated as comments and ignored by the parser.

```latex
% This is a comment
% It will not appear in the rendered page
```

---

## 3. Page metadata

Use `\page{...}` for normal site views, such as home, lessons, materials, or about.

```latex
\page{
  title = Αρχική,
  description = Καλώς ήρθες στο TopoLearning
}
```

Supported fields:

```text
title
description
```

Example:

```latex
\page{
  title = TLX Test Page,
  description = This page is rendered from a .tlx file.
}
```

---

## 4. Lesson metadata

Use `\lesson{...}` for actual educational lessons.

```latex
\lesson{
  title = Εισαγωγή στο GSD,
  description = Βασικές έννοιες χωρικής ανάλυσης εικόνας,
  level = beginner,
  duration = 30 min
}
```

Supported fields:

```text
title
description
level
duration
```

Only `title` and `description` are essential for now. The other fields can be used later by the renderer.

---

## 5. Sections

### Main section

```latex
\section{Τίτλος ενότητας}
```

Rendered as an `h2`.

### Subsection

```latex
\subsection{Τίτλος υποενότητας}
```

Rendered as an `h3`.

### Sub-subsection

```latex
\subsubsection{Μικρότερη ενότητα}
```

Rendered as an `h4`.

Do not go deeper than `\subsubsection` in TLX v0.1.

---

## 6. Paragraph

Use `\paragraph{...}` for normal text.

```latex
\paragraph{
Το Ground Sampling Distance περιγράφει την πραγματική απόσταση στο έδαφος που αντιστοιχεί σε ένα pixel.
}
```

Rendered as:

```html
<p>...</p>
```

---

## 7. Note

Use `\note{...}` for small remarks.

```latex
\note{
Μικρότερο GSD σημαίνει περισσότερη χωρική λεπτομέρεια.
}
```

Recommended use: short clarification, not main theory.

---

## 8. Tip

Use `\tip{...}` for practical suggestions.

```latex
\tip{
Πριν συγκρίνεις δύο εικόνες, έλεγξε αν έχουν το ίδιο GSD.
}
```

Recommended use: practical advice that helps the learner avoid mistakes.

---

## 9. Warning

Use `\warning{...}` for important warnings.

```latex
\warning{
Μικρότερο GSD δεν σημαίνει πάντα καλύτερο τελικό αποτέλεσμα.
}
```

Recommended use: common errors, risks, wrong assumptions.

---

## 10. Definition

Use `\definition{title}{content}`.

```latex
\definition{Ground Sampling Distance}{
Το GSD είναι η απόσταση στο έδαφος που αντιστοιχεί σε ένα pixel της εικόνας.
}
```

Structure:

```latex
\definition{Term}{Definition text}
```

The first group is the term. The second group is the definition content.

---

## 11. Example

Use `\example{title}{content}`.

```latex
\example{Παράδειγμα υπολογισμού}{
Μία εικόνα έχει πλάτος 4000 pixels και GSD 0.05 m.

Η κάλυψη στο έδαφος είναι 4000 × 0.05 = 200 m.
}
```

Structure:

```latex
\example{Example title}{Example content}
```

---

## 12. Equation

Use `\equation{...}` for equations.

```latex
\equation{
GSD = \frac{H \times p}{f}
}
```

For now, the equation is rendered as a styled block. Later, MathJax or KaTeX can be connected for full mathematical rendering.

---

## 13. Code

Use `\code{language}{content}`.

```latex
\code{python}{
import rasterio

with rasterio.open("image.tif") as src:
    print(src.crs)
}
```

If no language is needed, use an empty first group:

```latex
\code{}{
console.log("TopoLearning");
}
```

---

## 14. Image

Use `\image{...}` with key-value fields.

```latex
\image{
  src = assets/img/gsd-example.png,
  alt = Παράδειγμα GSD,
  caption = Σχέση pixel εικόνας και απόστασης στο έδαφος
}
```

Required fields:

```text
src
alt
```

Optional field:

```text
caption
```

The `src` path is relative to `index.html`, not to the `.tlx` file.

Example:

```latex
\image{
  src = assets/img/topolearning-logo.png,
  alt = TopoLearning logo,
  caption = TopoLearning visual identity
}
```

---

## 15. Video

Use `\video{...}` with an embedded video URL.

```latex
\video{
  src = https://www.youtube.com/embed/VIDEO_ID,
  caption = Σύντομη επεξήγηση του GSD
}
```

Supported fields:

```text
src
caption
```

Use embed links, not normal watch links.

Correct:

```text
https://www.youtube.com/embed/VIDEO_ID
```

Not ideal:

```text
https://www.youtube.com/watch?v=VIDEO_ID
```

---

## 16. Table

Use `\table{...}` for tables.

### Basic table

```latex
\table{
  columns = Parameter | Value,
  rows =
    Image width | 4000 pixels;
    Image height | 3000 pixels;
    GSD | 0.05 m;
    Ground width | 200 m
}
```

### Formatted table

```latex
\table{
  title = Academic Table Example,
  caption = Example of a formatted table controlled from TLX.
  style = academic,
  align = center,
  width = full,

  columns = Parameter | Value | Unit,
  rows =
    Image width | 4000 | pixels;
    Image height | 3000 | pixels;
    GSD | 0.05 | m;
    Ground width | 200 | m
}
```

Supported fields:

```text
title       optional
caption     optional
style       optional
align       optional
width       optional
columns     required
rows        required
```

Supported `style` values:

```text
default
striped
bordered
compact
academic
```

Supported `align` values:

```text
left
center
right
```

Supported `width` values:

```text
full
auto
```

Rows are separated with semicolons `;`.

Columns inside each row are separated with pipes `|`.

---

## 17. Exercise

Use `\exercise{title}{content}`.

```latex
\exercise{Άσκηση 1}{
Δίνεται εικόνα 6000 × 4000 pixels με GSD = 0.10 m.
Υπολόγισε την κάλυψη στο έδαφος.
}
```

---

## 18. Solution

Use `\solution{title}{content}`.

```latex
\solution{Λύση}{
Πλάτος: 6000 × 0.10 = 600 m

Ύψος: 4000 × 0.10 = 400 m
}
```

For now, solutions are visible. Later they can become collapsible.

---

## 19. Quiz

Use `\quiz{...}` for a multiple-choice question.

```latex
\quiz{
  question = What does GSD describe?,
  options =
    A: Flight height;
    B: Ground distance represented by one pixel;
    C: Number of images;
    D: Camera model,
  answer = B,
  feedback = GSD describes the real-world ground distance represented by one image pixel.
}
```

Supported fields:

```text
question
options
answer
feedback
```

Option format:

```text
A: First option;
B: Second option;
C: Third option;
D: Fourth option
```

Current quiz behavior:

```text
correct answer   → green feedback
wrong answer     → red feedback
```

---

## 20. Interactive 2D plane

Use `\interactive2Dplane{...}` for a 2D workspace placeholder.

```latex
\interactive2Dplane{
  title = 2D Object Placement,
  instructions = This is a placeholder for a future 2D interactive activity.
  width = 900,
  height = 350,
  grid = true,
  objects =
    gcp:GCP;
    building:Building;
    road:Road
}
```

Supported fields:

```text
title
instructions
width
height
grid
objects
```

Object format:

```text
type:Label;
type:Label;
type:Label
```

Example:

```text
gcp:GCP;
building:Building;
road:Road
```

In TLX v0.1 this renders a static 2D workspace placeholder. Full drag-and-drop behavior can be added later.

---

## 21. Full TLX v0.1 command list

```latex
\page{...}
\lesson{...}

\section{...}
\subsection{...}
\subsubsection{...}

\paragraph{...}

\note{...}
\tip{...}
\warning{...}

\definition{title}{content}
\example{title}{content}
\exercise{title}{content}
\solution{title}{content}

\equation{...}
\code{language}{content}

\image{...}
\video{...}
\table{...}
\quiz{...}
\interactive2Dplane{...}
```

---

## 22. Complete minimal TLX example

```latex
\page{
  title = TLX Test Page,
  description = This page is rendered from a .tlx file.
}

\section{Basic Text}

\paragraph{
This is a normal paragraph written in TLX.
}

\note{
This is a note block.
}

\warning{
This is a warning block.
}

\definition{Ground Sampling Distance}{
The Ground Sampling Distance is the real-world ground distance represented by one image pixel.
}

\equation{
GSD = \frac{H \times p}{f}
}

\table{
  title = GSD Parameters,
  style = academic,
  align = center,
  width = full,

  columns = Parameter | Value | Unit,
  rows =
    Image width | 4000 | pixels;
    Image height | 3000 | pixels;
    GSD | 0.05 | m
}

\quiz{
  question = What does GSD describe?,
  options =
    A: Flight height;
    B: Ground distance represented by one pixel;
    C: Number of images;
    D: Camera model,
  answer = B,
  feedback = GSD describes the real-world ground distance represented by one image pixel.
}
```

---

## 23. Current limitations

TLX v0.1 does not support yet:

```text
nested commands inside commands
cell-by-cell table styling
merged table cells
automatic numbering
references
bibliography
LaTeX packages
custom macros
conditional logic
loops
```

These should not be added before the core system is stable.

