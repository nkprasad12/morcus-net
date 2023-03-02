# from src.py.ipc import socket_server

# socket_server.listen_for_data()

from src.py.utils import document_streams
from src.py.utils import processes
from src.py.utils import processing

# _ALL_LATIN = r"lat\d\.xml",
_PERSEUS_ROOT = "texts/latin"
_DBG_FILE = "phi0448.phi001.perseus-lat2.xml"


# documents = document_streams.from_directory(_PERSEUS_ROOT, _DBG_FILE, part_limit=50)
# all_sections = []
# for document in documents:
#     so_far = []
#     for i, section in enumerate(document.document):
#         so_far.append(section.text)
#         if len(so_far) == 25:
#             all_sections.append("\n".join(so_far))
#             so_far = []
#     if so_far:
#         all_sections.append("\n".join(so_far))

# processes = [processes.Alatius(), processes.StanzaCustomTokenization()]
# processing.evaluate_macronization(documents, processes)
# processing.process_documents(
#     document_streams.for_list(all_sections, "profiling"),
#     processes.Alatius(),
# )
processing.process_documents(
    # document_streams.for_list(all_sections, "profiling"),
    document_streams.for_text("Dixit 'me optimum esse'.", "debug"),
    processes.StanzaCustomTokenization(),
)
# process = processes.StanzaCustomTokenization()
# process.initialize()
# print("READY_FOR_INPUT")
# while True:
#     raw_text = input()
#     processed_text = process.process(raw_text.replace("%", "\n"))
#     print("OUTPUT_START")
#     print(f"PAYLOAD_SIZE:{len(processed_text)}")
#     print(processed_text)
#     print("OUTPUT_COMPLETE")
