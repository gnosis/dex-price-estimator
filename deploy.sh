#!/bin/bash

set -euo pipefail
tag_name=$1

# Create Docker image if branch master
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin;

PACKAGE_VERSION=$(node -p -e "require('./package.json').version");
echo "Pushing to Docker-hub version $PACKAGE_VERSION, generated from branch $TRAVIS_BRANCH";
docker build -t gnosispm/dex-price-estimator:$tag_name .;
docker push gnosispm/dex-price-estimator:$tag_name;
echo "The image has been pushed";