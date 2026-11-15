---
name: chart
description: Draw the Vega-Lite chart of a saved finding (for example F-001) from its stored values, save it as a new version, audit it again and print the answer. Use when someone types /chart.
---

# /chart <finding id>

Run from the repository root.

1. Run `uv run python -m scripts.make_chart <id>`. If it prints `no chart for this finding: ...`, tell the person why and stop.
2. Run `uv run python -m scripts.audit_step <id>`: the new version must be audited again, because the Auditor also checks the chart.
3. Run `uv run python -m scripts.answer <id>` and show its output as it is. The chart is saved in the finding file (`chart`); the dashboard draws it.

Never write or edit a chart by hand.
