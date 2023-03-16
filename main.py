import sys

from src.py.nlp import server

mode = sys.argv[1]

if mode == "--server":
    server.start(sys.argv[2], "--gpu" in sys.argv)
