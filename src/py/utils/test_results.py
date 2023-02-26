import unittest

from src.py.utils import data
from src.py.utils import results


_RESULT_A = results.SectionResult("a", "b", data.SectionId(0, 0, 1), 0.42, "Foo")
_RESULT_B = results.SectionResult("c", "d", data.SectionId(0, 0, 2), 0.69, "Foo")
_RESULT_C = results.SectionResult("e", "f", data.SectionId(0, 0, 3), 0.57, "Bar")


class TestDocumentResult(unittest.TestCase):
    def test_handles_empty_state(self):
        document_result = results.DocumentResult("Aeneid")

        self.assertIsNotNone(document_result.processor)
        self.assertAlmostEqual(document_result.runtime, 0)

    def test_handles_multiple_results(self):
        document_result = results.DocumentResult("Aeneid")

        document_result.add(_RESULT_A)
        document_result.add(_RESULT_B)

        self.assertEqual(document_result.processor, "Foo")
        self.assertAlmostEqual(document_result.runtime, 1.11)

    def test_rejects_mismatched_results(self):
        document_result = results.DocumentResult("Aeneid")
        document_result.add(_RESULT_A)

        with self.assertRaises(AssertionError):
            document_result.add(_RESULT_C)

    def test_from_factory_pipes_arguments(self):
        document = results.StorableDocument([], name="Aeneid", outputs_dir="/foo")
        output = results.DocumentResult.for_document(document)

        self.assertEqual(document.name, output.name)
        self.assertEqual(document.outputs_dir, output.outputs_dir)


if __name__ == "__main__":
    unittest.main()
