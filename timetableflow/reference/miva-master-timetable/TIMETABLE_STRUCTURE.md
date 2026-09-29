# MIVA Master Timetable — Structure Reference

**Source file:** `Live Lesson Time Table - Students Copy.xlsx`
**Reference copy:** `reference/miva-master-timetable/Live Lesson Time Table - Students Copy.xlsx` (byte-identical to the source; SHA-256 `fab562fc1c186fab757017b293a050a5153da669ba678a615590d3fa454b8eca`)
**Original (never modify):** `MIVAPULSE/Live Lesson Time Table - Students Copy.xlsx`
**Analyzed:** 2026-09-28 with `openpyxl` (values + hyperlink objects) and raw OOXML inspection.

Everything below was read from the actual file. No structure was assumed.

---

## 1. File structure

| Property | Value |
|---|---|
| Type | OOXML Excel workbook (`.xlsx`), ZIP container |
| Sheets | 21 |
| Defined names | none |
| Formulas | only on the `Live Lesson Links` sheet (264 × `HYPERLINK()`) |
| Images / drawings | 21 drawing parts, all **empty** (`wsDr` with no shapes, no `xl/media/`) |
| Threaded-comment part | `xl/persons/person.xml` present; no cell comments found |
| Cell value types | **100% strings** — zero `date`, `datetime` or `time` typed cells anywhere in the workbook |
| Cell hyperlinks | only on `Live Lesson Links` (577 rows) and one internal `Back to Menu` link per legacy sheet |

### Sheet inventory

| # | Sheet name (Excel truncates to 31 chars) | State | Dims | Layout family |
|---|---|---|---|---|
| 1 | `Sheet20` | visible | A1:A1 | empty (workbook opens here — `active` sheet) |
| 2 | `September 2026 Live Lesson Time` | **visible** | A1:F178 | **current format** |
| 3 | `November 2026 Live Lesson Timet` | hidden | A1:F207 | current format |
| 4 | `Live Lesson Links` | **visible** | A1:C1039 | link index |
| 5 | `June 2026 Live Lesson Timetable` | hidden | A1:F175 | current format |
| 6 | `May 2026 Live Lesson Timetable` | hidden | A1:F175 | current format |
| 7 | `March 2026 Live Lesson Timetabl` | hidden | A1:F185 | current format |
| 8 | `January 2026 Live Lesson Timeta` | hidden | A1:F171 | current format |
| 9 | `February 2026 Live Lesson Timet` | hidden | A1:F172 | current format |
| 10 | `November 2025 Live Lesson Timet` | hidden | A1:F156 | current format |
| 11 | `October 2025 Live Lesson Timeta` | hidden | A1:F139 | current format |
| 12 | `September 2025 Live Lesson Time` | hidden | A1:F138 | current format |
| 13 | `September 2023` | hidden | A1:M1016 | legacy cohort grid |
| 14 | `January 2024` | hidden | A1:M1054 | legacy cohort grid |
| 15 | `Live Lessons November 2024` | hidden | A1:Z67 | current format |
| 16 | `March 2025 Revision Live Lesson` | hidden | A1:Z1045 | current format |
| 17 | `May 2024` | hidden | A1:M1112 | legacy cohort grid |
| 18 | `September 2024` | hidden | A1:M1066 | legacy cohort grid |
| 19 | `January 2025` | hidden | A1:M1087 | legacy cohort grid |
| 20 | `May 2025` | hidden | A1:N200 | legacy cohort grid (variant) |
| 21 | `September 2025` | hidden | A1:N200 | legacy cohort grid (variant) |

Totals: **3 visible sheets** (empty + current month + link index), **12 current-format month sheets**, **7 legacy cohort sheets**.

**Scope decision:** TimetableFlow v1 parses the **current format** (12 sheets) + `Live Lesson Links`. The 7 legacy cohort sheets have a genuinely different schema (documented in §10) and are out of scope until explicitly requested.

---

