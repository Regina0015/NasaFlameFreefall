"""Pruebas de scripts/auditar.py. No necesitan el modelo ni internet.

Correr desde la raíz del repo:
  python3 scripts/test_auditar.py -v

(No usar "python3 -m unittest scripts/...": si ROS está cargado, su paquete "scripts" tapa esta carpeta.)
"""

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auditar as A  # noqa: E402

# CSV pequeño con los mismos vicios que el real de BASS-II: BOM, encabezado con doble espacio
# y espacio al final, y una celda 'none' en otra columna.
CSV_TEXT = (
    "﻿Test #,Fuel Sample Material,Calibrated  initial O2 % by vol ,Final CO (ppm)\n"
    "B1,PMMA film,22.2,6\n"
    "B2,PMMA film,21,none\n"
    "B3,SIBAL,13.6,12\n"
    "B4,SIBAL,18.2,10\n"
)
TABLE = "PSI-25_Experimental table_BASS-II.csv"
FICHE = {"doi": "10.60555/4qc4-de67", "investigationAcronym": "BASS-II",
         "experimentalTable": [{"file_name": TABLE}]}


def base_finding():
    return {
        "id": "F-001",
        "version": 1,
        "question": "Did any BASS-II test reach 30% oxygen or more?",
        "status": "has_data",
        "claim": "None of the 4 BASS-II tests reached 30% oxygen; the maximum was 22.2%.",
        "summary_student": "These BASS-II tests never used as much oxygen as a Moon base plans to.",
        "summary_professional": "BASS-II initial O2: 13.6–22.2% vol (n = 4). No test at ≥30% O2.",
        "values": {
            "bass2_o2_min": {"value": 13.6, "unit": "% vol"},
            "bass2_o2_max": {"value": 22.2, "unit": "% vol"},
        },
        "method": {"script": "scripts/calculos.py", "function": "o2_range",
                   "params": {"investigations": ["PSI-25"], "threshold_pct": 30},
                   "formula": "Min and max of the initial O2, compared with the threshold."},
        "evidence": [{"investigation": "PSI-25", "doi": "10.60555/4qc4-de67", "table": TABLE,
                      "columns": ["Calibrated initial O2 % by vol"], "rows": "all"}],
        "n_tests": 4,
        "assumptions": ["Uses the initial O2 of each test."],
        "limitations": ["Covers only BASS-II."],
        "warnings": ["PSI has no partial-gravity combustion data."],
        "environments": ["lunar_base"],
        "tier": 1,
        "pillar": "prevention",
        "visual_offer": {"chart": {"available": False, "idea": None},
                         "graph": {"available": False, "idea": None}, "footnote": None},
        "chart": None,
        "graph": None,
        "generated_by": {"agent": "test", "model": "none", "date": "2026-11-14T00:00:00Z"},
    }


class FakeModel:
    """Contesta siempre lo esperado, salvo las preguntas indicadas en 'wrong'."""
    name = "fake-model"

    def __init__(self, wrong=(), down=False):
        self.wrong, self.down, self.calls = set(wrong), down, 0

    def ask(self, system, user):
        self.calls += 1
        if self.down:
            raise A.ModelUnavailable("connection refused")
        q = user.rsplit("QUESTION: ", 1)[1]
        expected = next(e for _, text, e in A.MODEL_QUESTIONS_PER_FIELD + [A.MODEL_QUESTION_ONCE] if text == q)
        qid = next(i for i, text, _ in A.MODEL_QUESTIONS_PER_FIELD + [A.MODEL_QUESTION_ONCE] if text == q)
        answer = expected if qid not in self.wrong else ("yes" if expected == "no" else "no")
        return {"answer": answer, "reason": "fake"}, 1


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        (d / "tablas").mkdir()
        (d / "fichas").mkdir()
        (d / "tablas" / TABLE).write_text(CSV_TEXT, encoding="utf-8")
        (d / "fichas" / "PSI-25.json").write_text(json.dumps(FICHE), encoding="utf-8")
        self.sources = A.Sources(d / "tablas", d / "fichas")

    def tearDown(self):
        self.tmp.cleanup()

    def audit(self, finding, model=None, review=None):
        model = FakeModel() if model is None else model
        raw = json.dumps(finding).encode()
        audit = A.audit_finding(finding, raw, finding["id"], self.sources, model, review)
        self.assertEqual(A.validate(audit, A.load_schema("audit.schema.json")), [])
        return audit

    @staticmethod
    def result(audit, cid):
        return next(c for c in audit["checks"] if c["id"] == cid)["result"]


