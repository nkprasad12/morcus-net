FROM python:3.12
WORKDIR /app

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN pip install spacy
RUN pip install "la-core-web-lg @ https://huggingface.co/latincy/la_core_web_lg/resolve/main/la_core_web_lg-any-py3-none-any.whl"
COPY latincy_server.py .

RUN chown -R appuser:appuser /app && chmod -R 755 /app
USER appuser
EXPOSE 8000

# Use python directly instead of sh to ensure signal propagation
CMD ["python", "latincy_server.py"]