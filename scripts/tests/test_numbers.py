import unittest

from scripts.numbers import canonical, collect, numbers_in


class NumbersInTest(unittest.TestCase):
    def test_numbers_in(self):
        self.assertEqual(numbers_in("BASS-II O2: 13.6–22.2% vol (n = 129), PSI-25, doi 10.60555/4qc4-de67, 1-g burn"),
                         ["13.6", "22.2", "129"])
        self.assertEqual(numbers_in("FLEX 12-34% and up to 34%."), ["12", "34", "34"])
        self.assertEqual(numbers_in("12.0 and 0.30, 1,015 rows"), ["12", "0.3", "1015"])
        self.assertEqual(numbers_in("CO2 and C2H4 in F-001"), [])

    def test_acronyms_with_numbers_are_not_numbers(self):
        self.assertEqual(numbers_in("FLEX-2, DAFT-2 and SAFFIRE-3 in 1 g and 1g"), [])

    def test_list_with_comma_space(self):
        self.assertEqual(numbers_in("21, 26.5 and 40"), ["21", "26.5", "40"])


class CanonicalTest(unittest.TestCase):
    def test_canonical(self):
        self.assertEqual([canonical(12.0), canonical(0.30), canonical(22.2), canonical(274), canonical("1,015")],
                         ["12", "0.3", "22.2", "274", "1015"])
        self.assertEqual(canonical(0.1 + 0.2), "0.3")


class CollectTest(unittest.TestCase):
    def test_collect_nested(self):
        self.assertEqual(collect({"a": [1, 2.5, {"b": "up to 34%"}], "flag": True, "none": None}), {"1", "2.5", "34"})


if __name__ == "__main__":
    unittest.main()