## 2. Current-format sheet structure (the format the parser targets)

Columns are fixed:

| Column | Role |
|---|---|
| A | Week label (merged down the whole week) |
| B | Day label (merged down the whole day block) |
| C | Slot 1 (time header + course cells) |
| D | Slot 2 (time header + course cells) |
| E | Slot 3 (time header + course cells) |
| F | Merged spacer column, **always empty** (only `' '` in F1) |

Row layout, using `September 2026 Live Lesson Time` (178 rows) as the concrete example:

```
R1        B1:E1 merged  = title 'Live Lessons Time Table (September, 2026)'   F1 = ' '
R2        A2 = 'Week 1 starting 14th September'   C2/D2/E2 = time headers
R3        B3 = 'Monday 14/09/2026'  (merged B3:B25)  C3/D3/E3 = course cells
R4..R26   no A, no B — course cells only            <-- day inherited from B3
R27,R28   blank separator rows
R29       B29 = 'Tuesday  15/09/2026' (merged B29:B48) + course cells in same row
...
R89,R90   blank rows (end of week 1)
R91       A91 = 'Week 2 starting 21st  September'
          B91 = 'Monday\n 21/09/2026' (merged B91:B111)
          C91/D91/E91 = time headers  <-- week-2 header row IS the first Monday row
R92..     course cells
...
R176,R177 blank
R178      B178 = '-'   <-- stray marker, must be ignored
```

### Header structure

- **Row 1 is the title, not a header.** The real column semantics are positional (A/B/C/D/E) and are never written down as column headers.
- **No repeated column headers** inside the sheet.
- Time headers appear **once per week** (row 2 and row 91 in Sep 2026), not once per day.
- Week 1's time-header row has an **empty B cell** (absorbed by the `B1:E1` title merge); week 2's time-header row **also carries the Monday day label**. The two weeks are therefore not structurally identical.

### Merged cells (September 2026)

```
B1:E1
A2:A88   A91:A177                     (weeks)
B3:B25   B29:B48   B50:B68   B70:B89  (week-1 days)
B91:B111 B113:B135 B137:B156 B158:B177 (week-2 days)
F2:F88   F91:F177                     (empty spacer)
```

Merged ranges **do not always cover the whole visual block**:

- `B3:B25` ends at row 25, but row 26 still contains a Monday course (`D26 = 'MIVA-MCM 109 - …'`).
- `B50:B68` ends at 68 while content ends at row 66.
- Rows 89–90 and 112 fall **outside** every A/B merge, yet belong to the preceding week/day.

➡️ **Rule: forward-fill by "last non-empty value seen while walking rows top-to-bottom"; never resolve context from the merge range.**

### Hidden rows/columns

None on any current-format sheet.

### Formulas / hyperlinks / dates on current-format sheets

- Formulas: **0**
- Cell hyperlinks: **0** on all 12 current-format sheets (sheet rels contain only a drawing reference, no hyperlink relationships)
- URLs as literal text: **0** cells contain `http…` on current-format sheets
- Every value is a plain string.

---

## 3. How courses are represented

A course occupies **one cell** that concatenates code and title:

```
<course code> <separator> <course title>
```

* **Course code column:** none — code is the leading token of the cell in C, D or E.
* **Course title:** remainder of the same cell.
* **Separator:** always a hyphen `-` (ASCII). 4556 / 4556 parseable cells use it. Surrounding whitespace varies: `'IFT 211 - Digital Logic Design '`, `'CSS 203- Comparative …'`, `'MIVA-ACC 316- Intermediate …'`, `'IFT 410\t - System Integration …'`.
* **Programme / level / department / semester:** **not present** on current-format sheets. Nothing distinguishes a 100-level from a 400-level course except the number itself.
* **Lecturer:** **not present**.
* **Topic / week topic:** **not present** — the cell title is the course title, never a per-session topic.
* **Session identifier:** none; a cell *is* the session (date + slot come from its row/column context).

### Course-code patterns actually observed

