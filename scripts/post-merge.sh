#!/bin/bash
set -e

# Install/update dependencies
# Uses || true because the dev server may hold file handles on packages (e.g. vite).
# Workflow reconciliation restarts the server after this script, which re-runs npm install cleanly.
npm install --no-fund --no-audit || true
