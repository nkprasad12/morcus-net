import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler


class _LatinCyServer(HTTPServer):
    def __init__(self, address, handler, nlp):
        """
        Initialize the LatinCy server.

        Args:
            address: Address tuple (host, port)
            handler: HTTP request handler class
            nlp: pre-loaded spaCy NLP model.
        """
        self.nlp = nlp
        super().__init__(address, handler)

    def process(self, text: str) -> str:
        doc = self.nlp(text)
        result = []
        for token in doc:
            result.append(
                {"text": token.text, "lemma": token.lemma_, "morph": str(token.morph)}
            )
        return json.dumps(result)


class _LemmaHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers["Content-Length"])
        post_data = self.rfile.read(content_length).decode("utf-8")
        doc = self.server.nlp(post_data)

        result = []
        for token in doc:
            result.append(
                {"text": token.text, "lemma": token.lemma_, "morph": str(token.morph)}
            )

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
    return _LatinCyServer(("0.0.0.0", port), _LemmaHandler, nlp)


if __name__ == "__main__":
    import spacy

    create_server(spacy.load("la_core_web_lg"), 8000).serve_forever()
