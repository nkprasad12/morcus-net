"""Utilities for tokenization and token conversion logic."""

import dataclasses
import enum

# TODO: Should we have a separate category for sentence enders?
_PUNCTUATION = ".!?‘’”“—,'\"-;:[]()"


class TokenType(enum.Enum):
    WORD = 1
    PUNCTUATION = 2
    OTHER = 3

    @classmethod
    def for_character(cls, char: str) -> "TokenType":
        if char.isalnum():
            return TokenType.WORD
        elif char in _PUNCTUATION:
            return TokenType.PUNCTUATION
        else:
            return TokenType.OTHER


@dataclasses.dataclass
class Token:
    """Represents a token.

    Attributes:
        text: The text of the token only (not the full document).
        start: The index of the first character of this token in the full document, inclusive.
        end: The index of this final character of this token in the full document, exclusive.
        kind: The type of this token.
    """

    text: str
    start: int
    end: int
    kind: TokenType


def tokenize(input: str) -> "list[Token]":
    """Tokenizes the input.

    Every character from the original string is preserved in the final string,
    so not every token will be an actual (natural language) word.
    """
    if not input:
        return []
    characters = enumerate(iter(input))
    _, first = next(characters)
    tokens: "list[Token]" = []

    token = Token(first, 0, -1, TokenType.for_character(first))
    for i, c in characters:
        kind = TokenType.for_character(c)
        if (token.kind == kind) and (kind == TokenType.WORD):
            token.text += c
        else:
            token.end = i
            tokens.append(token)
            token = Token(c, i, -1, kind)

    token.end = len(input)
    tokens.append(token)

    return tokens
