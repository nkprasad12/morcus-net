import dataclasses
import json
import unittest

from src.py.utils import data


_AENEID = "Arma virumque"


@dataclasses.dataclass
class A:
    a: str


@dataclasses.dataclass
class B:
    a: A


class TestJsonEncoder(unittest.TestCase):
    def test_encoder_handles_dataclasses(self):
        input = A(_AENEID)
        result = json.loads(json.dumps(input, cls=data.JSONEncoder))
        self.assertEqual(result["a"], _AENEID)

    def test_encoder_handles_nesting(self):
        input = B(A(_AENEID))
        result = json.loads(json.dumps(input, cls=data.JSONEncoder))
        self.assertEqual(result["a"]["a"], _AENEID)


if __name__ == "__main__":
    unittest.main()