class TestHelpers(unittest.TestCase):
    def test_parse_number_is_strict(self):
        self.assertEqual(A.parse_number(" 22.2 "), 22.2)
        self.assertEqual(A.parse_number("-1"), -1.0)
        for bad in ("none", "", "~ 22.1", "0.17; 0.21", "2(?)", "0.27 mm", "037 mm"):
            self.assertIsNone(A.parse_number(bad), bad)

    def test_norm_col(self):
        self.assertEqual(A.norm_col("Calibrated  initial O2 % by vol "), "Calibrated initial O2 % by vol")

    def test_text_numbers_skip_formulas_and_ids(self):
        nums = [m.group(1) for m in A._TEXT_NUM.finditer("PSI-25 O2 CO2 13.6–22.2% vol (n = 129) qwen3:8b 4b")]
        self.assertEqual(nums, ["13.6", "22.2", "129"])

    def test_text_units(self):
        known = [A.Known(0.222, "fraction", "x"), A.Known(129, "other", "n")]
        self.assertEqual(A.check_text_numbers("max 22.2%, n = 129", known), ([], []))
        missing, bad = A.check_text_numbers("129% of 150 tests", known)
        self.assertEqual(missing, ["150"])
        self.assertEqual(len(bad), 1)

    def test_parse_o2_cell(self):
        self.assertEqual(A.parse_o2_cell("22.2"), ([22.2], "exact"))
        self.assertEqual(A.parse_o2_cell("~ 22.1"), ([22.1], "imprecise"))
        self.assertEqual(A.parse_o2_cell("22.1 to 22.0"), ([22.1, 22.0], "imprecise"))
        self.assertEqual(A.parse_o2_cell("21; 26.5; 40"), ([21.0, 26.5, 40.0], "imprecise"))
        self.assertEqual(A.parse_o2_cell("21.5 - 21.7"), ([21.5, 21.7], "imprecise"))
        self.assertEqual(A.parse_o2_cell("0.5; 1.0; 2.0; or 3.0 "), ([0.5, 1.0, 2.0, 3.0], "imprecise"))
        self.assertEqual(A.parse_pressure_cell("1 atm ", "atm"), ([1.0], "exact"))
        for bad in ("3400%", "", "none", "see note", "21;", "~"):
            self.assertEqual(A.parse_o2_cell(bad)[1], "unreadable", bad)

    def test_name_forms(self):
        self.assertIn("bass2", A._name_forms("BASS-II"))
        self.assertEqual(A._name_forms("FLEX"), {"flex"})  # la X final no es número romano
        self.assertIn("flex2", A._name_forms("FLEX-2"))

    def test_validator_bool_is_not_integer(self):
        f = base_finding()
        f["tier"] = True
        self.assertTrue(A.validate(f, A.load_schema("finding.schema.json")))

    def test_repo_examples_match_schema(self):
        for name in ("finding-example.json", "finding-example-with-chart.json"):
            ex = json.loads((A.SCHEMAS / "examples" / name).read_text(encoding="utf-8"))
            self.assertEqual(A.validate(ex, A.load_schema("finding.schema.json")), [], name)

    def test_grade_rules(self):
        ok = {c: "pass" for c in A.CHECK_NAMES}
        self.assertEqual(A.assign_grade("has_data", ok, "clean")[0], "A")
        self.assertEqual(A.assign_grade("has_data", {**ok, "C5": "fail"}, "clean")[0], "B")
        self.assertEqual(A.assign_grade("has_data", ok, "minor")[0], "B")
        self.assertEqual(A.assign_grade("has_data", ok, "many")[0], "C")
        self.assertEqual(A.assign_grade("has_data", {**ok, "C6": "fail"}, "clean")[0], "C")
        self.assertEqual(A.assign_grade("has_data", {**ok, "C8": "fail"}, "clean")[0], "C")
        for hard in A.HARD_CHECKS:
            self.assertEqual(A.assign_grade("has_data", {**ok, hard: "fail"}, "clean")[0], "rejected", hard)
        self.assertEqual(A.assign_grade("no_data", ok, None)[0], "no_data")
        self.assertEqual(A.assign_grade("no_data", {**ok, "C8": "fail"}, None)[0], "rejected")


