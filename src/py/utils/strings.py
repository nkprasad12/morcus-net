_MACRONS = {
    "ā": "a",
    "ē": "e",
    "ī": "i",
    "ō": "o",
    "ū": "u",
    "ȳ": "y",
    "Ā": "A",
    "Ē": "E",
    "Ī": "I",
    "Ō": "O",
    "Ū": "U",
    "Ȳ": "Y",
}


def remove_macrons(input: str) -> str:
    """Removes macrons from an input raw text."""
    output = input
    for marked, unmarked in _MACRONS.items():
        output = output.replace(marked, unmarked)
    return output
