import os
import tempfile
from typing import Iterator
import unittest
from unittest import mock

from src.py.utils import data
from src.py.utils import results
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


def silly_function(_: str) -> str:
    return "silly"


class TestBaseProcess(unittest.TestCase):
    def test_sets_initialized(self):
        process = TestProcess()
        self.assertFalse(process.initialized)

        process.initialize()
        self.assertTrue(process.initialized)

    def test_from_callable_is_initialized(self):
        process = processing.Process.from_callable(mock.MagicMock())
        self.assertTrue(process.initialized)

    def test_from_callable_defers_to_callable(self):
        callable = mock.MagicMock()
        process = processing.Process.from_callable(callable)

        process.process("Ovidius")

        callable.assert_called_once_with("Ovidius")

    def test_from_callable_has_expected_name(self):
        process = processing.Process.from_callable(silly_function)
        self.assertEqual(process.name(), "silly_function")


class TestProcessDocuments(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._root = tempfile.TemporaryDirectory()

    def tearDown(self) -> None:
        super().tearDown()
        self._root.cleanup()

    def _get_stream(
        self, documents: int, sections: int = 1
    ) -> Iterator[results.StorableDocument]:
        for i in range(documents):
            text_parts = []
            for j in range(sections):
                text_parts.append(data.TextPart(0, 0, j, f"Octavianus{i}_{j}"))
            yield results.StorableDocument(
                document=text_parts,
                name=f"Augustus{i}",
                outputs_dir=self._root.name,
            )

    def test_skips_initialization_if_not_needed(self):
        test_process = TestProcess()
        test_process.initialized = True

        processing.process_documents(self._get_stream(1, 1), test_process)

        self.assertEqual(test_process.initialize_calls, 0)
        self.assertEqual(test_process.process_calls, 1)

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


class TestAsInput(unittest.TestCase):
    def _get_results(
        self, documents: int, sections: int
    ) -> Iterator[results.DocumentResult]:
        for i in range(documents):
            section_results = []
            for j in range(sections):
                section_results.append(
                    results.SectionResult(
                        input=f"Octavianus{i}_{j}",
                        output=f"Augustus{i}_{j}",
                        section_id=data.SectionId(0, 0, j),
                        runtime=1,
                        processor="Unittest",
                    )
                )
            yield results.DocumentResult(
                name=f"Augustus{i}",
                outputs_dir=f"/foo{i}",
                section_results=section_results,
            )

    def test_moves_outputs_to_inputs(self):
        result_docs = list(self._get_results(2, 2))

        as_input = list(processing.as_input(result_docs))

        self.assertEqual(len(as_input), len(result_docs))
        self.assertEqual(len(as_input[0].document), len(result_docs[0].section_results))
        self.assertEqual(
            as_input[0].document[0].text, result_docs[0].section_results[0].output
        )


class TestSectionEvaluation(unittest.TestCase):
    def test_reports_total_words(self):
        report = processing.SectionEvaluation("Gallia est omnis", []).errors()
        self.assertEqual(report.total_words, 3)

    def test_reports_correct_errors(self):
        id = data.SectionId(0, 0, 0)
        antony = results.SectionResult("", "Galliā est omnīs", id, 0, "Antony")
        crassus = results.SectionResult("", "Gallia est ōmnis", id, 0, "Crassus")

        report = processing.SectionEvaluation("Gallia est omnis", [antony, crassus])
        errors = report.errors().errors
        print(errors)

        self.assertEqual(len(errors), 2)
        gallia = errors[0]
        self.assertEqual(len(gallia), 2)
        self.assertEqual(gallia["Golden"], "Gallia")
        self.assertEqual(gallia["Antony"], "Galliā")
        omnis = errors[1]
        self.assertEqual(len(omnis), 3)
        self.assertEqual(omnis["Golden"], "omnis")
        self.assertEqual(omnis["Antony"], "omnīs")
        self.assertEqual(omnis["Crassus"], "ōmnis")


if __name__ == "__main__":
    unittest.main()
