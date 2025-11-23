import math
import os
import re
from typing import Iterator, Union

from src.py.utils import data
from src.py.utils import results

_OUTPUT_ROOT = "processed_texts"

Number = Union[float, int]


def _search_root(
    root: str, filter: str = ".*", limit: Number = float("inf")
) -> Iterator[str]:
    """Finds files in a directory with the given pattern.

    Args:
      root: The root directory to search (recursively).
      filter: A regex to filter files.

    Yields:
      A full path to a matching file.
    """
    print(f"Finding files in `{root}` matching `{filter}` (limit {limit})")
    pattern = re.compile(filter)
    found = 0
    for root, _, files in os.walk(root):
        for file in files:
            if found >= limit:
                break
            if not re.search(pattern, file):
                continue
            found += 1
            yield os.path.join(root, file)


def _parse_file(file_path: str) -> results.Document:
    """Parses the given input file based on extension."""
    if file_path.endswith(".txt"):
        with open(file_path, "r") as f:
            return [data.TextPart(0, 0, 0, f.read())]
    raise RuntimeError("Unknown file type: %s", file_path)


def from_directory(
    root: str,
    filter: str = ".*",
    doc_limit: Number = float("inf"),
    tag: str = "debug",
) -> results.DocumentStream:
    """A stream of documents from a directory.

    Args:
      root: The root directory to search (recursively).
      filter: A regex pattern to match candidate files.
      doc_limit: The maximum number of documents that will be produced.
      tag: A tag used in the output files to disambiguate between runs.
    """
    for file_path in _search_root(root, filter, doc_limit):
        dir_for_file = file_path
        last_dot = file_path.rfind(".")
        if last_dot > 0:
            dir_for_file = file_path[:last_dot]
        if dir_for_file.startswith("/"):
            dir_for_file = dir_for_file[1:]
        out_dir = os.path.join(_OUTPUT_ROOT, tag, dir_for_file)
        yield results.StorableDocument(
            document=_parse_file(file_path),
            name=file_path.split(os.path.sep)[-1],
            outputs_dir=out_dir,
        )


def for_text(text: str, tag: str) -> results.DocumentStream:
    """A simple stream wrapping wrap input text.

    Args:
      text: The raw input text to process.
      title: A tag for the text that will be used for storage.
    """
    yield results.StorableDocument(
        document=[data.TextPart(0, 0, 0, text)],
        name=tag,
        outputs_dir=os.path.join(_OUTPUT_ROOT, "raw_text", tag),
    )


def for_list(text_list: "list[str]", tag: str) -> results.DocumentStream:
    """A simple stream wrapping wrap input text.

    Args:
      text: The raw input text to process.
      title: A tag for the text that will be used for storage.
    """
    for i, text in enumerate(text_list):
        yield results.StorableDocument(
            document=[data.TextPart(0, 0, i, text)],
            name=tag,
            outputs_dir=os.path.join(_OUTPUT_ROOT, "raw_text", tag, f"part{i}"),
        )
