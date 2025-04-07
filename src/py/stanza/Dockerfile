FROM python:3.12
WORKDIR /app

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Build from source to avoid bloating the image size with ~8 GB of CUDA packages.
# In the future, this can also be used to allow custom builds where we can e.g.
# return the confidence with a prediction.
RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN git clone https://github.com/stanfordnlp/stanza.git --depth 1
RUN cd stanza && git checkout v1.10.1 && pip install .

# Download the Latin models.
ENV STANZA_RESOURCES_DIR=/app
RUN python -c "import stanza; stanza.download(lang='la', processors='tokenize,pos,lemma')"

COPY stanza_server.py .

RUN chown -R appuser:appuser /app && chmod -R 755 /app
USER appuser
EXPOSE 8000

# Use python directly instead of sh to ensure signal propagation
CMD ["python", "stanza_server.py"]