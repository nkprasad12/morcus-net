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
./measure_throughput --url http://127.0.0.1:5757/api/library/work/%7B%22w%22%3A%7B%22nameAndAuthor%22%3A%7B%22urlAuthor%22%3A%22calpurnius_siculus%22%2C%22urlName%22%3A%22eclogues%22%7D%2C%22commitHash%22%3A%2233d92682e5ce2ee4629988a0b9ce59373d4ba08f%22%7D%7D --concurrency 2 --duration 4
sudo docker container rm <container-id> -f
```
