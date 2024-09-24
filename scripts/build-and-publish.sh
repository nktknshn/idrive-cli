#!/bin/bash

set -e
set -x

scripts/build.sh

cd dist

npm publish "$@"