from src.py.utils import pipeline

# pipeline.AlatiusCustomTokenization(debug=True, max_segments=5).run()

pipelines = [pipeline.Alatius(), pipeline.AlatiusCustomTokenization()]
pipeline.TestHarness("testdata/llpsi/fr.xml", pipelines).compare()
# LLPSI weird chars: [\.!\?‘’,”“—]
# [a-zA-ZāēīōūĀĒĪŌŪȳȲ
