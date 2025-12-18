import dataclasses
import threading
import json
import time
import socket
import unittest
import urllib.request
from unittest.mock import Mock, ANY

from src.py.latincy import latincy_server


def _find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("0.0.0.0", 0))
        return s.getsockname()[1]


@dataclasses.dataclass
class _FakeToken:
    text: str
    lemma_: str
    morph: str


class TestLatincyServer(unittest.TestCase):
    """Test the public API of the latincy_server module."""

    port: int
    server: latincy_server._LatinCyServer
    server_thread: threading.Thread
    Doc: Mock

    def setUp(self):
        super().setUp()
        # Setup mock for spacy
        mock_nlp = Mock()
        fake_tokens = [
            _FakeToken("Gallia", "Gallia", "Case=Nom|Gender=Fem|Number=Sing"),
            _FakeToken("est", "sum", "Mood=Ind|Number=Sing|Tense=Pres"),
        ]
        mock_nlp.return_value = fake_tokens
        self.port = _find_free_port()

        # Create a server with our specified port using the public function
        self.Doc = Mock()
        self.server = latincy_server.create_server(mock_nlp, self.Doc, self.port)

        # Start server in a separate thread
        self.server_thread = threading.Thread(target=self.server.serve_forever)
        self.server_thread.daemon = True
        self.server_thread.start()
        time.sleep(0.1)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=5)
        super().tearDown()

    def _validateResponse(self, response):
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("Content-Type"), "application/json")

        response_data = response.read().decode("utf-8")
        result = json.loads(response_data)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0][0], "Gallia")
        self.assertEqual(result[0][1], "Gallia")
        self.assertEqual(result[1][0], "est")
        self.assertEqual(result[1][1], "sum")

    def test_handles_json(self):
        """Test the server created by create_server can process text."""
        url = f"http://localhost:{self.port}"
        headers = {"Content-Type": "application/json"}
        words = ["Gallia", " ", "est"]
        spaces = [False, True, False]
        data = json.dumps({"words": words, "spaces": spaces}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as response:
            self._validateResponse(response)
            self.Doc.assert_called_once_with(ANY, words=words, spaces=spaces)

    def test_handles_plain_text(self):
        """Test the server created by create_server can process text."""
        url = f"http://localhost:{self.port}"
        headers = {"Content-Type": "text/plain"}
        data = "Gallia est".encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as response:
            self._validateResponse(response)
            self.Doc.assert_not_called()


if __name__ == "__main__":
    unittest.main()
