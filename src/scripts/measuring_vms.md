On the local machine

```
bun build --minify --compile src/scripts/measure_throughput.ts
scp ./measure_throughput ubuntu@15.204.174.249:~
rm measure_throughput
ssh ubuntu@15.204.174.249
```

On the remote VM

```
# This should output some <container-id>
sudo docker container run --publish 5757:5757 --rm -d  ghcr.io/nkprasad12/morcus:dev-latest
./measure_throughput --url "http://127.0.0.1:5757/dicts?q=habeo&dict=ls,sh&format=partial" --concurrency 2 --duration 4
sudo docker container rm <container-id> -f
```
