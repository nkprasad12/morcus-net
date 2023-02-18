import time

from src.libs.latin_macronizer.macronizer_modified import (
    Macronizer,
)  # pytype: disable=attribute-error

from src.py.utils import perseus_parser


def run(file_path: str) -> None:
    """Runs the processing pipeline on the input XML file."""
    text_data = perseus_parser.parse_perseus_xml(file_path)
    macronizer = Macronizer()
    start_time = time.time()
    for i, part in enumerate(text_data):
        print(part)
        print(macronizer.macronize(part.text))
        print(f"Part {i + 1} of {len(text_data)} completed.")
        elapsed = time.time() - start_time
        print(f"Elapsed time: {elapsed} seconds.")
        print(f"Expected time: {elapsed * len(text_data) / (i + 1)} seconds")
