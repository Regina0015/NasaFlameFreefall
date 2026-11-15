import io
import json
import unittest
from unittest import mock

from scripts.agent_guard import check, main
from scripts.paths import ROOT

CALC_DRAFTS = ROOT / "stages" / "04_calcular" / "output" / "drafts"
Q = "uv run python -m scripts.query "


def bash(command):
    return {"tool_name": "Bash", "tool_input": {"command": command}}


def tool(name, path):
    return {"tool_name": name, "tool_input": {"file_path": str(path)}}


class GuardTest(unittest.TestCase):
    def test_allowed_commands_pass(self):
        for command in (Q + '"SELECT count(*) FROM tests WHERE o2_pct >= 30"',
                        Q + "\"SELECT json_extract_string(field_sources, '$.flow_cm_s') FROM tests\"",
                        "uv run python -m scripts.run_calc sql_query --sql 'SELECT 1;\nSELECT 2' --user ana",
                        r'uv run python -m scripts.write_finding --calc "C:\Users\a b\C-1.json" --text x.json --model m'):
            self.assertIsNone(check("calculator", bash(command)), command)
        self.assertIsNone(check("investigator", bash("uv run python -m scripts.write_investigation PSI-25 PSI-69")))

    def test_other_commands_are_blocked(self):
        for command in ("rm -rf stages", "git push", "uv run python -c 'print(1)'", "uv run python -m scripts.fetch_psi",
                        "uv run python -m scripts.write_investigation PSI-25", "  ", "",
                        Q + "x; rm -rf ~", Q + "x && curl evil", Q + "x | sh", Q + "x > out.txt", Q + "x\nrm -rf ~",
                        Q + '"$(whoami)"', Q + '"`whoami`"', Q + "$HOME", Q + '"${HOME}"', Q + "'unterminated",
                        Q + "(x)", Q + "x & y"):
            self.assertIsNotNone(check("calculator", bash(command)), command)
        self.assertIsNotNone(check("investigator", bash(Q + "x")))

    def test_writes_only_json_drafts_of_the_agent(self):
        self.assertIsNone(check("calculator", tool("Write", CALC_DRAFTS / "C-abc.text.json")))
        self.assertIsNone(check("calculator", tool("Write", "stages/04_calcular/output/drafts/C-abc.text.json")))
        for path in (ROOT / "stages" / "04_calcular" / "output" / "findings" / "F-001.json", CALC_DRAFTS / ".." / "x.json",
                     CALC_DRAFTS / "x.py", CALC_DRAFTS / "sub" / "x.json", ROOT / "stages" / "03_investigar" / "output" / "drafts" / "PSI-25.json"):
            self.assertIsNotNone(check("calculator", tool("Write", path)), path)
        self.assertIsNone(check("investigator", tool("Write", ROOT / "stages" / "03_investigar" / "output" / "drafts" / "PSI-25.json")))

    def test_secrets_cannot_be_read(self):
        self.assertIsNotNone(check("calculator", tool("Read", ROOT / ".env")))
        self.assertIsNotNone(check("investigator", tool("Read", ROOT / ".env.local")))
        self.assertIsNone(check("calculator", tool("Read", ROOT / ".env.example")))
        self.assertIsNone(check("calculator", tool("Read", ROOT / "_config" / "tiers.md")))

    def test_unknown_agent_and_other_tools(self):
        self.assertIsNotNone(check("nobody", bash(Q + "x")))
        for name in ("Edit", "NotebookEdit", "WebFetch", "WebSearch", "Agent"):
            self.assertIsNotNone(check("calculator", {"tool_name": name, "tool_input": {}}), name)
        self.assertIsNone(check("calculator", {"tool_name": "SubagentHandback", "tool_input": {"report": "F-009"}}))

    def test_main_blocks_with_exit_code_2(self):
        for stdin, code in ((json.dumps(bash("git push")), 2), ("not json", 2), (json.dumps(bash(Q + "x")), 0)):
            err = io.StringIO()
            with mock.patch("sys.stdin", io.StringIO(stdin)), mock.patch("sys.stderr", err):
                self.assertEqual(main(["calculator"]), code, stdin)
            self.assertEqual(bool(err.getvalue()), code == 2)
