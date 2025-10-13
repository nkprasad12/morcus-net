# Ideas

For memory usage, it could be better to do it from outside the process.

For example, we can consider:

```
docker container ls --filter name=morcus-prod
```

which returns

```
CONTAINER ID   IMAGE                                   COMMAND                  CREATED      STATUS      PORTS      NAMES
0093023372c2   ghcr.io/nkprasad12/morcus:main-latest   "docker-entrypoint.s…"   9 days ago   Up 9 days   5757/tcp   morcus-prod-1
```

then we take the container ID

```
docker inspect --format '{{.State.Pid}}' 0093023372c2
```

to get the output

```
984599
```

Then we use `pstree` or a different util until get get to the `node` subprocess.

Then we can read the result using `top` or a different util.
