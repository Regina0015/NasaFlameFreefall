import json
import unittest
from pathlib import Path

from scripts.fetch_psi import COMBUSTION_IDS, download_url, table_files, trim_record

FIXTURE = Path(__file__).parent / "fixtures" / "psi_record_min.json"


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class TrimRecordTest(unittest.TestCase):
    def test_trim_keeps_facts_and_drops_file_lists(self):
        t = trim_record(load_fixture())
        self.assertEqual(t["accession"], "PSI-25")
        self.assertEqual(t["doi"], "10.60555/4qc4-de67")
        self.assertNotIn("added", t)
        self.assertEqual(t["experimentalTable"], ["PSI-25_Experimental table_BASS-II.csv"])

    def test_trim_drops_contacts_and_reduces_publications(self):
        t = trim_record(load_fixture())
        self.assertNotIn("contacts", t)
        self.assertEqual(
            t["publications"],
            [{"title": "Microgravity flammability boundary for PMMA rods",
              "authorList": "Olson Sandra L., Ferkul Paul V.",
              "doi": "10.1016/j.combustflame.2017.03.001"}])

    def test_table_files(self):
        self.assertEqual(table_files(load_fixture()), ["PSI-25_Experimental table_BASS-II.csv"])


class DownloadUrlTest(unittest.TestCase):
    def test_download_url_encodes_spaces(self):
        self.assertEqual(
            download_url("PSI-25", "PSI-25_Experimental table_BASS-II.csv"),
            "https://psi.nasa.gov/geode-py/ws/studies/PSI-25/download?source=datamanager&file=PSI-25_Experimental%20table_BASS-II.csv")


class IdsTest(unittest.TestCase):
    def test_24_unique_ids(self):
        self.assertEqual(len(COMBUSTION_IDS), 24)
        self.assertEqual(len(set(COMBUSTION_IDS)), 24)


if __name__ == "__main__":
    unittest.main()
