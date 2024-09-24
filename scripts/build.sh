#!/bin/bash

set -e
set -x

rm -rf dist

./node_modules/.bin/tsc -p tsconfig.build.json

cat package.json | jq 'del(.scripts)' | jq 'del(.devDependencies)' > dist/package.json
cp README.md dist/README.md