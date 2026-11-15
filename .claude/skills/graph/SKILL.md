---
name: graph
description: Draw the proof graph of a saved finding (for example F-001): finding, method, investigations and their PSI relations, each edge with its source. Saves it as a new version, audits it again and prints the answer. Use when someone types /graph.
---

# /graph <finding id>

Run from the repository root.

1. Run `uv run python -m scripts.make_graph <id>`. If it prints a problem (for example a finding with no evidence), tell the person and stop.
2. Run `uv run python -m scripts.audit_step <id>`: the new version must be audited again.
3. Run `uv run python -m scripts.answer <id>` and show its output as it is. The graph is saved in the finding file (`graph`); the dashboard draws it.

Never write or edit a graph by hand.
