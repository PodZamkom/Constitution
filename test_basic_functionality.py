#!/usr/bin/env python3
"""
Basic functionality test for Belarus Constitution AI Assistant
Tests server endpoints without requiring OpenAI API
"""

import requests
import json
import uuid

# Test configuration
BACKEND_URL = "http://localhost:8001"
BASE_API_URL = f"{BACKEND_URL}/api"
TEST_SESSION_ID = str(uuid.uuid4())

def test_root_endpoint():
    """Test root endpoint"""
    try:
        response = requests.get(f"{BACKEND_URL}/", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Root endpoint: {data}")
            return True
        else:
            print(f"❌ Root endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Root endpoint error: {e}")
        return False

def test_health_endpoint():
    """Test health endpoint"""
    try:
        response = requests.get(f"{BASE_API_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health endpoint: {data}")
            return True
        else:
            print(f"❌ Health endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health endpoint error: {e}")
        return False

def test_capabilities_endpoint():
    """Test capabilities endpoint"""
    try:
        response = requests.get(f"{BASE_API_URL}/capabilities", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Capabilities endpoint: {data}")
            return True
        else:
            print(f"❌ Capabilities endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Capabilities endpoint error: {e}")
        return False

def test_history_endpoint():
    """Test chat history retrieval"""
    try:
        print("🧪 Testing history endpoint...")
        response = requests.get(f"{BASE_API_URL}/history/{TEST_SESSION_ID}", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            messages = data.get('messages', [])
            print(f"✅ History endpoint working: {len(messages)} messages")
            
            if messages:
                # Check message structure
                first_msg = messages[0]
                if 'id' in first_msg and 'timestamp' in first_msg and 'role' in first_msg:
                    print("✅ Messages have proper structure")
                    return True
                else:
                    print(f"⚠️ Message structure incomplete: {first_msg.keys()}")
                    return False
            else:
                print("✅ No messages in history (expected for new session)")
                return True
        else:
            print(f"❌ History endpoint failed: {response.status_code}")
            print(f"Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ History endpoint error: {e}")
        return False

def test_streaming_endpoint_structure():
    """Test streaming endpoint structure (without actual streaming)"""
    try:
        print("🧪 Testing streaming endpoint structure...")
        params = {
            "session_id": TEST_SESSION_ID,
            "message": "test message"
        }
        
        response = requests.get(f"{BASE_API_URL}/stream-chat", params=params, timeout=5)
        
        # We expect either 200 (if streaming works) or 403 (if OpenAI is blocked)
        if response.status_code in [200, 403]:
            if response.status_code == 200:
                print("✅ Streaming endpoint working")
            else:
                print("✅ Streaming endpoint structure correct (OpenAI blocked)")
            return True
        else:
            print(f"❌ Streaming endpoint failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Streaming endpoint error: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Basic Backend API Tests")
    print("=" * 50)
    
    results = []
    
    # Test basic connectivity
    results.append(("Root Endpoint", test_root_endpoint()))
    results.append(("Health Endpoint", test_health_endpoint()))
    results.append(("Capabilities Endpoint", test_capabilities_endpoint()))
    
    # Test storage and retrieval
    results.append(("History Endpoint", test_history_endpoint()))
    
    # Test streaming structure
    results.append(("Streaming Endpoint", test_streaming_endpoint_structure()))
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
        if result:
            passed += 1
    
    print(f"\nOverall: {passed}/{len(results)} tests passed")
    
    return passed == len(results)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
