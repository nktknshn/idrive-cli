#!/bin/bash

set -e
set -x

rm -rf dist

./node_modules/.bin/tsc -p tsconfig.build.json

cat package.json | jq 'del(.scripts)' | jq 'del(.devDependencies)' > dist/package.json

cp README.md dist/README.md

mkdir dist/completions
cp completions/idrive.fish dist/completions/idrive.fish

mkdir dist/bin

echo '#!/usr/bin/env node' > dist/bin/idrive
echo 'require("./../cli-drive.js")' >> dist/bin/idrive
chmod +x dist/bin/idrive
