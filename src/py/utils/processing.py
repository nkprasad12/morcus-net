import abc
import json
import os
import time
from typing import Callable, Generic, Sequence, TypeVar

from src.py.utils import data
from src.py.utils import results
from src.py.utils import strings

I = TypeVar("I")
O = TypeVar("O")

U = TypeVar("U")
V = TypeVar("V")


class Process(Generic[I, O], abc.ABC):
    """Defines a piece of a processing pipeline."""

    initialized: bool = False

    def initialize(self) -> None:
        """One-time initialization required for the pipeline."""
        self.initialized = True

    @abc.abstractmethod
    def process(self, input: I) -> O:
        """Processes the input."""

    @classmethod
    def from_callable(cls, callable: Callable[[I], O]) -> "Process[I, O]":
        class ProcessFromCallable(Process[U, V]):
            def process(self, input: U) -> V:
                return callable(input)

        process = ProcessFromCallable()
        process.initialize()
        return process


def _print_with_banners(message: str, banner_char="=") -> None:
    banner = banner_char * len(message)
    print(f"\n{banner}\n{message}\n{banner}")


def _process_document(
    document: results.StorableDocument, process: Process[str, O]
) -> results.DocumentResult[O]:
    """Process a single document using an initialized processor."""
    assert process.initialized
    _print_with_banners(f"Processing document: {document.name}", banner_char="-")
    # TODO: Add batch mode.
    document_result = results.DocumentResult.for_document(document)
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
    documents: results.DocumentStream, process: Process[str, O]
) -> "list[results.DocumentResult[O]]":
    """Processes a stream of documents with the given process."""
    processor = process.__class__.__name__
    _print_with_banners(f"Processing with {processor}")
    if not process.initialized:
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


def as_input(
    processed_documents: Sequence[results.DocumentResult[str]],
) -> results.DocumentStream:
    """Converts a sequence of processed documents into inputs."""
    for processed_document in processed_documents:
        sections = []
        for section in processed_document.section_results:
            sections.append(
                data.TextPart(
                    book=section.section_id.book,
                    chapter=section.section_id.chapter,
                    section=section.section_id.section,
                    text=section.output,
                )
            )
        yield results.StorableDocument(
            document=sections,
            name=processed_document.name,
            outputs_dir=processed_document.outputs_dir,
        )