class TestAudit(Base):
    def test_good_finding_small_sample_is_B(self):
        a = self.audit(base_finding())
        self.assertEqual(a["grade"], "B")  # 4 pruebas < 30: soporte limitado
        for cid in ("C0", "C1", "C2", "C3", "C4", "C6", "C7", "C8"):
            self.assertEqual(self.result(a, cid), "pass", cid)
        self.assertEqual(self.result(a, "C5"), "fail")
        self.assertEqual(self.result(a, "C9"), "not_applicable")
        self.assertIsNone(a["send_back_to"])
        self.assertEqual(a["audited_by"]["model"], "fake-model")

    def test_c2_points_to_original_cell(self):
        a = self.audit(base_finding())
        c2 = next(c for c in a["checks"] if c["id"] == "C2")
        self.assertIn("cell '22.2' at row 1", c2["detail"])
        self.assertIn("cell '13.6' at row 3", c2["detail"])

    def test_wrong_value_is_rejected(self):
        f = base_finding()
        f["values"]["bass2_o2_max"]["value"] = 25.0
        a = self.audit(f)
        self.assertEqual(a["grade"], "rejected")
        self.assertEqual(self.result(a, "C3"), "fail")
        self.assertEqual(a["send_back_to"], "04_calcular")

    def test_fraction_units_are_converted(self):
        f = base_finding()
        f["values"] = {"bass2_o2_min": {"value": 0.136, "unit": "fraction"},
                       "bass2_o2_max": {"value": 0.222, "unit": "fraction"}}
        a = self.audit(f)
        self.assertEqual(self.result(a, "C3"), "pass")
        self.assertEqual(self.result(a, "C8"), "pass")  # '22.2%' en el texto = 0.222 fracción

    def test_value_key_naming(self):
        f = base_finding()
        f["values"] = {"o2_min": {"value": 13.6, "unit": "% vol"}, "o2_max": {"value": 22.2, "unit": "% vol"}}
        a = self.audit(f)
        self.assertEqual(self.result(a, "C3"), "pass")  # llave genérica: se compara por valor
        self.assertIn("matched by value only", a["recalculation"][0]["detail"])
        f["values"] = {"flex_o2_max": {"value": 22.2, "unit": "% vol"}}
        a = self.audit(f)
        self.assertEqual(self.result(a, "C3"), "fail")  # 'flex' no es una investigación citada

    def test_n_tests_values(self):
        f = base_finding()
        f["values"]["bass2_n_tests"] = {"value": 4, "unit": "tests"}
        f["values"]["total_n_tests"] = {"value": 4, "unit": "tests"}
        a = self.audit(f)
        self.assertEqual(self.result(a, "C3"), "pass")
        f["values"]["bass2_n_tests"]["value"] = 5
        self.assertEqual(self.result(self.audit(f), "C3"), "fail")

    def test_acronym_with_hardware_prefix(self):
        self.assertIn("bre", A._name_forms("ACME BRE"))
        self.assertIn("cfig", A._name_forms("ACME CFI-G"))
        self.assertIn("saffire2", A._name_forms("SAFFIRE-II"))

    def test_wrong_doi_is_rejected(self):
        f = base_finding()
        f["evidence"][0]["doi"] = "10.0000/wrong"
        a = self.audit(f)
        self.assertEqual(self.result(a, "C1"), "fail")
        self.assertEqual(a["grade"], "rejected")

    def test_missing_row_is_rejected(self):
        f = base_finding()
        f["evidence"][0]["rows"] = [1, 2, 9]
        f["n_tests"] = 3
        a = self.audit(f)
        self.assertEqual(self.result(a, "C1"), "fail")

    def test_all_skips_fully_blank_rows(self):
        (self.sources.tables_dir / TABLE).write_text(CSV_TEXT + ",,,\n,,,\n", encoding="utf-8")
        self.sources._tables.clear()
        a = self.audit(base_finding())
        self.assertEqual(self.result(a, "C3"), "pass")  # n_tests = 4, no 6
        self.assertEqual(self.result(a, "C7"), "pass")

    def test_n_tests_must_match_rows(self):
        f = base_finding()
        f["n_tests"] = 129
        a = self.audit(f)
        self.assertEqual(self.result(a, "C3"), "fail")

    def test_number_without_source_fails_c8(self):
        f = base_finding()
        f["claim"] = "None of the 150 BASS-II tests reached 30% oxygen; the maximum was 25%."
        a = self.audit(f)
        self.assertEqual(self.result(a, "C8"), "fail")
        q1 = next(t for t in a["text_review"] if t["question_id"] == "Q1" and t["field"] == "claim")
        self.assertIn("150", q1["reason"])
        self.assertIn("25%", q1["reason"])
        self.assertEqual(a["grade"], "C")

    def test_model_flag_fails_c8(self):
        a = self.audit(base_finding(), FakeModel(wrong={"Q4"}))
        self.assertEqual(self.result(a, "C8"), "fail")
        self.assertEqual(a["grade"], "C")

    def test_model_down_means_manual_review(self):
        model = FakeModel(down=True)
        a = self.audit(base_finding(), model)
        self.assertEqual(model.calls, 1)  # no insiste después de la primera falla de conexión
        self.assertEqual(self.result(a, "C8"), "fail")
        self.assertIsNone(a["audited_by"]["model"])
        self.assertTrue(all(t["answer"] is None for t in a["text_review"] if t["done_by"] == "model"))

    def test_lunar_without_partial_gravity_warning_fails_c6(self):
        f = base_finding()
        f["warnings"] = []
        a = self.audit(f)
        self.assertEqual(self.result(a, "C6"), "fail")
        self.assertEqual(a["grade"], "C")

    def test_chart_numbers_must_trace(self):
        f = base_finding()
        f["version"] = 2
        f["chart"] = {"title": "O2 tested", "data": {"values": [{"o2_min_pct": 13.6, "o2_max_pct": 22.2}]},
                      "layer": [{"mark": "rule", "encoding": {"x": {"datum": 30, "scale": {"domain": [0, 40]}}}}]}
        self.assertEqual(self.result(self.audit(f), "C9"), "pass")
        f["chart"]["data"]["values"][0]["o2_max_pct"] = 24.0
        a = self.audit(f)
        self.assertEqual(self.result(a, "C9"), "fail")
        self.assertEqual(a["grade"], "rejected")

    def test_unknown_function_cannot_pass(self):
        f = base_finding()
        f["method"]["function"] = "something_new"
        a = self.audit(f)
        self.assertEqual(self.result(a, "C3"), "fail")
        self.assertEqual(a["grade"], "rejected")

    def test_bad_format_is_rejected(self):
        f = base_finding()
        del f["claim"]
        a = A.audit_finding(f, b"{}", "F-001", self.sources, FakeModel())
        self.assertEqual(self.result(a, "C0"), "fail")
        self.assertEqual(a["grade"], "rejected")

    def test_unreadable_cells_lower_quality(self):
        f = base_finding()
        bad = CSV_TEXT.replace("B4,SIBAL,18.2", "B4,SIBAL,18 (?)")
        (self.sources.tables_dir / TABLE).write_text(bad, encoding="utf-8")
        self.sources._tables.clear()
        a = self.audit(f)
        self.assertEqual(self.result(a, "C7"), "fail")  # 3 de 4 legibles = 75% < 90%
        self.assertEqual(a["grade"], "C")

    def test_approximate_and_multi_value_cells_cap_at_minor(self):
        # Como Saffire-II ('~ 22.1', '22.1 to 22.0') y BRE ('21; 26.5; 40'), y una celda tipo '3400%'
        messy = CSV_TEXT.replace("B1,PMMA film,22.2", "B1,PMMA film,~ 22.2") \
                        .replace("B2,PMMA film,21,", "B2,PMMA film,21 to 20.9,") \
                        .replace("B4,SIBAL,18.2", "B4,SIBAL,13.6; 18.2")
        (self.sources.tables_dir / TABLE).write_text(messy, encoding="utf-8")
        self.sources._tables.clear()
        a = self.audit(base_finding())
        self.assertEqual(self.result(a, "C3"), "pass")
        self.assertEqual(self.result(a, "C2"), "pass")
        c2 = next(c for c in a["checks"] if c["id"] == "C2")["detail"]
        self.assertIn("cell '~ 22.2' at row 1", c2)
        self.assertIn("approximate or multi-value", c2)
        c7 = next(c for c in a["checks"] if c["id"] == "C7")["detail"]
        self.assertIn("level: minor", c7)
        self.assertEqual(a["grade"], "B")

    def test_main_writes_files(self):
        d = Path(self.tmp.name)
        (d / "findings").mkdir()
        (d / "findings" / "F-001.json").write_text(json.dumps(base_finding()), encoding="utf-8")
        (d / "findings" / "F-002.json").write_text("not json", encoding="utf-8")
        code = A.main(["--findings", str(d / "findings"), "--tables", str(d / "tablas"),
                       "--fiches", str(d / "fichas"), "--out", str(d / "out"), "--no-model"])
        self.assertEqual(code, 0)
        audit = json.loads((d / "out" / "audits" / "F-001.json").read_text(encoding="utf-8"))
        self.assertEqual(audit["grade"], "C")  # sin modelo, C8 queda para revisión manual
        summary = (d / "out" / "summary.md").read_text(encoding="utf-8")
        self.assertIn("F-002.json: not valid JSON", summary)


