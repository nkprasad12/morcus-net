The image is built from `image/` only (its `Dockerfile` and `latincy_server.py`);
this README and the tests stay outside it, so editing them doesn't change the
image or redeploy it.

To build the image (from this directory):

```
docker build image --tag ghcr.io/nkprasad12/morcus-latincy
```

To run it locally:

```
docker run -d -p 127.0.0.1:5758:8000 ghcr.io/nkprasad12/morcus-latincy
```

Verify it's up

```
curl --request POST --data '{"words":["Gallia"," ","est"],"spaces":[false,true,false]}' \
  http://localhost:5758 -H "Content-Type: application/json"
```
