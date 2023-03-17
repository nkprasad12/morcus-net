import logging
import socket
import struct

from src.py.utils import processes


_HOST = "127.0.0.1"  # Standard loopback interface address (localhost)


def start(on_listen: str, use_gpu: bool = False) -> None:
    model = processes.StanzaCustomTokenization(use_gpu=use_gpu)
    model.initialize()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((_HOST, 0))
        s.listen()
        logging.warning(f"{on_listen} {s.getsockname()[1]}")
        conn, addr = s.accept()
        with conn:
            logging.warning(f"Py TCP Server: Connected {addr}")
            while True:
                header = conn.recv(4)
                if not header:
                    logging.warning(f"Py TCP Server: Disconnected")
                    break
                logging.warning("Py TCP Server: Header received")
                (length,) = struct.unpack(">L", header)
                logging.warning(f"Expecting {length} bytes")
                num_bytes_read = 0
                input_chunks = []
                while num_bytes_read < length:
                    input_chunks.append(conn.recv(length - num_bytes_read))
                    num_bytes_read += len(input_chunks[-1])
                logging.warning("Py TCP Server: Processing")
                result = model.process(b"".join(input_chunks).decode("utf-8"))
                conn.sendall(result.encode("utf-8"))
