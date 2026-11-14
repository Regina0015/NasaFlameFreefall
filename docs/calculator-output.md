# Calculator Agent — Output Format

**Version 0.1 (draft for the team).** Owner: Calculator agent team. Readers: Auditor, Database and Dashboard owners.

The Calculator agent answers one question at a time and writes **one JSON file per finding**. Everything the agent writes is in **English**.

- Location: `stages/04_calcular/output/findings/F-001.json`
- Formal schema: `schemas/finding.schema.json`
- Examples: `schemas/examples/finding-example.json` (default output) and `schemas/examples/finding-example-with-chart.json` (after the user asks for a chart)

## Rules

1. **Every number comes from code.** The agent chooses the calculation; a Python script computes it. Numbers in `claim`, the summaries, `values` and `chart` must all match the script output.
2. **Every finding cites its source**: PSI investigation, CSV file, columns, rows and DOI.
3. **No data is a valid answer.** If no test answers the question, `status` is `no_data` and the claim says so.
4. **Charts and graphs are made only on request.** By default the agent only *offers* them in a footnote (see below).
5. **Lunar and Mars results always carry a warning**, because PSI has no partial-gravity combustion data.

## Fields

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | yes | string | `F-001`, `F-002`, … |
| `version` | yes | integer | Starts at 1. Goes up when a chart or graph is added |
| `question` | yes | string | The question being answered |
| `status` | yes | `has_data` \| `no_data` | Whether any test answers the question |
| `claim` | yes | string | The finding in one plain sentence |
| `summary_student` | yes | string | Same finding for the student view: plain words, no jargon |
| `summary_professional` | yes | string | Same finding for the professional view: values, ranges, n, units |
| `values` | yes | object | Name → `{ "value": number \| null, "unit": string }` |
| `method` | yes | object | `script`, `function`, `params`, `formula` (in words) |
| `evidence` | yes | array | One entry per source: `investigation`, `doi`, `table`, `columns`, `rows` (list of row numbers, or `"all"`) |
| `n_tests` | yes | integer | Number of tests behind the finding |
| `assumptions` | yes | array of strings | What was assumed |
| `limitations` | yes | array of strings | What the finding does **not** allow you to conclude. At least one |
| `warnings` | yes | array of strings | Things the reader must see (for example the partial-gravity warning). Can be empty |
| `environments` | yes | array | Any of `transit_vehicle`, `space_station`, `lunar_base`, `mars_base`, `pressurized_rover` |
| `tier` | yes | `1` \| `2` \| `null` | Relevance tier of the main investigation |
| `pillar` | yes | `prevention` \| `detection` \| `suppression` \| `null` | Fire-safety pillar |
| `visual_offer` | yes | object | What chart or graph the agent could draw, and the footnote text |
| `chart` | yes | Vega-Lite object \| `null` | `null` until the user asks for a chart |
| `graph` | yes | object \| `null` | `null` until the user asks for a graph |
| `generated_by` | yes | object | `agent`, `model`, `date` (ISO 8601) |

Row numbers: the first data row of the CSV (after the header) is row 1. Column names are written as in the CSV header, with repeated spaces collapsed to one.

## Charts and graphs on request

### The offer

Every finding includes a `visual_offer`. The agent decides, from the data and the complexity of the question, whether a chart or a graph would help:

```json
"visual_offer": {
  "chart": { "available": true,  "idea": "Range bars of the O2 levels tested by BASS-II and FLEX, with a dashed line at the 30% lunar target." },
  "graph": { "available": false, "idea": null },
  "footnote": "Want a visual? I can draw a chart comparing the oxygen levels tested by BASS-II and FLEX against the 30% lunar habitat target."
}
```

Guidelines the agent follows:

| Offer a… | When |
|---|---|
| **Chart** | The answer has two or more comparable numbers: a range, a comparison between investigations or materials, a trend, or a distribution |
| **Graph** | The answer connects two or more investigations, or links them through shared hardware, fuel, or ground studies that reuse flight data |
| **Nothing** (`footnote` is `null`) | A single number, a yes/no answer, or `no_data` with nothing to compare |

The footnote is one sentence, in English, that says what the visual would show.

### The request

When the user asks for the chart or graph of a finding (for example "chart F-001"), the agent:

1. Builds it **from the same script output**. It does not recompute or type numbers by hand.
2. Writes it into the same file, in `chart` or `graph`.
3. Increases `version` by 1 and updates `generated_by.date`.

A new version must be audited again, because the Auditor also checks the chart.

### Chart format: Vega-Lite

`chart` is a [Vega-Lite](https://vega.github.io/vega-lite/) specification, which is plain JSON. Python writes it without extra libraries; the dashboard draws it.

- Data goes **inline** in `data.values`. No external URLs.
- Every number in `data.values` must also be traceable to `values` or to the rows in `evidence`.
- `title` and every axis `title` are in English and include units.
- The Vega-Lite version must be agreed with the Dashboard owner.

### Graph format

```json
"graph": {
  "nodes": [ { "id": "PSI-25", "type": "investigation", "label": "BASS-II" } ],
  "edges": [ { "from": "o2_range", "to": "PSI-25", "type": "uses_data_from", "source": "evidence[0]" } ]
}
```

- Node `type`: `finding`, `method`, `investigation`, `table`, `publication`, `hardware`.
- Edge `type`: `computed_with`, `uses_data_from`, `related_in_psi`, `same_hardware`, `same_fuel`, `reuses_flight_data`.
- Every edge between investigations has a `source` that says where the connection comes from (a PSI field or a DOI). No source, no edge.

## What each teammate uses

| Teammate | Uses | Needs from us |
|---|---|---|
| **Auditor** | `method`, `evidence`, `values`, `claim`, `chart` | To re-run the calculation and compare. The Auditor writes its own file that points to the finding `id` and `version` |
| **Database** | The whole file | Suggested: one row per finding, with `values`, `method`, `evidence`, `visual_offer`, `chart` and `graph` as JSON columns |
| **Dashboard** | `claim`, both summaries, `warnings`, `environments`, `tier`, `pillar`, `chart`, `graph`, `visual_offer.footnote` | Agree on the Vega-Lite version and how the footnote and "ask for a chart" appear in each view |

## Open questions for the team

1. **Auditor**: what does your output file look like, and do you need anything else from ours?
2. **Database**: does the Calculator read your cleaned tables, or the PSI CSV files directly?
3. **Dashboard**: which library draws Vega-Lite and the graph, and which Vega-Lite version?
4. **Everyone**: who can ask for a chart — only the team before the demo, or users from the dashboard?
