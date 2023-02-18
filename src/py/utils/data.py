import dataclasses


@dataclasses.dataclass(order=True)
class TextPart:
  book: int
  chapter: int
  section: int
  text: str