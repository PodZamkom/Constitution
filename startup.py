#!/usr/bin/env python3
import os
import uvicorn
import subprocess
import sys

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"🚀 Starting server on port {port}")
    
    # Build frontend first
    print("📦 Building frontend...")
    try:
        subprocess.run(["npm", "install"], cwd="frontend", check=True)
        subprocess.run(["npm", "run", "build"], cwd="frontend", check=True)
        print("✅ Frontend built successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Frontend build failed: {e}")
        sys.exit(1)
    
    # Start backend server
    print("🔧 Starting backend server...")
    uvicorn.run(
        "backend.server:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
