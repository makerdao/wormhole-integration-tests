#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

cd ../repos/optimism-monorepo/ops

docker-compose build