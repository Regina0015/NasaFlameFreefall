# Which model runs each agent

**Current decision (2026-11-14):** the Investigator and the Calculator run in Claude Code on the team's existing subscriptions, so development costs nothing extra. Agent instructions live in `.claude/agents/*.md` and all tools are plain Python commands, so the same agents can later run on the Anthropic API or a local model without rewriting the tools. The runtime for judges is decided only if the team advances.

| Agent | What the model does | What code does | Model |
|---|---|---|---|
| Investigator | Writes summaries, pillar and environments with their sources; reviews tiers; proposes questions | Copies facts, tiers and relations; checks every number and source | Claude Code (session model) |
| Calculator | Chooses the calculation and writes the claim and summaries | Runs every calculation; checks every number in the text; validates the finding | Claude Code (session model) |
| Auditor | Answers a fixed yes/no checklist about the text (Q3–Q7), in English | Recalculates; checks units, ranges, citations, the numbers in the text (Q1–Q2) and charts | **Decided:** `gemma4:e4b-it-qat` (Google), local with Ollama |

## Why this way

- **Reliable numbers come from code, not from model size.** No model does arithmetic from memory.
- **The Auditor uses a different model on purpose**: two agents on the same model tend to make the same mistakes.
- **A local model is the weakest of the three**, so its work is bounded (yes/no questions) and never overrides an automatic check.
- The team prefers not to use Chinese-origin models (perception with NASA judges).

## The Auditor's local model (decided)

| | |
|---|---|
| Model | `gemma4:e4b-it-qat` (Google's Gemma 4 E4B, QAT-quantized; 6.1 GB) |
| Where it runs | The Auditor owner's PC: RTX 4060 with 8 GB VRAM, Ollama on Linux |
| Parameters | `temperature` 0, `seed` 42, `num_ctx` 8192, `think` false, output forced to the JSON schema `{reason, answer: yes\|no}` (the reason first, so it reasons before deciding); each question sees only the context it needs |
| Tested | 2026-11-14: 100% on GPU with an 8192 context; under 1 s per answer once loaded. With `scripts/probar_c8.py`: 14/17, no missed alerts (`llama3.1:8b` also scored 14/17, but missed one alert). Details in `stages/05_auditar/references/lista-revision.md` |

Why this one:
- It fits entirely in 8 GB and leaves room for the context. Use the exact tag: `gemma4:e4b` without a suffix may pull a version of up to 9.5 GB that does not fit.
- It is from a different family than the Investigator and the Calculator.
- It answers yes/no well, but **it is not reliable at comparing numbers**: in the test it gave the right answer with a wrong reason. That is why C8's Q1 and Q2 are answered by code (`stages/05_auditar/references/lista-revision.md`).
- Gemma 4 "thinks" before answering unless that is turned off: `think: false` is required.

Install: `ollama pull gemma4:e4b-it-qat`, and in `.env`: `OLLAMA_URL=http://localhost:11434` and `MODELO_AUDITOR=gemma4:e4b-it-qat`.

Plan B if it does not fit or fails: `llama3.1:8b` (Meta, 4.9 GB). Tested: same score, but it let a generalization through and quoted text that was not in the finding.

Because the model raises false alarms, a person can dismiss them: `_config/confidence.md`, section "Human review of the model's alerts".

## Record

Each finding stores the model that produced it (`generated_by.model`); each audit stores its own (`audited_by`), including the model parameters (`audited_by.model_params`), so the dashboard can show them.
