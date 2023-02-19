import abc
import os
import re
import time
from typing import Optional

import json

from src.py.utils import data
from src.py.utils import perseus_parser

_SOURCE_ROOT = "texts/latin"


class Pipeline(abc.ABC):
    def __init__(
        self,
        source_root: str = _SOURCE_ROOT,
        source_filter: str = r"lat\d\.xml",
        version_tag: Optional[str] = None,
        debug: bool = False,
    ):
        self._source_root = source_root
        self._source_filter = source_filter
        self._version_tag = version_tag
        self._max_segments: Optional[int] = None
        self._debug = True
        if debug:
            self._source_filter = "phi0448.phi001.perseus-lat2.xml"
            self._version_tag = "debug"
            self._max_segments = 1

    def initialize(self) -> None:
        """Initialize shared state, for example for the processer."""

    @abc.abstractmethod
    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        """Processes the input text."""

    def parse(self, source_file: str) -> "list[data.TextPart]":
        """The pipeline section for parsing files from disk."""
        print(f"Parsing file: {source_file}")
        return perseus_parser.parse_perseus_xml(source_file)

    def store(self, source_file: str, result: "list[data.ProcessedPart]") -> None:
        base = "processed_texts"
        if self._version_tag is not None:
            base = os.path.join(base, self._version_tag)
        dest_file = os.path.join(base, source_file)
        print(f"Writing to: {dest_file}")

        os.makedirs(os.path.dirname(dest_file), exist_ok=True)
        with open(dest_file, "w+") as f:
            json.dump(result, f, cls=data.JSONEncoder, ensure_ascii=False, indent=2)

    def _process_document(self, source_file: str) -> None:
        print(f"====================")
        print(f"Processing {source_file}")
        parts = self.parse(source_file)
        if self._max_segments is not None:
            print(f"Processing only {self._max_segments} segment(s)")
            parts = parts[: self._max_segments]
        results = []
        start_time = time.time()
        for i, part in enumerate(parts):
            results.append(self.process_text(part))
            print(f"\nPart {i + 1} of {len(parts)} completed.")
            elapsed = time.time() - start_time
            print(f"Elapsed time: {elapsed} seconds.")
            print(f"Expected time: {elapsed * len(parts) / (i + 1)} seconds")
        self.store(source_file, results)
        print(f"====================")

    def run(self) -> None:
        print("Running pipeline initialization")
        self.initialize()

        print(f"Finding files from {self._source_root} matching {self._source_filter}")
        pattern = re.compile(self._source_filter)
        for root, _, files in os.walk(self._source_root):
            for file in files:
                if not re.match(pattern, file):
                    continue
                full_path = os.path.join(root, file)
                self._process_document(full_path)


class Alatius(Pipeline):
    def initialize(self) -> None:
        # pytype: disable=import-error
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error
        self._macronizer = Macronizer()

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        result = self._macronizer.macronize(text_part.text)
        return data.ProcessedPart(text_part, result)


class CltkDefault(Pipeline):
    def initialize(self) -> None:
        import cltk  # pytype: disable=import-error

        self._nlp = cltk.NLP(language="lat")
        self._nlp.analyze("ego")

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        print("TODO: actually do something here.")
        self._nlp.analyze(text_part.text)
        return data.ProcessedPart(text_part, "")
