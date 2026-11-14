import tempfile
import unittest
from pathlib import Path

from scripts import contract
from scripts.cells import normalize_header, parse_list, parse_number, read_table


class ParseNumberTest(unittest.TestCase):
    def test_parse_number_cases(self):
        self.assertEqual(parse_number("22.2"), (22.2, []))
        v, p = parse_number("~ 21.5")
        self.assertEqual(v, 21.5)
        self.assertIn("approximate", p[0])
        self.assertEqual(parse_number("20 cm/s")[0], 20.0)
        self.assertEqual(parse_number("1 atm")[0], 1.0)
        for empty in ["", "  ", "n/a", "none", "N/A", "-"]:
            self.assertEqual(parse_number(empty), (None, []))
        v, p = parse_number("Insignificant")
        self.assertIsNone(v)
        self.assertIn("not a number", p[0])

    def test_percent_sign_and_negative(self):
        self.assertEqual(parse_number("3400%")[0], 3400.0)
        self.assertEqual(parse_number("-12.5")[0], -12.5)


class ParseListTest(unittest.TestCase):
    def test_parse_list_cases(self):
        self.assertEqual(parse_list("0.17; 0.21;0.25; 0.3")[0], [0.17, 0.21, 0.25, 0.3])
        self.assertEqual(parse_list("21; 26.5; 40")[0], [21.0, 26.5, 40.0])
        vals, p = parse_list("1.5 - 5")
        self.assertEqual(vals, [1.5, 5.0])
        self.assertIn("range", p[0])
        self.assertEqual(parse_list("0.5; 1.0; 1.5; 2.0; or 3.0 ")[0], [0.5, 1.0, 1.5, 2.0, 3.0])

    def test_single_value_list(self):
        self.assertEqual(parse_list("25"), ([25.0], []))
        self.assertEqual(parse_list(""), ([], []))


class HeaderTest(unittest.TestCase):
    def test_normalize_header(self):
        self.assertEqual(normalize_header("Calibrated  initial O2 % by vol "), "Calibrated initial O2 % by vol")


class ReadTableTest(unittest.TestCase):
    def test_read_table_falls_back_to_cp1252(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d) / "t.csv"
            tmp.write_bytes(b"Fuel,Note\r\nHeptane,a\x96b\r\n")
            rows = read_table(tmp)
        self.assertEqual(rows[0], (1, {"Fuel": "Heptane", "Note": "a–b"}))

    def test_empty_rows_skipped_but_numbering_kept(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d) / "t.csv"
            tmp.write_bytes("﻿A,B\n1,2\n,\n3,4\n".encode("utf-8"))
            rows = read_table(tmp)
        self.assertEqual(rows, [(1, {"A": "1", "B": "2"}), (3, {"A": "3", "B": "4"})])


class ContractTest(unittest.TestCase):
    def test_tests_columns(self):
        names = contract.names(contract.TESTS)
        self.assertEqual(names[:4], ["test_id", "investigation", "source_table", "source_row"])
        self.assertIn("o2_pct_min", names)
        self.assertEqual(names[-1], "scope")
        self.assertEqual(len(names), 20)

    def test_relations_columns(self):
        self.assertEqual(contract.names(contract.RELATIONS), ["from_id", "to_id", "type", "source", "scope"])


if __name__ == "__main__":
    unittest.main()
