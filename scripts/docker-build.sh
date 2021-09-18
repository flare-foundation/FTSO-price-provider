#!/bin/bash
docker build --rm --pull -f "./Dockerfile" -t "flarenetwork/flare-price-collector:latest" "."

docker push flarenetwork/flare-price-collector:latest
