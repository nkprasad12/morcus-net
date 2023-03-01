import sys

from src.py.nlp import server

mode = sys.argv[1]

if mode == "--server":
    server.start(int(sys.argv[2]), sys.argv[3])
