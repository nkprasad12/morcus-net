import unittest

from src.py.nlp.tokenization import from_lamon
from src.py.nlp.tokenization import tokenize
from src.py.nlp.tokenization import Token
from src.py.nlp.tokenization import TokenType


class TestTokenType(unittest.TestCase):
    def test_for_character_accepts_macrons(self):
        actual = TokenType.for_character("ā")
        expected = TokenType.WORD
        self.assertEqual(actual, expected)

    def test_for_character_handles_puncuation(self):
        actual = TokenType.for_character(".")
        expected = TokenType.PUNCTUATION
        self.assertEqual(actual, expected)

    def test_for_character_handles_spaces(self):
        actual = TokenType.for_character("\n")
        expected = TokenType.OTHER
        self.assertEqual(actual, expected)


class TestTokenize(unittest.TestCase):
    def test_handles_first_character(self):
        tokens = tokenize("Gallia est")

        self.assertEqual(tokens[0].start, 0)
        self.assertEqual(tokens[0].text, "Gallia")

    def test_handles_last_token(self):
        tokens = tokenize("Gallia est")

        self.assertEqual(tokens[-1].end, 10)
        self.assertEqual(tokens[-1].text, "est")

    def test_splits_chunked_punctuation(self):
        tokens = tokenize("Gallia).")

        self.assertEqual(len(tokens), 3)
        self.assertEqual(tokens[1].text, ")")
        self.assertEqual(tokens[2].text, ".")

    def test_has_expected_output(self):
        tokens = tokenize("[quod Gallia,")

        self.assertEqual(len(tokens), 5)
        self.assertEqual(tokens[0], Token("[", 0, 1, TokenType.PUNCTUATION))
        self.assertEqual(tokens[1], Token("quod", 1, 5, TokenType.WORD))
        self.assertEqual(tokens[2], Token(" ", 5, 6, TokenType.OTHER))
        self.assertEqual(tokens[3], Token("Gallia", 6, 12, TokenType.WORD))
        self.assertEqual(tokens[4], Token(",", 12, 13, TokenType.PUNCTUATION))


class TestFromLamon(unittest.TestCase):
    def test_has_expected_tokens(self):
        input = 'dixit, "Gallia est" '
        lamon_tokens = [
            (0, 5, "dico", "v3sria---"),
            (5, 6, ",", "---------"),
            (7, 8, '"', "---------"),
            (8, 14, "Gallius", "a-s---fnp"),
            (15, 18, "sum", "v3spia---"),
            (18, 19, '"', "---------"),
        ]

        result = from_lamon(input, lamon_tokens)

        self.assertEqual(len(result), 9)
        self.assertEqual(result[0], Token("dixit", 0, 5, TokenType.WORD))
        self.assertEqual(result[1], Token(",", 5, 6, TokenType.PUNCTUATION))
        self.assertEqual(result[2], Token(" ", 6, 7, TokenType.OTHER))
        self.assertEqual(result[3], Token('"', 7, 8, TokenType.PUNCTUATION))
        self.assertEqual(result[4], Token("Gallia", 8, 14, TokenType.WORD))
        self.assertEqual(result[5], Token(" ", 14, 15, TokenType.OTHER))
        self.assertEqual(result[6], Token("est", 15, 18, TokenType.WORD))
        self.assertEqual(result[7], Token('"', 18, 19, TokenType.PUNCTUATION))
        self.assertEqual(result[8], Token(" ", 19, 20, TokenType.OTHER))


if __name__ == "__main__":
    unittest.main()