```
IFT 211                      plain            4-letters + space + 3 digits
MIVA-CSS 209                  MIVA- prefixed programme
MIVA_PAD 208                  underscore variant  (links sheet)
MIVA ECO 105                  space variant       (Nov 2024 sheet)
BUA 203/ENT 125               two codes, no spaces around '/'
STA 111/ MIVA-ECO 105         two codes, space after '/'
MIVA-DTS 202/ MIVA-IFT 202    two MIVA codes
CSC 403/MIVA-IFT 407          mixed
INS 202/MIVA-CSC 406
MIVA-SEN 311/MIVA-CSC 312
```

* Codes repeat: the same course appears in many cells (once per month it is scheduled, and across sheets).
* Levels are mixed together in every column — a single 3–4 pm slot holds 100-, 200-, 300-, 400- and 500-level courses side by side.
* Programmes are only implied by the code prefix (`ACC/BUA/CSC/CSS/CYB/DTS/ECO/EDU/EEC/ENT/GST/IFT/INS/MCM/MTH/NSC/PAD/PED/PHA/PHS/PSY/SEN/SSC/…`) or by the literal `MIVA-` marker.
* Whitespace anomalies: 31 cells start with a space, **1322 cells have trailing whitespace**, 9 contain tab characters, some contain multi-tab padding (`'ENT 429 - …' + 21 tabs`).

---

## 4. Date and time structure

### Dates

* **No real date values exist anywhere in the workbook.**
* The date lives inside the **column-B day label**, as free text:

```
'Monday 14/09/2026'
'Tuesday  15/09/2026'            (two spaces)
'Wednessday\n16/09/2026'         (misspelled + newline)
'Thursday\n 17/09/2026'          (newline + leading space)
'Monday\n 21/09/2026'
'Tuesday \n02/06/2026'           (space before newline)
'Monday 18/05/2026'
```

* Format is consistently `Weekday DD/MM/YYYY`, but the weekday word and the date may be separated by `space`, `\n`, or `space\nspace`.
* **Weekday names are misspelled `Wednessday` 9 times** and spelled `Wednesday` 13 times — both occur, even within one sheet.
* Because there is no Friday on most sheets, the weekday word can be used as a **validation cross-check against the parsed date** (Sep 2026: 14/09/2026 is a Monday ✔).

### Week

Free-text label in column A, also containing typos:

```
'Week 1 starting 14th September'
'Week 2 starting 21st  September'          (double space)
'Week 2 starting 23th  Novermber'          (ordinal + spelling errors)
'Week 2 starting 1st  December'            (month rolls over: Oct 2025 → Dec, May 2026 → Jun)
```

Week labels are **not reliable date sources** — the day labels are.

### Times

* Never typed as time values; always strings in the weekly header row of columns C/D/E.
* Two slot schemes in use:

| Sheets | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| Most current sheets (incl. Sep/Nov 2026) | `3:00 - 4:00 pm` | `4:00 - 5:00 pm` | `5:00 - 6:00 pm` |
| Revision sheets (Mar 2025, Nov 2024, Mar 2026, Nov 2025) | `1:30 - 3:00 pm` | `3:00 - 4:30 pm` | `4:30 - 6:00 pm` |

* Slot headers can differ **between sheets**, so the parser must read them, not hard-code them.
* There is **no end-time column**; start/end must be parsed out of the slot string (`h:mm - h:mm am/pm`).

### Days present

Monday–Thursday is the norm; some sheets include Friday (Mar 2026 week 2, Sep 2025 week 1); Sep 2025 week 1 is **missing Wednesday**. Two weeks per sheet, second week's dates often roll into the next month.

---

## 5. Live-lesson URLs — the critical finding

**The month timetables contain no URLs at all.** Every link lives on the separate `Live Lesson Links` sheet and must be joined in by course code.

### `Live Lesson Links` layout