class TestUnitsFile(Base):
    CFIG = "PSI-159_Experimental table_CFI-G_Normal Flames.csv"

    def setUp(self):
        super().setUp()
        d = Path(self.tmp.name)
        (d / "tablas" / self.CFIG).write_text("Test,XO2 before test\nA1,0.3939\nB1,0.18\n", encoding="utf-8")
        (d / "fichas" / "PSI-159.json").write_text(json.dumps(
            {"doi": "10.60555/cyt1-kh64", "investigationAcronym": "ACME CFI-G",
             "experimentalTable": [{"file_name": self.CFIG}]}), encoding="utf-8")
        self.units_path = d / "unidades.json"

    def finding(self):
        f = base_finding()
        f["values"] = {"cfig_o2_min": {"value": 18.0, "unit": "% mole"},
                       "cfig_o2_max": {"value": 39.39, "unit": "% mole"}}
        f["method"]["params"] = {"investigations": ["PSI-159"], "threshold_pct": 30}
        f["evidence"] = [{"investigation": "PSI-159", "doi": "10.60555/cyt1-kh64", "table": self.CFIG,
                          "columns": ["XO2 before test"], "rows": "all"}]
        f["n_tests"] = 2
        f["claim"] = "CFI-G tested 18% to 39.39% oxygen in 2 tests."
        f["summary_student"] = "CFI-G flames were tested with different amounts of oxygen."
        f["summary_professional"] = "ACME CFI-G XO2 before test: 18–39.39% (n = 2)."
        return f

    def run_with(self, units):
        if units is not None:
            self.units_path.write_text(json.dumps({"tables": {self.CFIG: {"XO2 before test": units}}}),
                                       encoding="utf-8")
        d = Path(self.tmp.name)
        self.sources = A.Sources(d / "tablas", d / "fichas", None, self.units_path)
        return self.audit(self.finding())

    def test_without_units_file_fails(self):
        a = self.run_with(None)
        self.assertEqual(self.result(a, "C3"), "fail")
        self.assertIn("unidades-columnas.json", next(c for c in a["checks"] if c["id"] == "C3")["detail"])

    def test_unapproved_unit_fails(self):
        a = self.run_with({"unit": "fraction", "approved_by": ""})
        self.assertIn("not approved", next(c for c in a["checks"] if c["id"] == "C3")["detail"])

    def test_approved_unit_passes(self):
        a = self.run_with({"unit": "fraction", "approved_by": "Pingui"})
        self.assertEqual(self.result(a, "C3"), "pass")  # 0.3939 fracción = 39.39 %
        self.assertEqual(self.result(a, "C1"), "pass")  # 'cfig' encuentra 'ACME CFI-G'

    def test_wrong_approved_unit_is_caught(self):
        a = self.run_with({"unit": "percent", "approved_by": "Pingui"})
        self.assertEqual(self.result(a, "C3"), "fail")  # 0.3939 % no es 39.39 %


