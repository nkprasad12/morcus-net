# Pin to the archived 2026-01-25 production image (Python 3.12.12, spaCy 3.8.11,
# `la_core_web_lg` 3.8.0) and layer `latincy_server.py` on top.
#
# Why: upstream `https://huggingface.co/latincy/la_core_web_lg` removed the
# `la_core_web_lg-any-py3-none-any.whl` alias and rewrote git history starting
# at 3.9.0, so the 3.8.0 wheel used in production is preserved in this image
# (also tagged `ghcr.io/nkprasad12/morcus-latincy:archive-2026-01-25`). The OS
# layer is frozen at 2026-01-25, which is acceptable because `latincy` has no
# host-exposed ports and is only reachable on the internal Docker network.
#
# To upgrade to a newer LatinCy release in the future, replace the `FROM` below
# with a fresh `python:3.12-slim` build pinned to a specific HuggingFace commit
# SHA and wheel filename, e.g.:
#   FROM python:3.12-slim
#   WORKDIR /app
#   RUN groupadd -r appuser && useradd -r -g appuser appuser
#   RUN pip install spacy==3.8.11
#   RUN pip install "la-core-web-lg @ https://huggingface.co/latincy/la_core_web_lg/resolve/<commit_sha>/la_core_web_lg-<version>-py3-none-any.whl#sha256=<wheel_sha256>"
FROM ghcr.io/nkprasad12/morcus-latincy@sha256:553342482a1924b92e6645d425d4689d7e1d20131d6b12397af40e3a3912818c
WORKDIR /app

COPY --chown=appuser:appuser latincy_server.py .
USER appuser
EXPOSE 8000

# Use python directly instead of sh to ensure signal propagation
CMD ["python", "latincy_server.py"]
