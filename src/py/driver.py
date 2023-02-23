from src.py.utils import pipeline

pipeline.Alatius(debug=True, max_segments=1).run()

# pipelines = [pipeline.Alatius(), pipeline.CltkDefault()]
# pipeline.TestHarness('testdata/llpsi/ra.xml', pipelines).compare()
# LLPSI weird chars: [\.!\?‘’,”“—]
# [a-zA-ZāēīōūĀĒĪŌŪ]
