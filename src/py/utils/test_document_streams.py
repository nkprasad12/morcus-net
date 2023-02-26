import os
import tempfile
import unittest
from unittest import mock

from src.py.utils import data
from src.py.utils import document_streams


class TestStreamForText(unittest.TestCase):
    def test_returns_one_document(self):
        documents = document_streams.for_text("foo", "bar")
        self.assertEqual(len(list(documents)), 1)

    def test_has_all_in_one_part(self):
        document = next(document_streams.for_text("foo", "bar"))
        self.assertEqual(len(document.document), 1)
        self.assertEqual(document.document[0].text, "foo")

    def test_has_expected_output_dir(self):
        documents = document_streams.for_text("foo", "bar")
        self.assertEqual(next(documents).outputs_dir, "processed_texts/raw_text/bar")

    def test_has_expected_name(self):
        document = next(document_streams.for_text("foo", "bar"))
        self.assertEqual(document.name, "bar")


class TestStreamFromDirectory(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._root = tempfile.TemporaryDirectory()
        self._make_file(self._root.name, "a.txt", "aaa")
        dir_b = self._make_dir("b")
        self._make_file(dir_b, "c.txt", "ccc")
        self._make_file(dir_b, "d.xml", "ddd")
        dir_e = self._make_dir("e")
        self._make_file(dir_e, "f.txt", "fff")

    def _make_dir(self, path: str) -> str:
        full_path = os.path.join(self._root.name, path)
        os.mkdir(full_path)
        return full_path

    def _make_file(self, dir_name: str, file_name: str, content: str) -> None:
        with open(os.path.join(dir_name, file_name), "w") as f:
            f.write(content)

    def tearDown(self) -> None:
        super().tearDown()
        self._root.cleanup()

    def test_handles_text_files(self):
        document = next(
            document_streams.from_directory(self._root.name, filter=".txt$")
        )

        self.assertEqual(len(document.document), 1)
        self.assertEqual(document.document[0].text, "aaa")

    def test_uses_expected_tag(self):
        document = next(
            document_streams.from_directory(
                self._root.name, filter="a.txt$", tag="gallia"
            )
        )
        expected_path = os.path.join(
            "processed_texts", "gallia", self._root.name[1:], "a"
        )

        self.assertEqual(document.outputs_dir, expected_path)

    def test_has_expected_name(self):
        document = next(
            document_streams.from_directory(
                self._root.name, filter="a.txt$", tag="gallia"
            )
        )
        self.assertEqual(document.name, "a.txt")

    def test_finds_all_files_with_filter(self):
        documents = list(
            document_streams.from_directory(self._root.name, filter=".txt$")
        )
        contents = [d.document[0].text for d in documents]
        contents = sorted(contents)

        self.assertEqual(contents, ["aaa", "ccc", "fff"])

    def test_obeys_doc_limit(self):
        documents = list(
            document_streams.from_directory(
                self._root.name, filter=".txt$", doc_limit=2
            )
        )
        self.assertEqual(len(documents), 2)

    @mock.patch("src.py.utils.perseus_parser.parse_perseus_xml")
    def test_handles_xml_files(self, mock_parser):
        next(document_streams.from_directory(self._root.name, filter="d.xml$"))
        self.assertEqual(mock_parser.call_count, 1)

    @mock.patch("src.py.utils.perseus_parser.parse_perseus_xml")
    def test_obeys_part_limit(self, mock_parser):
        mock_parser.return_value = [
            data.TextPart(0, 0, 0, "0"),
            data.TextPart(0, 0, 0, "0"),
            data.TextPart(0, 0, 0, "0"),
        ]
        document = next(
            document_streams.from_directory(
                self._root.name, filter="d.xml$", part_limit=2
            )
        )
        self.assertEqual(len(document.document), 2)


if __name__ == "__main__":
    unittest.main()
