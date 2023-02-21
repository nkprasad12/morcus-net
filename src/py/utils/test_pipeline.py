import os
import shutil
import unittest

from src.py.utils import data
from src.py.utils import pipeline


class TestPipeline(pipeline.Pipeline):
    initialize_calls: int = 0
    process_calls: int = 0

    def initialize(self) -> None:
        self.initialize_calls += 1

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        self.process_calls += 1
        return data.ProcessedPart(text_part, "TestPipeline")


class TestStringMethods(unittest.TestCase):
    def _cleanup(self) -> None:
        try:
            shutil.rmtree("processed_texts/unittest", ignore_errors=True)
        except FileNotFoundError:
            pass

    def setUp(self) -> None:
        super().setUp()
        self._cleanup()

    def tearDown(self) -> None:
        super().tearDown()
        self._cleanup()

    def test_writes_to_correct_subdir(self):
        test_pipeline = TestPipeline(
            source_root="testdata/perseus", version_tag="unittest", source_filter=".xml"
        )
        test_pipeline.run()
        self.assertTrue(os.path.isdir("processed_texts/unittest"))

    def test_only_calls_init_once(self):
        test_pipeline = TestPipeline(
            source_root="testdata/perseus", version_tag="unittest", source_filter=".xml"
        )
        test_pipeline.run()
        self.assertEqual(test_pipeline.initialize_calls, 1)

    def test_respects_max_segments(self):
        test_pipeline = TestPipeline(
            source_root="testdata/perseus",
            version_tag="unittest",
            source_filter="doc_with_splits.xml",
            max_segments=2,
        )
        test_pipeline.run()
        self.assertEqual(test_pipeline.process_calls, 2)


if __name__ == "__main__":
    unittest.main()
