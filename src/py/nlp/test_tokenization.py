import unittest

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


if __name__ == "__main__":
    unittest.main()
