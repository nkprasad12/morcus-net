from src.py.utils import document_streams
from src.py.utils import processes
from src.py.utils import processing

_GOLDENS_ROOT = "testdata/llpsi"
_PERSEUS_ROOT = "texts/latin"
_DBG_FILE = "phi0448.phi001.perseus-lat2.xml"


def batch_document(part_limit: int, batch_size: int) -> "list[str]":
    documents = document_streams.from_directory(_PERSEUS_ROOT, _DBG_FILE)
    all_sections: list[str] = []
    for document in documents:
        so_far: list[str] = []
        for section in document.document:
            so_far.append(section.text)
            if len(so_far) == batch_size:
                all_sections.append("\n".join(so_far))
                so_far = []
        if so_far:
            all_sections.append("\n".join(so_far))
    return all_sections


def evaluate_batch_speed(part_limit: int, batches: int) -> None:
    all_sections = batch_document(part_limit, batches)
    processing.process_documents(
        document_streams.for_list(all_sections, "profiling"),
        processes.Alatius(),
    )
    processing.process_documents(
        document_streams.for_list(all_sections, "profiling"),
        processes.StanzaCustomTokenization(),
    )


def evaluate_macronization() -> None:
    documents = document_streams.from_directory(_GOLDENS_ROOT, r"fr\.xml")
    macronizers = [processes.Alatius(), processes.StanzaCustomTokenization()]
    processing.evaluate_macronization(documents, macronizers)


evaluate_macronization()
