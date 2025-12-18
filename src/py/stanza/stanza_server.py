import logging
import json
import signal
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler


class _StanzaServer(HTTPServer):
    def __init__(self, address, handler, nlp):
        """
        Initialize the Stanza server.

        Args:
            address: Address tuple (host, port)
            handler: HTTP request handler class
            nlp: pre-loaded Stanza NLP model.
        """
        self.nlp = nlp
        super().__init__(address, handler)


class _LemmaHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers["Content-Length"])
        content_type = self.headers["Content-Type"]
        data = self.rfile.read(content_length)
        if content_type == "application/json":
            input = json.loads(data)
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Content-Type must be application/json")
            return
        doc = self.server.nlp(input)  # pytype: disable=attribute-error

        result = []
        for sentence in doc.sentences:
            for token in sentence.words:
                result.append((token.text, token.lemma, str(token.feats)))

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode("utf-8"))


def create_server(nlp, port: int):
    """
    Create and return a LatinCy server instance ready to be started.

    Args:
        nlp:  pre-loaded spaCy NLP model.
        port: Port number for the server (default: 8000, can be overridden by PORT env var)

    Returns:
        An HTTP server instance that can analyze Latin text
    """
    return _StanzaServer(("0.0.0.0", port), _LemmaHandler, nlp)


if __name__ == "__main__":
    import stanza  # type: ignore # pytype: disable=import-error

    logging.basicConfig(level=logging.INFO)

    def signal_handler(_signal, _frame):
        logging.info("Shutting down Stanza server")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logging.info("Starting Latin Stanza server on port 8000")
    create_server(
        stanza.Pipeline(
            "la",
            processors="tokenize,pos,lemma",
            use_gpu=False,
            download_method=None,
            tokenize_pretokenized=True,
        ),
        8000,
    ).serve_forever()
