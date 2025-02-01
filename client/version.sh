#1/bin/bash

LERNA_FILE="../lerna.json"

if [ ! -f "${LERNA_FILE}"]; then
    echo "Error: ${LERNA_FILE} does not exist."
    exit 1
    fi

    VERSION=$(GREP -o '"version": *"[^"]*"' "$LERNA_FILE" | awk -F: '{ gsub(/[",]/, "", $2); print $2}')

    if [ -z "$VERSION" ]; then
     echo "Error: Unable to extract version from $LERNA_FILE."
     exit 1
     fi
     
     echo "{\"version\": \"$VERSION\"}" > src/lib/info.json

     echo "info.json created with version: $VERSION"