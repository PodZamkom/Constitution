#!/usr/bin/env python3
import os
import uvicorn
import sys

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"🚀 Starting server on port {port}")
    
    # Check if frontend is built
    frontend_build_path = "frontend/build"
    if not os.path.exists(frontend_build_path):
        print(f"❌ Frontend build not found at {frontend_build_path}")
        print("Frontend should be built by nixpacks during deployment")
        sys.exit(1)
    
    print("✅ Frontend build found, starting backend server...")
    
    # Start backend server
    print("🔧 Starting backend server...")
    uvicorn.run(
        "backend.server:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
