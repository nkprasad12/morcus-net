import dataclasses
import json


@dataclasses.dataclass(order=True)
class TextPart:
    book: int
    chapter: int
    section: int
    text: str


@dataclasses.dataclass
class ProcessedPart:
    original: TextPart
    output: str


class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        return super().default(o)
