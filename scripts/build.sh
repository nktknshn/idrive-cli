#!/bin/bash

set -x

rm -rf dist

CHECK_LINK=yes

# try read opt --ignore-link

if [[ "$1" == "--ignore-link" ]]; then
  CHECK_LINK=no
fi

HAS_LINK=$(cat package.json | jq '.dependencies' | grep -P '(file:|link:)')

if [[ "$CHECK_LINK" == "yes" && "$HAS_LINK" != "" ]]; then
  echo "Cannot build with link dependencies"
  exit 1
fi

set -e

VER_PACKAGE=$(cat package.json | jq -r '.version' )
VER_CLIENT=$(cat src/defaults.ts | grep cliVersion | grep -oP '(?<=")[0-9.]+(?=")')

if [ "$VER_CLIENT" != "$VER_PACKAGE" ]; then
  echo "Version mismatch between package.json and src/defaults.ts"
  exit 1
fi

./node_modules/.bin/tsc -p tsconfig.build.json

cat package.json | jq 'del(.scripts)' | jq 'del(.devDependencies)' > dist/package.json

cp README.md dist/README.md

mkdir dist/completions
cp completions/idrive.fish dist/completions/idrive.fish

mkdir dist/bin

echo '#!/usr/bin/env node' > dist/bin/idrive
echo 'require("./../cli-drive.js")' >> dist/bin/idrive
chmod +x dist/bin/idrive
