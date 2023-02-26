import os
import shutil
import tempfile
from typing import Iterator
import unittest

from src.py.utils import data
from src.py.utils import document_streams
from src.py.utils import processing


class TestProcess(processing.Process[str, str]):
    initialize_calls: int = 0
    process_calls: int = 0

    def initialize(self) -> None:
        super().initialize()
        self.initialize_calls += 1

    def process(self, input: str) -> str:
        self.process_calls += 1
        return f"Test {input}"


class TestBaseProcess(unittest.TestCase):
    def test_sets_initialized(self) -> None:
        process = TestProcess()
        self.assertFalse(process.initialized)

        process.initialize()
        self.assertTrue(process.initialized)


class TestProcessDocuments(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._root = tempfile.TemporaryDirectory()

    def tearDown(self) -> None:
        super().tearDown()
        self._root.cleanup()

    def _get_stream(
        self, documents: int, sections: int = 1
    ) -> Iterator[document_streams.StorableDocument]:
        for i in range(documents):
            text_parts = []
            for j in range(sections):
                text_parts.append(data.TextPart(0, 0, j, f"Octavianus{i}_{j}"))
            yield document_streams.StorableDocument(
                document=text_parts,
                name=f"Augustus{i}",
                outputs_dir=self._root.name,
            )

    def test_calls_pipeline_correctly(self):
        test_process = TestProcess()

        processing.process_documents(self._get_stream(1, 2), test_process)

        self.assertEqual(test_process.initialize_calls, 1)
        self.assertEqual(test_process.process_calls, 2)

    def test_stores_processed_output(self):
        test_process = TestProcess()
        processing.process_documents(self._get_stream(2), test_process)

        first = [file for file in os.listdir(self._root.name) if "Augustus0" in file]
        self.assertEqual(len(first), 1)
        self.assertIn("TestProcess", first[0])
        with open(os.path.join(self._root.name, first[0]), "r") as f:
            self.assertIn("Test Octavianus0_0", f.read())

        second = [file for file in os.listdir(self._root.name) if "Augustus1" in file]
        self.assertEqual(len(second), 1)
        self.assertIn("TestProcess", second[0])
        with open(os.path.join(self._root.name, second[0]), "r") as f:
            self.assertIn("Test Octavianus1_0", f.read())

    def test_returns_document_results(self):
        test_process = TestProcess()

        results = processing.process_documents(self._get_stream(2, 2), test_process)

        self.assertEqual(len(results), 2)
        self.assertEqual(len(results[0].section_results), 2)
        self.assertEqual(len(results[1].section_results), 2)


if __name__ == "__main__":
    unittest.main()
