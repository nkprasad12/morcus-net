from src.py.utils import data

import dataclasses
from typing import Generic, Iterator, Optional, Sequence, TypeVar

O = TypeVar("O")


Document = Sequence[data.TextPart]


@dataclasses.dataclass
class StorableDocument:
    """A document which can be processed.

    Attributes:
      document: The document to process.
      name: The name of the document.
      outputs_dir: If set, the directory to which processing outputs
        will be written.
    """

    document: Document
    name: str
    outputs_dir: Optional[str] = None


DocumentStream = Iterator[StorableDocument]


@dataclasses.dataclass(frozen=True)
class SectionResult(Generic[O]):
    input: str
    output: O
    section_id: data.SectionId
    runtime: float
    processor: str


@dataclasses.dataclass
class DocumentResult(Generic[O]):
    name: str
    section_results: "list[SectionResult[O]]" = dataclasses.field(default_factory=list)
    outputs_dir: Optional[str] = None

    @classmethod
    def for_document(cls, document: StorableDocument) -> "DocumentResult":
        return DocumentResult(name=document.name, outputs_dir=document.outputs_dir)

    @property
    def runtime(self) -> float:
        return sum([section.runtime for section in self.section_results])

    @property
    def processor(self) -> str:
        if not self.section_results:
            return "No Results"
        return self.section_results[0].processor

    def add(self, section_result: SectionResult[O]) -> None:
        self.section_results.append(section_result)
        assert self.section_results[0].processor == section_result.processor
