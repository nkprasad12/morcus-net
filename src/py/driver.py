from src.py.utils import pipeline

pipeline.CltkDefault(debug=True, max_segments=5).run()

# pipelines = [pipeline.Alatius(), pipeline.CltkDefault()]
# pipeline.TestHarness('testdata/llpsi/ra.xml', pipelines).compare()
# LLPSI weird chars: [\.!\?‘’,”“—]
# [a-zA-ZāēīōūĀĒĪŌŪȳȲ
