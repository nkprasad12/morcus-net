import abc
import json
import os
import time
from typing import Generic, TypeVar

from src.py.utils import data
from src.py.utils import document_streams
from src.py.utils import results

I = TypeVar("I")
O = TypeVar("O")


class Process(Generic[I, O], abc.ABC):
    """Defines a piece of a processing pipeline."""

    initialized: bool = False

    def initialize(self) -> None:
        """One-time initialization required for the pipeline."""
        self.initialized = True

    @abc.abstractmethod
    def process(self, input: I) -> O:
        """Processes the input."""


def _print_with_banners(message: str, banner_char="=") -> None:
    banner = banner_char * len(message)
    print(f"\n{banner}\n{message}\n{banner}")


def _process_document(
    document: document_streams.StorableDocument, process: Process[str, O]
) -> results.DocumentResult[O]:
    """Process a single document using an initialized processor."""
    assert process.initialized
    _print_with_banners(f"Processing document: {document.name}", banner_char="-")
    # TODO: Add batch mode.
    document_result = results.DocumentResult(document.name)
    for section in document.document:
        section_id = data.SectionId(section.book, section.chapter, section.section)
        _print_with_banners(f"Processing section: {section_id}", banner_char="-")
        start = time.time()
        output = process.process(section.text)
        document_result.add(
            results.SectionResult(
                input=section.text,
                output=output,
                section_id=section_id,
                processor=process.__class__.__name__,
                runtime=time.time() - start,
            )
        )
    return document_result


def process_documents(
    documents: document_streams.DocumentStream, process: Process[str, O]
) -> "list[results.DocumentResult[O]]":
    processor = process.__class__.__name__
    _print_with_banners(f"Processing with {processor}")
    start = time.time()
    process.initialize()
    print(f"{processor} initialize took {time.time() - start:.3f} seconds.")

    document_results = []
    for document in documents:
        document_result = _process_document(document, process)
        _print_with_banners(f"{processor} took {document_result.runtime:.3f} seconds.")
        safe_doc_name = "".join(c for c in document.name if c.isalnum())
        outfile = os.path.join(document.outputs_dir, f"{safe_doc_name}.{processor}.txt")
        os.makedirs(os.path.dirname(outfile), exist_ok=True)
        section_results = [
            section.output for section in document_result.section_results
        ]
        with open(outfile, "w+") as f:
            json.dump(
                section_results, f, cls=data.JSONEncoder, ensure_ascii=False, indent=2
            )
        document_results.append(document_result)

    return document_results
