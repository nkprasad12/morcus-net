import unittest

from src.py.utils import strings


class TestReplaceMacrons(unittest.TestCase):
    def test_handles_all_macrons(self):
        input = 'āĀēĒīĪōŌūŪȳȲ'
        self.assertEqual(strings.remove_macrons(input), 'aAeEiIoOuUyY')


if __name__ == "__main__":
    unittest.main()