class TestTwoTablesOneInvestigation(Base):
    """Como CFI-G (PSI-159): dos tablas de la misma investigación, citadas en un solo hallazgo."""
    T2 = "PSI-25_Experimental table_BASS-II_extra.csv"

    def setUp(self):
        super().setUp()
        d = Path(self.tmp.name)
        (d / "tablas" / self.T2).write_text(
            "Test #,Calibrated  initial O2 % by vol \nX1,35\nX2,31\nX3,12\n", encoding="utf-8")
        fiche = dict(FICHE, experimentalTable=[{"file_name": TABLE}, {"file_name": self.T2}])
        (d / "fichas" / "PSI-25.json").write_text(json.dumps(fiche), encoding="utf-8")
        self.sources = A.Sources(d / "tablas", d / "fichas")

    def finding(self, n_above, o2_min=12.0, o2_max=35.0):
        f = base_finding()
        f["evidence"].append({"investigation": "PSI-25", "doi": "10.60555/4qc4-de67", "table": self.T2,
                              "columns": ["Calibrated initial O2 % by vol"], "rows": "all"})
        f["values"] = {"psi25_o2_min": {"value": o2_min, "unit": "% O2"},
                       "psi25_o2_max": {"value": o2_max, "unit": "% O2"},
                       "psi25_n_tests": {"value": 7, "unit": "tests"},
                       "psi25_n_at_or_above": {"value": n_above, "unit": "tests"}}
        f["n_tests"] = 7
        f["claim"] = "BASS-II tested 12% to 35% oxygen in 7 tests; 2 reached 30% or more."
        f["summary_professional"] = "BASS-II initial O2: 12–35% (n = 7); 2 tests at ≥30% O2."
        return f

    def test_total_over_both_tables(self):
        a = self.audit(self.finding(n_above=2))  # 0 en la tabla 1 + 2 en la tabla 2
        self.assertEqual(self.result(a, "C3"), "pass")
        detail = next(r for r in a["recalculation"] if r["value_name"] == "psi25_n_at_or_above")["detail"]
        self.assertIn("over its 2 cited tables", detail)
        self.assertEqual(self.result(a, "C2"), "pass")  # el mínimo y el máximo vienen de celdas reales

    def test_one_table_alone_does_not_pass(self):
        # 13.6 es el mínimo de la primera tabla, pero el de la investigación es 12
        a = self.audit(self.finding(n_above=2, o2_min=13.6))
        self.assertEqual(self.result(a, "C3"), "fail")


class TestPaths(unittest.TestCase):
    def test_default_paths_point_to_psi(self):
        self.assertEqual(A.PSI_DIR, A.ROOT / "stages/01_ingesta/output/psi")

    def test_csv_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            m = Path(d) / "manifest.csv"
            m.write_text("file,url,sha256,bytes,fetched_at\nPSI-25.json,u,x,1,t\nA B.csv,u,x,1,t\n", encoding="utf-8")
            self.assertEqual(A.Sources._load_manifest(m), {"PSI-25.json": "PSI-25.json", "A B.csv": "A B.csv"})


