import json
import logging
import socket

from src.py.utils import processes


_HOST = "127.0.0.1"  # Standard loopback interface address (localhost)


def start(on_listen: str) -> None:
    model = processes.StanzaCustomTokenization()
    model.initialize()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((_HOST, 0))
        s.listen()
        logging.warning(f"{on_listen} {s.getsockname()[1]}")
        conn, addr = s.accept()
        with conn:
            logging.warning(f"NLP_SERVER:CONNECTED {addr}")
            while True:
                raw_input = conn.recv(1024)
                logging.warning("NLP_SERVER:DATA_RECEIVED")
                if not raw_input:
                    logging.warning(f"NLP_SERVER:DISCONNECTED")
                    break
                logging.warning("NLP_SERVER:PROCESSING")
                conn.sendall(model.process(raw_input.decode()).encode())
