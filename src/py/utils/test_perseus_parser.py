import unittest

from xml.etree import ElementTree

from src.py.utils import perseus_parser


class TestStringMethods(unittest.TestCase):
    def test_handles_add_tags(self):
        result = perseus_parser.parse_perseus_xml(
            "testdata/perseus/doc_with_splits.xml"
        )

        self.assertEqual(len(result), 4)
        self.assertEqual(result[0].text, "Book1Chapter1Section1")
        self.assertEqual(result[1].text, "Book1Chapter1Section2")
        self.assertEqual(result[2].text, "Book1Chapter1Section3")
        self.assertEqual(result[3].text, "Book1Chapter1Section4")

    def test_handles_multiple_nesting(self):
        result = perseus_parser.parse_perseus_xml(
            "testdata/perseus/doc_with_books_chapters_sections.xml"
        )

        self.assertEqual(len(result), 8)

        self.assertEqual(result[0].text, "Book1Chapter1Section1")
        self.assertEqual(result[1].text, "Book1Chapter1Section2")

        self.assertEqual(result[2].text, "Book1Chapter2Section1")
        self.assertEqual(result[3].text, "Book1Chapter2Section2")
        self.assertEqual(result[4].text, "Book1Chapter2Section3")

        self.assertEqual(result[5].text, "Book2Chapter1Section1")

        self.assertEqual(result[6].text, "Book2Chapter2Section1")
        self.assertEqual(result[7].text, "Book2Chapter2Section2")
        assert False


if __name__ == "__main__":
    unittest.main()