class TestCoverageByEnvironment(Base):
    """Dos tablas de gas (una no citada) y una de sólidos sin columna de O2, como F-002 y Flame Design."""
    GAS1 = "PSI-159_Experimental table_CFI-G_Normal Flames.csv"
    GAS2 = "PSI-10_Experimental table_Flame Design_Normal Flame.csv"
    SOLID = "PSI-26_Experimental table_BASS.csv"
    ENV_MD = ("# Crewed environments\n\n## Sourced atmospheres\n\n"
              "| environment | o2_min_pct | o2_max_pct | pressure_min_psi | pressure_max_psi | source |\n"
              "|---|---|---|---|---|---|\n| lunar_base | 30 | | | 10.2 | Challenge text |\n\n## Other\n")

    def setUp(self):
        super().setUp()
        d = Path(self.tmp.name)
        (d / "tablas" / TABLE).unlink()  # en esta prueba solo existen las tres tablas de abajo
        (d / "tablas" / self.GAS1).write_text(
            "Test,XO2 before test,approx p (bar)\nA,0.40,0.5\nB,0.35,1.0\nC,0.21,0.5\n", encoding="utf-8")
        (d / "tablas" / self.GAS2).write_text("Test,XO2 (init),pinit (atm)\nX,0.45,1.0\nY,0.2,1.0\n", encoding="utf-8")
        (d / "tablas" / self.SOLID).write_text("Test,Material\nS1,PMMA\nS2,PMMA\n", encoding="utf-8")
        for inv, t in (("PSI-159", self.GAS1), ("PSI-10", self.GAS2), ("PSI-26", self.SOLID)):
            (d / "fichas" / f"{inv}.json").write_text(json.dumps(
                {"doi": f"10.0/{inv}", "investigationAcronym": inv, "experimentalTable": [{"file_name": t}]}),
                encoding="utf-8")
        (d / "environments.md").write_text(self.ENV_MD, encoding="utf-8")
        units = {"tables": {self.GAS1: {"XO2 before test": {"unit": "fraction", "approved_by": "t"}},
                            self.GAS2: {"XO2 (init)": {"unit": "fraction", "approved_by": "t"}}}}
        (d / "units.json").write_text(json.dumps(units), encoding="utf-8")
        self.cov = {"approved_by": "t",
                    "investigations": {"PSI-159": {"phase": "gas"}, "PSI-10": {"phase": "gas"},
                                       "PSI-26": {"phase": "solid"}},
                    "tables": {self.GAS1: {"o2": ["XO2 before test"], "pressure": {"column": "approx p (bar)", "unit": "bar"}},
                               self.GAS2: {"o2": ["XO2 (init)"], "pressure": {"column": "pinit (atm)", "unit": "atm"}},
                               self.SOLID: {"o2": [], "pressure": None}}}
        self.reload()

    def reload(self):
        d = Path(self.tmp.name)
        (d / "cov.json").write_text(json.dumps(self.cov), encoding="utf-8")
        self.sources = A.Sources(d / "tablas", d / "fichas", None, d / "units.json", d / "cov.json",
                                 d / "environments.md")

    def finding(self, gas_match=3, gas_both=1, rows2="all", with_gas2=True):
        f = base_finding()
        f["method"] = {"script": "scripts/functions.py", "function": "coverage_by_environment",
                       "params": {"environment": "lunar_base", "o2_min_pct": 30.0, "pressure_max_psi": 10.2,
                                  "source": "Challenge text"}, "formula": "Per phase."}
        f["values"] = {"gas_o2_match": {"value": gas_match, "unit": "tests"},
                       "gas_o2_and_pressure_match": {"value": gas_both, "unit": "tests"},
                       "gas_pressure_unknown": {"value": 0, "unit": "tests"}}
        f["evidence"] = [{"investigation": "PSI-159", "doi": "10.0/PSI-159", "table": self.GAS1,
                          "columns": ["XO2 before test", "approx p (bar)"], "rows": [1, 2]}]
        if with_gas2:
            f["evidence"].append({"investigation": "PSI-10", "doi": "10.0/PSI-10", "table": self.GAS2,
                                  "columns": ["XO2 (init)", "pinit (atm)"], "rows": [1] if rows2 == "all" else rows2})
        f["n_tests"] = 3 if with_gas2 else 2
        f["claim"] = "3 gas tests reached 30% oxygen; 1 also ran at or below 10.2 psi."
        f["summary_student"] = "Some gas flames in these tests used as much oxygen as a Moon base."
        f["summary_professional"] = "Gas tests at ≥30% O2: 3 (n = 3); at or below 10.2 psi: 1."
        f["environments"] = ["lunar_base"]
        return f

    def test_counts_every_table(self):
        a = self.audit(self.finding())
        self.assertEqual(self.result(a, "C3"), "pass")  # 0.5 bar = 7.25 psi <= 10.2; 1 bar y 1 atm no
        self.assertEqual(self.result(a, "C6"), "pass")

    def test_uncited_table_is_caught(self):
        a = self.audit(self.finding(gas_match=2, with_gas2=False))
        self.assertEqual(self.result(a, "C3"), "fail")
        c3 = next(c for c in a["checks"] if c["id"] == "C3")["detail"]
        self.assertIn("Flame Design", c3)  # la tabla no citada sí tenía una prueba al 45%

    def test_zero_with_unknown_o2_fails_c6(self):
        f = self.finding()
        f["values"]["solid_o2_match"] = {"value": 0, "unit": "tests"}
        a = self.audit(f)
        self.assertEqual(self.result(a, "C3"), "pass")
        self.assertEqual(self.result(a, "C6"), "fail")
        self.assertIn("2 have no readable O2", next(c for c in a["checks"] if c["id"] == "C6")["detail"])

    def test_unapproved_or_incomplete_map_fails(self):
        self.cov["approved_by"] = ""
        self.reload()
        self.assertIn("not approved", next(c for c in self.audit(self.finding())["checks"] if c["id"] == "C3")["detail"])
        self.cov["approved_by"] = "t"
        del self.cov["tables"][self.SOLID]
        self.reload()
        c3 = next(c for c in self.audit(self.finding())["checks"] if c["id"] == "C3")["detail"]
        self.assertIn("not described in cobertura-tablas.json", c3)

    def test_params_must_match_environments_md(self):
        f = self.finding()
        f["method"]["params"]["o2_min_pct"] = 25.0
        c3 = next(c for c in self.audit(f)["checks"] if c["id"] == "C3")["detail"]
        self.assertIn("_config/environments.md says 30.0", c3)

    def test_read_environments(self):
        env = A.read_environments(Path(self.tmp.name) / "environments.md")
        self.assertEqual(env["lunar_base"]["o2_min_pct"], 30.0)
        self.assertEqual(env["lunar_base"]["pressure_max_psi"], 10.2)
        self.assertIsNone(env["lunar_base"]["o2_max_pct"])

    def test_repo_coverage_file_lists_every_psi_table(self):
        cov = json.loads((A.COVERAGE_FILE).read_text(encoding="utf-8"))
        on_disk = set(A.Sources(A.PSI_DIR, A.PSI_DIR).table_names())
        if on_disk:  # solo si la etapa 01 ya bajó los datos
            self.assertEqual(set(cov["tables"]), on_disk)


HAVE_DUCKDB = A._import_duckdb() is not None


