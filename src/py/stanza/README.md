To build the image:

```
docker build . --tag ghcr.io/nkprasad12/morcus-stanza
```

To run it locally:

```
docker run -d -p 127.0.0.1:5759:8000 ghcr.io/nkprasad12/morcus-stanza
```

Verify it's up

```
curl --request POST --data '[["Gallia"," ","est", " ", "omnis", "."]]' \
  http://localhost:5759 -H "Content-Type: application/json"
```
