import abc
import dataclasses
import json
import os
import time
from typing import Callable, Generic, Sequence, TypeVar

from src.py.nlp import tokenization
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

    def name(self) -> str:
        return self.__class__.__name__

    @abc.abstractmethod
    def process(self, input: I) -> O:
        """Processes the input."""

    @classmethod
    def from_callable(cls, callable: Callable[[I], O]) -> "Process[I, O]":
        class ProcessFromCallable(Process[U, V]):
            def process(self, input: U) -> V:
                return callable(input)

            def name(self) -> str:
                return callable.__name__

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
        print(f"Processing section: {section_id}")
        print(f"Characters: {len(section.text)}")
        start = time.time()
        output = process.process(section.text)
        document_result.add(
            results.SectionResult(
                input=section.text,
                output=output,
                section_id=section_id,
                processor=process.name(),
                runtime=time.time() - start,
            )
        )
    return document_result


def process_documents(
    documents: results.DocumentStream, process: Process[str, O]
) -> "list[results.DocumentResult[O]]":
    """Processes a stream of documents with the given process."""
    processor = process.name()
    _print_with_banners(f"Processing with {processor}")
    if not process.initialized:
        start = time.time()
        process.initialize()
        print(f"{processor} initialize took {time.time() - start:.3f} seconds.")

    document_results = []
    total_time = 0
    for document in documents:
        document_result = _process_document(document, process)
        total_time += document_result.runtime
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
    _print_with_banners(f"{processor} took {total_time:.3f} seconds on all documents.")
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


def _get_words(text: str) -> "list[str]":
    tokens = tokenization.tokenize(text)
    return [token.text for token in tokens if token.kind == tokenization.TokenType.WORD]


def _print_accuracy(errors: int, total: int, tag: str) -> None:
    accuracy = str(100 * (1 - (errors / total)))[:4]
    print(f"{tag}: {errors} / {total} incorrect, {accuracy}% accurate.")


@dataclasses.dataclass
class ErrorReport:
    total_words: int
    errors: "list[dict[str, str]]"


@dataclasses.dataclass
class SectionEvaluation:
    golden: str
    versions: "list[results.SectionResult]" = dataclasses.field(default_factory=list)

    def errors(self) -> ErrorReport:
        golden_tokens = _get_words(self.golden)
        expected_num = len(golden_tokens)
        versions = []
        for version in self.versions:
            version_tokens = _get_words(version.output)
            assert len(version_tokens) == expected_num
            versions.append((version.processor, version_tokens))

        errors = []
        for i, token in enumerate(golden_tokens):
            error = {"Golden": token}
            for processor, candidate_tokens in versions:
                candidate_token = candidate_tokens[i]
                if candidate_token != token:
                    error[processor] = candidate_token
            if len(error) > 1:
                errors.append(error)

        return ErrorReport(total_words=expected_num, errors=errors)


@dataclasses.dataclass
class DocumentReport:
    original: results.StorableDocument
    sections: "list[SectionEvaluation]"


def evaluate_macronization(
    macronized_documents: results.DocumentStream,
    processes: Sequence[Process[str, str]],
) -> "list[DocumentReport]":
    """Evaluates accuracy on macronization processes.

    Args:
      macronized_documents: A stream of pre-macronized documents.
      processes: The processes to evaluate. These must output macronized text.

    Returns:
      The error reports for each document.
    """
    macronized = list(macronized_documents)
    unmacronizer = Process.from_callable(strings.remove_macrons)
    unmacronized = list(as_input(process_documents(macronized, unmacronizer)))
    results = [process_documents(unmacronized, process) for process in processes]

    reports: "list[DocumentReport]" = []
    for doc_num, macronized_document in enumerate(macronized):
        section_evals = []
        for section_num, macronized_section in enumerate(macronized_document.document):
            section_eval = SectionEvaluation(golden=macronized_section.text)
            for processor_results in results:
                processed_document = processor_results[doc_num]
                assert processed_document.name == macronized_document.name
                processed_section = processed_document.section_results[section_num]
                # TODO: Check that the section ids match.
                section_eval.versions.append(processed_section)
            section_evals.append(section_eval)
        reports.append(DocumentReport(macronized_document, section_evals))

    for report in reports:
        total_words = 0
        doc_counts = {process.name(): 0 for process in processes}
        _print_with_banners(f"Report for {report.original.name}")
        for section_report in report.sections:
            _print_with_banners(f"Section Errors", "-")
            section_counts = {process.name(): 0 for process in processes}
            section_errors = section_report.errors()
            total_words += section_errors.total_words
            for error in section_errors.errors:
                message = f"Expected `{error['Golden']}`\n"
                for process in processes:
                    processor = process.name()
                    if processor not in error:
                        continue
                    section_counts[processor] += 1
                    message += f"- Got `{error[processor]}` from {processor}\n"
                print(message)
            for process in processes:
                section_count = section_counts[process.name()]
                doc_counts[process.name()] += section_count
                _print_accuracy(
                    section_count, section_errors.total_words, process.name()
                )
        _print_with_banners(f"Summary for {report.original.name}", "-")
        ref_version, ref_errors = None, None
        for process in processes:
            doc_count = doc_counts[process.name()]
            _print_accuracy(doc_count, total_words, process.name())
            if ref_version is None:
                ref_version = process.name()
                ref_errors = doc_count
            else:
                delta = 100 * (doc_count - ref_errors) / ref_errors
                comparator = "FEWER" if delta < 0 else "MORE"
                delta = str(abs(delta))[:4]
                print(
                    f"- {process.name()} has {delta}% {comparator} errors than {ref_version}"
                )
    return reports
