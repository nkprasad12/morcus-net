from src.py.utils import data

import dataclasses
from typing import Generic, TypeVar

O = TypeVar("O")


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
