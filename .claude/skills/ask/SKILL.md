---
name: ask
description: Answer a fire-safety question about the NASA PSI combustion data with a checked finding from the Calculator agent, send it to the audit step, and print the answer with its grade. Use when someone types /ask.
---

# /ask "<question>" [--user NAME]

Answers one question with one finding. Run from the repository root. Everything is written in English.

1. **Calculator:** have the `calculator` agent (`.claude/agents/calculator.md`) answer the question exactly as the person wrote it, with `--user NAME` if given. It ends with the finding id (for example `F-003`) or with `FAILED` and its problems.
2. **If it failed:** show the person the problems and stop. Never write or edit a finding by hand.
3. **Audit:** If `.env` has `AUDITOR_URL`, run `uv run python -m scripts.audit_client <id>` (the Auditor PC, with the model); otherwise run `uv run python -m scripts.audit_step <id>`. If `audit_client` says the audit did not run, say so and do not show a grade.
4. **Answer:** run `uv run python -m scripts.answer <id>` and show its output to the person as it is. Do not reword or round its numbers.
