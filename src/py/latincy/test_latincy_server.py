import dataclasses
import threading
import json
import time
import socket
import unittest
import urllib.request
from unittest.mock import Mock

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

    def test_create_server_functionality(self):
        """Test the server created by create_server can process text."""
        # Setup mock for spacy
        mock_nlp = Mock()
        fake_tokens = [
            _FakeToken("Gallia", "Gallia", "Case=Nom|Gender=Fem|Number=Sing"),
            _FakeToken("est", "sum", "Mood=Ind|Number=Sing|Tense=Pres"),
        ]
        mock_nlp.return_value = fake_tokens
        port = _find_free_port()

        # Create a server with our specified port using the public function
        server = latincy_server.create_server(mock_nlp, port)

        # Start server in a separate thread
        server_thread = threading.Thread(target=server.serve_forever)
        server_thread.daemon = True
        server_thread.start()

        try:
            # Give the server a moment to start
            time.sleep(0.1)

            # Send a request to the server using urllib.request instead of requests
            url = f"http://localhost:{port}"
            test_text = "Gallia est"
            data = test_text.encode("utf-8")
            req = urllib.request.Request(url, data=data, method="POST")
            with urllib.request.urlopen(req) as response:
                # Check the response
                self.assertEqual(response.status, 200)
                self.assertEqual(response.getheader("Content-Type"), "application/json")

                # Read and parse the JSON response
                response_data = response.read().decode("utf-8")
                result = json.loads(response_data)

                self.assertEqual(len(result), 2)
                self.assertEqual(result[0]["text"], "Gallia")
                self.assertEqual(result[0]["lemma"], "Gallia")
                self.assertEqual(result[1]["text"], "est")
                self.assertEqual(result[1]["lemma"], "sum")

        finally:
            # Clean up: shut down the server
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
