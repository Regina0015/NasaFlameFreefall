"""Guard: .env.example is committed, so it must never hold a real secret (a real gateway key once leaked this way)."""
import re
import unittest

from scripts.paths import ROOT

SECRET_NAME = re.compile(r"KEY|SECRET|TOKEN|PASSWORD", re.IGNORECASE)


def real_secrets(text: str) -> list[str]:
    """Names of secret-looking variables whose value is not empty or a <placeholder>."""
    bad = []
    for line in text.splitlines():
        name, sep, value = line.strip().partition("=")
        if not sep or name.startswith("#") or not SECRET_NAME.search(name):
            continue
        value = value.strip().strip('"').strip("'")
        if value and not (value.startswith("<") and value.endswith(">")):
            bad.append(name.strip())
    return bad


class EnvExampleTest(unittest.TestCase):
    def test_the_committed_example_has_only_placeholders(self):
        text = (ROOT / ".env.example").read_text(encoding="utf-8")
        self.assertEqual(real_secrets(text), [], "put a <placeholder> in .env.example; real values go only in .env")

    def test_a_real_value_is_caught(self):
        text = "SUPABASE_URL=https://x.supabase.co\nAPI_KEY=Zx81kQ_real_looking_value\nAUDITOR_API_KEY=<from the owner>\n"
        self.assertEqual(real_secrets(text), ["API_KEY"])


if __name__ == "__main__":
    unittest.main()
