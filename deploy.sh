#!/bin/bash

set -euo pipefail
tag_name=$1

echo "Docker login"
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin;

PACKAGE_VERSION=$(node -p -e "require('./package.json').version");
echo "Pushing to Docker-hub version $PACKAGE_VERSION, generated from branch $TRAVIS_BRANCH";
docker build -t gnosispm/dex-price-estimator:$tag_name .;
docker push gnosispm/dex-price-estimator:$tag_name;
echo "The image has been pushed";

if [ "$image_name" == "master" ] && [ -n "$AUTODEPLOY_URL" ] && [ -n "$AUTODEPLOY_TOKEN" ]; then
    # Notifying webhook
    curl -s  \
      --output /dev/null \
      --write-out "%{http_code}" \
      -H "Content-Type: application/json" \
      -X POST \
      -d '{"push_data": {"tag": "'$AUTODEPLOY_TAG'" }}' \
      $AUTODEPLOY_URL
fi