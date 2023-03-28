"""Utilities for tokenization and token conversion logic."""

import dataclasses
import enum

# pytype: disable=import-error
try:
    from src.libs.latin_macronizer import macronizer_modified
except:
    print(
        "Failed to load `macronizer_modified`. Use `npm run setup-alatius` to load it."
    )
# pytype: enable=import-error

_PUNCTUATION = ".!?‘’”“—,'\"-;:[]()"
_SENTENCE_ENDS = ".;:?!"


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


def from_lamon(
    input: str, lamon_tokens: "list[tuple[int, int, str, str]]"
) -> "list[Token]":
    tokens: "list[Token]" = []
    last_end = 0
    for start, end, _, _ in lamon_tokens:
        if start != last_end:
            tokens.append(
                Token(input[last_end:start], last_end, start, TokenType.OTHER)
            )
        token_type = TokenType.for_character(input[start])
        tokens.append(Token(input[start:end], start, end, token_type))
        last_end = end
    n = len(input)
    if last_end != n:
        tokens.append(Token(input[last_end:n], last_end, n, TokenType.OTHER))
    return tokens


def to_alatius(tokens: "list[Token]") -> "macronizer_modified.Tokenization":
    alatius_tokens = [
        macronizer_modified.Token(token.text, start=token.start) for token in tokens
    ]
    last_punctuation = None
    for token, alatius_token in zip(tokens, alatius_tokens):
        if token.kind == TokenType.OTHER:
            alatius_token.isspace = True
        elif token.text in _SENTENCE_ENDS:
            last_punctuation = alatius_token
        elif token.kind == TokenType.WORD and last_punctuation is not None:
            last_punctuation.endssentence = True
            last_punctuation = None
            alatius_token.startssentence = True
    result = macronizer_modified.Tokenization("")
    result.tokens = alatius_tokens
    return result


def to_stanza(tokens: "list[Token]") -> "list[list[str]]":
    sentences: list[list[str]] = []
    current_sentence: list[str] = []
    for token in tokens:
        if token.kind == TokenType.OTHER:
            continue
        current_sentence.append(token.text)
        if token.text in _SENTENCE_ENDS:
            sentences.append(current_sentence)
            current_sentence = []
    if current_sentence:
        sentences.append(current_sentence)
    return sentences
