from src.py.utils import pipeline

pipeline.StanzaCustomTokenization(debug=True, max_segments=10).run()

# pipelines = [pipeline.Alatius(), pipeline.StanzaCustomTokenization()]
# pipeline.TestHarness("testdata/llpsi/fr.xml", pipelines).compare()
# LLPSI weird chars: [\.!\?‘’,”“—]
# [a-zA-ZāēīōūĀĒĪŌŪȳȲ
