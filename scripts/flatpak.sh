#!/bin/bash
# Build a Flatpak with a unique name associated with the current arch of the machine used.

if [ ! -f ./package.json ]; then
    echo "You should run Slowburn scripts from the project root directory, exiting..."
    exit 1
fi

arch=$(uname -m)

# Build
flatpak-builder --force-clean --user --disable-cache --repo release/flatpak-repo release/flatpak src-tauri/release/com.nathwn.slowburn.yaml

# Bundle
flatpak build-bundle release/flatpak-repo release/slowburn.flatpak com.nathwn.slowburn

# Lint
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest src-tauri/release/com.nathwn.slowburn.yaml && flatpak run --command=flatpak-builder-lint org.flatpak.Builder repo release/flatpak-repo --exceptions --user-exceptions src-tauri/release/flatpak.exceptions.json

# Rename binary so it has a unique name
mv release/slowburn.flatpak release/slowburn-${arch}.flatpak
