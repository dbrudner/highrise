#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/highrise.wasm web/highrise.wasm
echo "Built web/highrise.wasm ($(wc -c < web/highrise.wasm) bytes)"
echo "Run:  python3 -m http.server -d web 8080   then open http://localhost:8080"
