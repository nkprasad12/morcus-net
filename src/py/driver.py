from src.py.utils import document_streams
from src.py.utils import processes
from src.py.utils import processing

# pipeline.StanzaCustomTokenization(debug=True, max_segments=10).run()

# pipelines = [pipeline.Alatius(), pipeline.StanzaCustomTokenization()]
# pipeline.TestHarness("testdata/llpsi/fr.xml", pipelines).compare()

# _ALL_LATIN = r"lat\d\.xml",
# _PERSEUS_ROOT = "texts/latin"
# _DBG_FILE = "phi0448.phi001.perseus-lat2.xml"


documents = document_streams.from_directory("testdata", "fr.xml")
processes = [processes.Alatius(), processes.StanzaCustomTokenization()]
processing.evaluate_macronization(documents, processes)
