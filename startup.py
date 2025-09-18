#!/usr/bin/env python3
"""
Railway startup script for Belarus Constitution AI Assistant
"""
import os
import sys
import uvicorn

def main():
    # Get port from Railway environment
    port = int(os.environ.get("PORT", 8000))
    
    print("=" * 50)
    print("Belarus Constitution AI Assistant")
    print("=" * 50)
    print(f"Port: {port}")
    print(f"Environment: {os.environ.get('RAILWAY_ENVIRONMENT', 'local')}")
    print(f"Python version: {sys.version}")
    print(f"Working directory: {os.getcwd()}")
    print("=" * 50)
    
    # Start the server
    try:
        uvicorn.run(
            "backend.server:app",
            host="0.0.0.0",
            port=port,
            log_level="info",
            access_log=True,
            reload=False
        )
    except Exception as e:
        print(f"Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