| Cell | Header | Meaning |
|---|---|---|
| A | `Courses Title` | course title |
| B | `Course Code` | course code (incl. `MIVA-` prefix and `/` combos) |
| C | `Live Lesson Link` | display text **always literally `Link`** |

* Header row = row 1. Content rows **2–578** (577 rows); `max_row` is 1039 because rows 579–1039 are empty but styled.
* No merged cells.

### URL representation — two different mechanisms in the same column

1. **Embedded hyperlink object** (313 rows): cell value is `'Link'`; the target lives in the sheet relationship part (`xl/worksheets/_rels/sheet4.xml.rels`, `relationships/hyperlink` → `Target="http(s)://meet.google.com/…"`). Reachable via `cell.hyperlink.target`. Rows 2–535.
2. **`HYPERLINK()` formula** (264 rows): cell value is the formula string itself, e.g.

   ```
   =HYPERLINK("https://meet.google.com/dnv-qcwb-htg", "Link")
   ```

   `cell.hyperlink` is `None`; the URL must be regex-extracted from the formula text. Rows 275–578.

   The two mechanisms **overlap** (rows 275–535 contain a mix), so row position cannot be used to decide which to use. Load the workbook with `data_only=False` (default) or the formula text is lost.

* **Every one of the 577 rows yields a URL** — there are no empty link cells.
* Extraction order per row: `cell.hyperlink.target` → else parse `=HYPERLINK("…")` → else `null`.
* URL stats: 287 distinct targets; `http://` 236 vs `https://` 77; 14 contain `?authuser=0`; some targets are shared by 2–3 course rows (a real link is reused, not an error).

### Template for the doc block

```
Lesson URL location:    'Live Lesson Links' sheet, column C, rows 2-578
URL representation:     (a) embedded hyperlink object  OR  (b) =HYPERLINK("url","Link") formula
                        displayed cell text is always the literal string "Link"
Example (representative): http://meet.google.com/xxxx-xxxx-xxx   (Meet room, http or https,
                        sometimes suffixed with ?authuser=0)
Join key:               column B "Course Code"  (fallback: column A "Courses Title")
```

---

## 6. Traced examples (verified end-to-end)

**Normal entry — September 2026, `C3`**

```
cell text      'IFT 211 - Digital Logic Design '
week (A, fwd)  'Week 1 starting 14th September'
day   (B, fwd) 'Monday 14/09/2026'        -> Monday 2026-09-14
slot  (hdr R2) '3:00 - 4:00 pm'           -> 15:00-16:00
code/title     IFT 211 / Digital Logic Design
join           'Live Lesson Links' row with code 'IFT 211'
lessonUrl      https://meet.google.com/evs-xxok-vzq
```

**Entry on the week-2 header row — `September 2026` row 91 is week label + day label + time headers; first Monday course of week 2 is `C92 = 'SEN 304- Software Testing and Quality Assurance'`.** A parser that assumes "time-header row has no day label" breaks here.

**Entry outside its merged range — `D26 = 'MIVA-MCM 109 - History and Development of Mass Communication '`** belongs to Monday even though the merge `B3:B25` stopped at row 25.

**Entry with a tab inside the code — `D25 = 'IFT 410\t - System Integration and Architecture'`.**

**Entry with trailing tab padding — `D153 = 'ENT 429 - Strategic Thinking…' + 21 tabs`.**

**Dual-code entry — `D6 = 'BUA 203/ENT 125 - Business Statistics '`**; the links sheet stores the *same* combined string `BUA 203/ENT 125` as one key.

**Entry whose only match is by title — `D47 (Nov 2024) = 'CSC 101 - Introduction to Criminology and Security Studies'`**; links sheet has code `CSS 101` with that title (timetable code is a typo). 4 such cells exist, all in 2024/2025 sheets.

**Row with no lesson link:** none — every parseable course cell on all 12 current-format sheets resolves to a URL (4556/4556).

---

## 7. Irregularities and edge cases (complete list found)

