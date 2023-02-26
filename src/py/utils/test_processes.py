import unittest

from src.py.utils import processes


class TestStringUtility(unittest.TestCase):
    def test_find_starts_returns_correct_outputs(self):
        starts = processes.find_starts(
            ["Gallia", ".", "est", "omnis"], "Gallia. est omnis"
        )

        self.assertListEqual(starts, [0, 6, 8, 12])

    def test_find_starts_raises_on_invalid_input(self):
        with self.assertRaises(Exception):
            processes.find_starts(["Gallia", ".", "est", "omnis"], "Gallia est omnis")


if __name__ == "__main__":
    unittest.main()
