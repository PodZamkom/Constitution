#!/bin/bash
# Railway startup script
echo "Starting Belarus Constitution AI Assistant..."
echo "Port: $PORT"
uvicorn backend.server:app --host 0.0.0.0 --port $PORT
