To build the image:

```
docker build . --tag ghcr.io/nkprasad12/morcus-latincy
```

To run it locally:

```
docker run -d -p 127.0.0.1:5758:8000 ghcr.io/nkprasad12/morcus-latincy
```

Verify it's up

```
curl --request POST --data 'Gallia est omnis' http://localhost:5758
```