class TestSqlQuery(Base):
    """sql_query: reproducir el SQL sobre un snapshot y anclar cada fila en el CSV original."""
    SQL = ("SELECT 'psi25_high_o2' AS name, count(*) AS value, 'tests' AS unit, investigation, source_table, "
           "list(source_row ORDER BY source_row) AS source_rows, ['Calibrated  initial O2 % by vol'] AS source_columns "
           "FROM tests WHERE o2_pct_max >= 20 GROUP BY investigation, source_table "
           "UNION ALL SELECT 'psi25_o2_min', min(o2_pct_min), '% O2', investigation, source_table, "
           "list(source_row ORDER BY source_row), ['Calibrated  initial O2 % by vol'] FROM tests GROUP BY investigation, source_table")

    def setUp(self):
        super().setUp()
        d = Path(self.tmp.name) / "snapshot"
        d.mkdir()
        self.snap = d
        self.write_snapshot([(1, 22.2), (2, 21.0), (3, 13.6), (4, 18.2)])
        self.sources.snapshot_dir = d

    def write_snapshot(self, rows):
        lines = ["test_id,investigation,source_table,source_row,o2_pct_min,o2_pct_max,gravity"]
        lines += [f"PSI-25-T0-R{r},PSI-25,{TABLE},{r},{o2},{o2},microgravity" for r, o2 in rows]
        (self.snap / "tests.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")

    def finding(self, high=2, o2_min=13.6, rows=(1, 2, 3, 4), sql=None, status="has_data"):
        f = base_finding()
        f["status"] = status
        f["method"] = {"script": "scripts/functions.py", "function": "sql_query",
                       "params": {"sql": sql or self.SQL}, "formula": "The values returned by the SQL query."}
        f["values"] = {} if status == "no_data" else {"psi25_high_o2": {"value": high, "unit": "tests"},
                                                      "psi25_o2_min": {"value": o2_min, "unit": "% O2"}}
        f["evidence"] = [] if status == "no_data" else [dict(f["evidence"][0], rows=list(rows))]
        f["n_tests"] = 0 if status == "no_data" else len(rows)
        f["claim"] = "2 of the 4 BASS-II tests had 20% oxygen or more; the lowest was 13.6%."
        f["summary_professional"] = "BASS-II: 2 tests at ≥20% O2 (n = 4); minimum 13.6%."
        return f

    def test_sql_literals(self):
        self.assertEqual(A.sql_number_literals("SELECT 'psi25_x', count(*) FROM tests WHERE o2 >= 20 AND t = 'PSI-25' "
                                               "AND p <= 0.69 AND c2h4 = 1"), [20.0, 0.69, 1.0])

    def test_without_duckdb_c3_fails_clearly(self):
        real = A._import_duckdb
        A._import_duckdb = lambda: None
        try:
            a = self.audit(self.finding())
        finally:
            A._import_duckdb = real
        self.assertEqual(self.result(a, "C3"), "fail")
        self.assertIn("duckdb is not installed", next(c for c in a["checks"] if c["id"] == "C3")["detail"])

    @unittest.skipUnless(HAVE_DUCKDB, "duckdb not installed")
    def test_reproduces_and_grounds(self):
        a = self.audit(self.finding())
        self.assertEqual(self.result(a, "C3"), "pass")
        self.assertIn("reproduced by running the finding's SQL", next(c for c in a["checks"] if c["id"] == "C3")["detail"])
        self.assertEqual(self.result(a, "C2"), "pass")  # 13.6 es la celda de la fila 3
        q8 = [t for t in a["text_review"] if t["question_id"] == "Q8"]
        self.assertEqual(len(q8), 1)
        self.assertEqual(self.result(a, "C8"), "fail")  # Q8 queda pendiente hasta que una persona lo lea

    @unittest.skipUnless(HAVE_DUCKDB, "duckdb not installed")
    def test_wrong_value_fails(self):
        self.assertEqual(self.result(self.audit(self.finding(high=3)), "C3"), "fail")

    @unittest.skipUnless(HAVE_DUCKDB, "duckdb not installed")
    def test_snapshot_row_missing_from_original_fails(self):
        self.write_snapshot([(1, 22.2), (2, 21.0), (3, 13.6), (9, 25.0)])
        a = self.audit(self.finding(high=3, rows=(1, 2, 3, 9)))
        self.assertEqual(self.result(a, "C3"), "fail")
        self.assertIn("do not exist", next(c for c in a["checks"] if c["id"] == "C3")["detail"])

    @unittest.skipUnless(HAVE_DUCKDB, "duckdb not installed")
    def test_rows_not_in_evidence_fail(self):
        a = self.audit(self.finding(rows=(1, 2)))
        self.assertIn("does not cite", next(c for c in a["checks"] if c["id"] == "C3")["detail"])

    @unittest.skipUnless(HAVE_DUCKDB, "duckdb not installed")
    def test_only_select_is_allowed(self):
        a = self.audit(self.finding(sql="CREATE TABLE x AS SELECT 1"))
        self.assertEqual(self.result(a, "C3"), "fail")
        self.assertIn("exactly one SELECT", next(c for c in a["checks"] if c["id"] == "C3")["detail"])

    @unittest.skipUnless(HAVE_DUCKDB, "duckdb not installed")
    def test_no_data_with_rows_fails(self):
        sql = self.SQL.split(" UNION ALL ")[0]
        f = self.finding(sql=sql, status="no_data")
        self.assertIn("no-data finding, but its SQL returns", next(c for c in self.audit(f)["checks"] if c["id"] == "C3")["detail"])

    @unittest.skipUnless(HAVE_DUCKDB, "duckdb not installed")
    def test_q8_can_be_dismissed_by_a_person(self):
        import hashlib
        f = self.finding()
        sha = hashlib.sha256(json.dumps(f).encode()).hexdigest()
        review = {"finding_id": "F-001", "finding_sha256": sha, "flags": [
            {"question_id": "Q8", "field": "method", "model_reason": "x", "decision": "dismiss",
             "reviewer": "Diego", "note": "the SQL counts BASS-II tests at >= 20% O2, as the question asks"}]}
        a = self.audit(f, review=review)
        self.assertEqual(self.result(a, "C8"), "pass")
        self.assertEqual(a["grade"], "B")  # 4 pruebas: soporte limitado


