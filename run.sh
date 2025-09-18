#!/bin/bash
# Railway startup script
echo "Starting Belarus Constitution AI Assistant..."
echo "Port: $PORT"
echo "Environment: $RAILWAY_ENVIRONMENT"
echo "Working directory: $(pwd)"
echo "Files in directory:"
ls -la
echo "Starting uvicorn..."
uvicorn backend.server:app --host 0.0.0.0 --port $PORT --log-level info
