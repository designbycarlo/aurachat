#!/bin/bash
# AuraChat - LightAgent Demo
# This script starts the application

cd "$(dirname "$0")"

# Activate virtual environment if present
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Run the demo
python demo_preview.py