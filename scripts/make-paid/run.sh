#!/bin/bash
set -a
source "$(dirname "$0")/../../apps/web/.env.local"
set +a
node "$(dirname "$0")/make-paid.mjs" "$@"