class TestHumanReview(Base):
    @staticmethod
    def sha(finding):
        import hashlib
        return hashlib.sha256(json.dumps(finding).encode()).hexdigest()

    def review(self, finding, flags, sha=None):
        return {"finding_id": finding["id"], "finding_sha256": sha or self.sha(finding), "flags": flags}

    @staticmethod
    def flag(qid, field, decision="dismiss", reviewer="Pingui", note="false alarm"):
        return {"question_id": qid, "field": field, "model_reason": "x", "decision": decision,
                "reviewer": reviewer, "note": note}

    def test_dismissing_every_flag_passes_c8(self):
        f = base_finding()
        flags = [self.flag("Q4", fld) for fld in A.TEXT_FIELDS]
        a = self.audit(f, FakeModel(wrong={"Q4"}), self.review(f, flags))
        self.assertEqual(self.result(a, "C8"), "pass")
        self.assertEqual(a["grade"], "B")
        c8 = next(c for c in a["checks"] if c["id"] == "C8")
        self.assertIn("dismissed by a person", c8["detail"])
        self.assertEqual(sum(1 for t in a["text_review"] if t.get("dismissed")), 3)

    def test_confirm_or_partial_keeps_failing(self):
        f = base_finding()
        flags = [self.flag("Q4", "claim"), self.flag("Q4", "summary_student", "confirm")]
        a = self.audit(f, FakeModel(wrong={"Q4"}), self.review(f, flags))
        self.assertEqual(self.result(a, "C8"), "fail")
        confirmed = [t for t in a["text_review"] if t.get("confirmed")]
        self.assertEqual([(t["field"], t["confirmed"]["reviewer"]) for t in confirmed], [("summary_student", "Pingui")])

    def test_dismiss_needs_reviewer_and_note(self):
        f = base_finding()
        flags = [self.flag("Q4", fld, reviewer=" ") for fld in A.TEXT_FIELDS]
        a = self.audit(f, FakeModel(wrong={"Q4"}), self.review(f, flags))
        self.assertEqual(self.result(a, "C8"), "fail")
        self.assertIn("without reviewer or note", next(c for c in a["checks"] if c["id"] == "C8")["detail"])

    def test_review_of_other_version_is_ignored(self):
        f = base_finding()
        flags = [self.flag("Q4", fld) for fld in A.TEXT_FIELDS]
        a = self.audit(f, FakeModel(wrong={"Q4"}), self.review(f, flags, sha="0" * 64))
        self.assertEqual(self.result(a, "C8"), "fail")
        self.assertIn("another version", next(c for c in a["checks"] if c["id"] == "C8")["detail"])

    def test_code_checks_cannot_be_dismissed(self):
        f = base_finding()
        f["claim"] = "None of the 150 BASS-II tests reached 30% oxygen."
        bad = self.review(f, [self.flag("Q1", "claim")])  # Q1 no está permitido en el esquema
        a = self.audit(f, FakeModel(), bad)
        self.assertEqual(self.result(a, "C8"), "fail")
        self.assertIn("Review file ignored", next(c for c in a["checks"] if c["id"] == "C8")["detail"])

    def test_main_writes_template_and_keeps_decisions(self):
        d = Path(self.tmp.name)
        (d / "findings").mkdir()
        f = base_finding()
        (d / "findings" / "F-001.json").write_text(json.dumps(f), encoding="utf-8")
        argv = ["--findings", str(d / "findings"), "--tables", str(d / "tablas"),
                "--fiches", str(d / "fichas"), "--out", str(d / "out")]
        model = FakeModel(wrong={"Q4"})
        A.OllamaModel = lambda *a, **k: model  # main crea el modelo; aquí se usa el falso
        self.assertEqual(A.main(argv), 0)
        rpath = d / "out" / "reviews" / "F-001.json"
        review = json.loads(rpath.read_text(encoding="utf-8"))
        self.assertEqual(len(review["flags"]), 3)
        self.assertTrue(all(r["decision"] == "pending" for r in review["flags"]))
        for r in review["flags"]:
            r.update(decision="dismiss", reviewer="Pingui", note="limited to BASS-II")
        rpath.write_text(json.dumps(review), encoding="utf-8")
        self.assertEqual(A.main(argv), 0)
        audit = json.loads((d / "out" / "audits" / "F-001.json").read_text(encoding="utf-8"))
        self.assertEqual(next(c for c in audit["checks"] if c["id"] == "C8")["result"], "pass")
        self.assertEqual(json.loads(rpath.read_text(encoding="utf-8")), review)  # no se pisó
        f["claim"] = "None of the 4 BASS-II tests reached 30% oxygen."
        (d / "findings" / "F-001.json").write_text(json.dumps(f), encoding="utf-8")
        self.assertEqual(A.main(argv), 0)
        self.assertTrue((d / "out" / "reviews" / "F-001.old.json").is_file())  # la vieja se guarda
        new = json.loads(rpath.read_text(encoding="utf-8"))
        self.assertTrue(all(r["decision"] == "pending" for r in new["flags"]))

    def setUp(self):
        super().setUp()
        self._ollama = A.OllamaModel

    def tearDown(self):
        A.OllamaModel = self._ollama
        super().tearDown()


if __name__ == "__main__":
    unittest.main()
