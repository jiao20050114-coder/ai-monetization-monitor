#!/bin/sh
set -eu

rm -rf dist
mkdir -p dist/assets dist/data

cp index.html dist/
cp assets/app.js assets/echarts.min.js assets/styles.css dist/assets/
cp data/data.js data/sync-meta.js dist/data/