1. Empty visible first sheet (`Sheet20`) is the workbook's active sheet.
2. 18 hidden sheets — parsing must not depend on sheet visibility or index.
3. Sheet names are truncated to 31 chars and never match the file's internal name; select by **pattern**, not by exact string.
4. `B1:E1` merged title steals `B2` in week 1 only; week 2 has no such gap.
5. Week-2 header row doubles as the Monday row (time headers + day label in one row).
6. Merged day/week ranges end before the content does (`B3:B25` vs content in row 26).
7. Blank separator rows (1–3) between day blocks; blank rows 89–90 between weeks — context must survive them.
8. Stray `B178 = '-'` (and `B207`, `B175`, `B171`, … on other sheets) at the tail of every current sheet.
9. Whitespace-only cell: `E154` on `November 2026` (spaces only) — must be treated as empty.
10. Trailing whitespace on 1322 cells; leading space on 31; tabs in 9; NBSP: none.
11. `Wednessday` misspelling (9×) alongside correct `Wednesday` (13×); `Novermber` and `23th` typos in week labels.
12. Day labels use `space`, `\n`, `space\n` and `space + \n` as separators — and sometimes both `Monday 14/09/2026` and `Monday\n 21/09/2026` inside the same sheet.
13. Slot scheme differs between sheets (3×1h vs 3×1.5h).
14. Duplicate course in the same column/day: Sep 2026 `MCM 101` at `C10` and `C23` (both Monday 3–4 pm); Nov 2026 `MIVA-ACC 410` at `D116` and `D123`. Genuine source duplicates — keep both, flag as conflicts.
15. `Live Lesson Links` duplicate codes: 27 codes appear 2–3 times (577 rows → 549 distinct codes).
16. **True data conflict:** code `NSC 309` appears twice with *different* titles **and different URLs** (row 4 `Nursing Ethics and Jurisprudence`, row 5 `Developmental Psychology` — row 5 is wrong; row 6 shows `NSC 203` for the same title). Ambiguous join → must be surfaced, not silently resolved.
17. Code-format variants between the two sheets: `MIVA_PAD 208` (underscore), `MIVA ECO 105` (space), `STA 111/ MIVA-ECO 105` vs `STA 111/MIVA ECO 105`.
18. Prefix inconsistency: timetable `NSC 512` vs links `MIVA-NSC 512`; timetable `CSC 101` vs links `CSS 101`.
19. Slash-combined codes are stored **combined** in links (`BUA 203/ENT 125`, `COS 203/CSC 203`, `MIVA-SEN 311/CSC 312`, `INS 204/MIVA-IFT 204`, …) but sometimes appear **split** in the timetable (`INS 204` alone, `CSC 403` alone, `COS 101` alone) — matching must work in both directions.
20. 18 links-sheet codes never appear on any month sheet (mostly combined variants + 5 genuinely unused codes: `MIVA-PHS 311`, `MIVA-ACC 116`, `MIVA-IFT 408`, `MIVA-MCM 421`, `MIVA-PAD 104`).
21. Legacy sheets (2023–2025) use a completely different layout — see §10.
22. `Live Lessons November 2024` and `March 2025 Revision` are current-format despite their names (Z columns are just padding).

---

## 8. Normalized `TimetableEntry` schema

The source has no programme/level/semester/lecturer/topic-per-session, so those fields are **not** invented. What the file actually supports:

