"""Mide qué tan bien contesta el modelo local las preguntas Q3-Q7 de C8.

Usa el hallazgo de ejemplo (schemas/examples/finding-example.json) como contexto y una
lista de textos con la respuesta correcta puesta a mano. Sirve para comparar redacciones
de las preguntas o modelos distintos antes de cambiar auditar.py.

Necesita Ollama corriendo y las fichas PSI-25 y PSI-69 (para los acrónimos).

Uso, desde la raíz del repo:
  python3 scripts/probar_c8.py --fiches ~/prueba-auditor/run/fichas
  python3 scripts/probar_c8.py --fiches ... --model llama3.1:8b
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auditar as A  # noqa: E402

EXAMPLE = A.SCHEMAS / "examples" / "finding-example.json"

# (pregunta, campo, texto o None para usar el del ejemplo, respuesta correcta, nota)
# Para Q7 el "texto" es la lista de límites.
CASES = [
    ("Q3", "claim", "BASS-II initial oxygen ranged from 13.6% to 22.2% across its 129 tests.", "no", "only cited things"),
    ("Q3", "summary_student", None, "yes", "'plastics and fabrics' are not in the evidence"),
    ("Q3", "claim", "FLEX heptane droplets were tested at up to 34% oxygen.", "yes", "'heptane' is not in the evidence"),
    ("Q3", "claim", "FLEX tests reached up to 34% oxygen.", "no", "only cited things"),
    ("Q3", "summary_professional", None, "no", "'solid-fuel' is in the BASS-II title and objective"),
    ("Q4", "claim", None, "yes", "F-001 claim, limited to BASS-II and FLEX"),
    ("Q4", "summary_professional", None, "yes", "says 'in these two investigations'"),
    ("Q4", "summary_student", None, "no", "'solid materials ... in space' in general"),
    ("Q4", "claim", "Solid fuels in PSI were never tested at 30% oxygen.", "no", "all of PSI"),
    ("Q4", "claim", "BASS-II tested oxygen between 13.6% and 22.2%.", "yes", "one cited investigation"),
    ("Q5", "claim", None, "no", "F-001 claim reports coverage, not safety"),
    ("Q5", "claim", "BASS-II materials are safe at 30% oxygen, since none of the tests reached that level.",
     "yes", "absence turned into 'safe'"),
    ("Q6", "claim", None, "no", "F-001 claim does not talk about lunar gravity"),
    ("Q6", "claim", "Under lunar gravity these flames would spread faster than in the FLEX tests.",
     "yes", "lunar gravity as if there were data"),
    ("Q6", "claim", "PSI has no lunar-gravity data, so these results only bound what could happen on the Moon.",
     "no", "admits there is no data"),
    ("Q7", "limitations", None, "yes", "F-001 limitations"),
    ("Q7", "limitations", ["The data come from NASA PSI."], "no", "not a real limitation"),
]


def question_text(qid: str) -> str:
    for q, text, _ in A.MODEL_QUESTIONS_PER_FIELD + [A.MODEL_QUESTION_ONCE]:
        if q == qid:
            return text
    raise KeyError(qid)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Measure the local model on labeled C8 cases.")
    ap.add_argument("--fiches", type=Path, default=A.ROOT / "stages/01_ingesta/output/fichas")
    ap.add_argument("--model", default=None, help="Ollama model (default: MODELO_AUDITOR from .env)")
    args = ap.parse_args(argv)

    A.load_dotenv(A.ROOT / ".env")
    model = A.OllamaModel(os.environ.get("OLLAMA_URL") or A.DEFAULT_OLLAMA_URL,
                          args.model or os.environ.get("MODELO_AUDITOR") or A.DEFAULT_MODEL)
    sources = A.Sources(A.ROOT, args.fiches)
    base = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    for inv in ("PSI-25", "PSI-69"):
        if sources.acronym(inv) is None:
            print(f"Warning: no fiche for {inv} in {args.fiches}; the prompt will lack its acronym.", file=sys.stderr)

    print(f"Model: {model.name}\n")
    score: dict[str, list[int]] = {}
    for qid, fname, text, correct, note in CASES:
        finding = copy.deepcopy(base)
        if fname == "limitations":
            if text is not None:
                finding["limitations"] = text
            shown = ""
        else:
            if text is not None:
                finding[fname] = text
            shown = finding[fname]
        prompt = A.build_model_prompt(finding, fname, shown, question_text(qid), sources, qid)
        try:
            out, attempts = model.ask(A.SYSTEM_PROMPT, prompt)
        except A.ModelUnavailable as e:
            print(f"Model unavailable: {e}", file=sys.stderr)
            return 2
        got = out["answer"] if out else None
        ok = got == correct
        score.setdefault(qid, [0, 0])
        score[qid][0] += ok
        score[qid][1] += 1
        print(f"[{'OK ' if ok else 'BAD'}] {qid} {fname:20} correct={correct:3} got={got}  ({note})")
        if not ok:
            print(f"      reason: {out['reason'] if out else 'no valid answer'}")

    total = sum(s[0] for s in score.values())
    n = sum(s[1] for s in score.values())
    print("\n" + "  ".join(f"{q}: {s[0]}/{s[1]}" for q, s in score.items()) + f"   TOTAL: {total}/{n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
