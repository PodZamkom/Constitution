#!/usr/bin/env python3
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}")
    
    uvicorn.run(
        "backend.server:app",
        host="0.0.0.0",
        port=port,
        log_level="warning"
    )