```ts
TimetableEntry {
  // --- from the month sheet cell ---
  courseCode:      string        // normalized, e.g. "IFT 211", "MIVA-CSS 209", "BUA 203/ENT 125"
  courseCodes:     string[]      // split on "/", non-empty; 1 element for simple codes
  courseTitle:     string        // cell text after the first "-"
  rawCellText:     string        // untouched original (trailing spaces/tabs preserved)

  // --- from row/column context ---
  date:            string        // ISO "2026-09-14"
  day:             string        // canonical "Monday" (source spelling corrected)
  dayRaw:          string        // untouched label, e.g. "Wednessday\n16/09/2026"
  weekLabel:       string | null // "Week 1 starting 14th September"
  weekIndex:       number | null // 1-based, order of appearance
  startTime:       string        // "15:00"
  endTime:         string        // "16:00"
  slotLabel:       string        // "3:00 - 4:00 pm" (raw header text)

  // --- from the join ---
  lessonUrl:       string | null // Google Meet URL, normalized to https
  linkRow:         number | null // source row on 'Live Lesson Links'
  linkTitle:       string | null // title as recorded on the links sheet
  matchTier:       'code' | 'code-variant' | 'title' | 'none'
  matchAmbiguous:  boolean       // >1 conflicting URL for this code (e.g. NSC 309)

  // --- provenance ---
  sourceSheet:     string        // e.g. "September 2026 Live Lesson Time"
  sourceCell:      string        // e.g. "C3"
}
```

### Field mapping / transformation / validation

| # | Source | Location | Normalized field | Transformation | Validation |
|---|---|---|---|---|---|
| 1 | leading token of cell text | col C/D/E | `courseCode` / `courseCodes` | split on first `-`; split on `/`; upper-case; collapse whitespace/tabs; `_`→`-`; unify `MIVA[- ]X` → `MIVA-X` | must match `^(MIVA-)?[A-Z]{2,4} \d{3}$` per part |
| 2 | remainder of cell text | col C/D/E | `courseTitle` | trim + collapse internal whitespace (keep original in `rawCellText`) | non-empty |
| 3 | column B label | col B (forward-filled) | `day`, `dayRaw`, `date` | strip `\n`/extra spaces; parse `DD/MM/YYYY` → ISO; map `Wednessday`→`Wednesday` | weekday name must equal weekday of parsed date; date must parse |
| 4 | column A label | col A (forward-filled) | `weekLabel`, `weekIndex` | keep raw; index = order of appearance | label must start with `Week` |
| 5 | weekly header row | col C/D/E header | `slotLabel`, `startTime`, `endTime` | parse `h:mm - h:mm am/pm` → 24h | both bounds parse; end > start |
| 6 | links col C | `Live Lesson Links` | `lessonUrl` | `cell.hyperlink.target` else regex `=HYPERLINK\("([^"]+)"` ; strip trailing whitespace | must be `http(s)://…` or `null` |
| 7 | links col B (fallback col A) | `Live Lesson Links` | `linkRow`, `linkTitle`, `matchTier` | multi-tier code join (see §9) | unresolved → `lessonUrl = null`, `matchTier = 'none'` |
| 8 | sheet name | sheet name | `sourceSheet`, plus derived `month`/`year` | regex `^(Month) (YYYY) ` | must parse for current-format sheets |
| 9 | cell coordinate | — | `sourceCell` | openpyxl coordinate | non-empty |

---

## 9. Extraction strategy (validated against the real file)

Prototype run over all **12 current-format sheets**:

```
cells in cols C/D/E scanned   4630
header/junk rows skipped        72   (12 sheets × 6 time-header cells) + 2 whitespace cells
course entries extracted      4556
joined to a lesson URL        4556   (100%)
   ├ by exact/primary code    4529
   ├ by normalized variant      23   (underscore / space / MIVA- prefix / slash-split)
   └ by title fallback           4   (CSC 101 → CSS 101, CSC 103 → CSS 103, 2024/25 sheets)
September 2026 alone           464 entries, 464 URLs, 0 missing
November 2026 alone            542 entries, 542 URLs, 0 missing
```

### Algorithm

```
1. open workbook (data_only=False) — formulas must survive
2. select sheets by regex ^(Month) (YYYY) (Live Lesson|…)  → current-format set
   (skip 'Live Lesson Links' and legacy cohort sheets)
3. build link index from 'Live Lesson Links':
     for each row 2..last-content-row:
       url  = cell.hyperlink.target  or  regex on '=HYPERLINK("url"'
       keys = [full code] + parts split on '/'
              each key indexed twice: raw-upper, and MIVA-prefix-stripped
       also index 'T:' + upper(title)   ← title fallback
       record every (row, url) per key → >1 distinct url ⇒ ambiguous flag
4. walk month sheet top→bottom, left→right:
     if col A value contains 'Week'            → current week
     if col B matches ^(Monday|Tuesday|Wednessday|Wednesday|Thursday|Friday)
                                               → current day label
     if cell in C/D/E matches '^\d{1,2}:\d{2} *-' → slot header for that column
     if cell in C/D/E matches ^CODE - TITLE    → emit entry using current
                                                 week/day/slot context
     blank rows and '-' markers are ignored (they never match a course pattern)
5. join: try full code → normalized variants → slash parts → title
6. normalize: date ISO, day canonical, times 24h, URL scheme https
7. validate: weekday-vs-date agreement; URL format; flag ambiguous/duplicate joins
```

**Key design rules this analysis forces:**

* Context is **positional + forward-filled**, never derived from merge ranges.
* A cell is a course **only if it parses as `CODE - TITLE`** — that single predicate safely rejects time headers, blank rows, the `'-'` marker and whitespace cells.
* URLs come from a **separate sheet joined by code**, with a 4-tier fallback chain; never from the month cell.
* Both hyperlink mechanisms in links column C must be handled.
* Slot headers are read per sheet, not hard-coded.
* Duplicate/conflicting joins are reported, never silently picked.

---

## 10. Legacy cohort sheets (documented, out of scope for v1)

7 sheets: `September 2023`, `January 2024`, `May 2024`, `September 2024`, `January 2025`, `May 2025`, `September 2025`.

Different schema entirely:

```
A1                 'Back to Menu' (internal hyperlink)
A2                 '<Month> <Year> Cohort'
<dept header>      e.g. C7 'Computer Science '  /  D6 'School of Computing'
time headers       8 slots: 10:00-11:00 am … 5:00-6:00 pm
per day: 3 stacked rows
                   day name      | label          | slot values
                   'Monday'      | 'Course Title' | …
                                 | 'Course Code'  | …
                                 | 'Mode'         | 'Self-study' | 'Live video lesson'
```

* Titles and codes are in **separate rows** (opposite of current format).
* Contains an explicit **`Mode`** field (`Self-study` vs `Live video lesson`) — the only sheet family that distinguishes live from non-live sessions.
* One department block per section, separated by blank rows; heavy vertical merges on the day column.
* ~1000 rows per sheet; `May 2025` / `September 2025` shift everything one column right (D/E instead of C/D).

A second parser family would be required to support these.

---

## 11. Parsing assumptions

1. New MIVA timetables will keep the current 6-column format (A week / B day / C-E slots).
2. The `Live Lesson Links` sheet remains the single URL index, keyed by course code.
3. Dates are `DD/MM/YYYY` (verified: all 96 day labels on current sheets parse and match their weekday).
4. The course/title separator is always `-` (holds for 4556/4556 cells today) — but the parser must still fall back to "whole cell = code-less title" if the pattern ever changes.
5. Slot headers always match `^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*(am|pm)$`.
6. URLs are Google Meet links; no authentication is encoded other than an optional `?authuser=0`.

## 12. Known limitations

* No programme/level/semester/lecturer/topic-per-session data exists in the source — a product feature that needs them must get them from elsewhere (e.g. MivaPulse's `data/manifest.json`).
* Session dates only cover the 2 weeks printed on each sheet; there is no recurrence/rule data, so "recurring lesson" cannot be derived — only repeated entries on different sheets.
* One source conflict (`NSC 309`) cannot be resolved from the file alone.
* Duplicate same-slot entries (e.g. `MCM 101` Monday 3–4 pm twice in Sep 2026) are real in the source and will be emitted twice.
* Sheet names are truncated by Excel; robust selection must be regex-based.
* Legacy 2023–2025 cohort sheets are not parsed by the current strategy.
