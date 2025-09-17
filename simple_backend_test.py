#!/usr/bin/env python3
"""
Simple Backend API Test for Belarus Constitution AI Assistant
Quick verification of core functionality
"""

import requests
import json
import uuid
import time

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

def test_chat_endpoint():
    """Test chat endpoint with Constitution question"""
    try:
        payload = {
            "session_id": TEST_SESSION_ID,
            "message": "Какие права граждан гарантирует Конституция Беларуси?"
        }
        
        print("🧪 Testing chat endpoint...")
        response = requests.post(f"{BASE_API_URL}/chat", json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            response_text = data.get('response', '')
            print(f"✅ Chat endpoint working")
            print(f"Response preview: {response_text[:200]}...")
            
            # Check if response is in Russian
            if len(response_text) > 50:
                print("✅ Response length adequate")
                return True
            else:
                print(f"⚠️ Response too short: {response_text}")
                return False
        else:
            print(f"❌ Chat endpoint failed: {response.status_code}")
            print(f"Error: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Chat endpoint timeout - OpenAI API may be slow")
        return False
    except Exception as e:
        print(f"❌ Chat endpoint error: {e}")
        return False

def test_non_constitution_question():
    """Test non-Constitution question refusal"""
    try:
        payload = {
            "session_id": TEST_SESSION_ID,
            "message": "Какая погода сегодня в Минске?"
        }
        
        print("🧪 Testing non-Constitution question...")
        response = requests.post(f"{BASE_API_URL}/chat", json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            response_text = data.get('response', '')
            
            expected_refusal = "Я могу отвечать только по Конституции Республики Беларусь"
            if expected_refusal in response_text:
                print("✅ Non-Constitution question properly refused")
                return True
            else:
                print(f"⚠️ Unexpected response: {response_text}")
                return False
        else:
            print(f"❌ Non-Constitution test failed: {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Non-Constitution test timeout")
        return False
    except Exception as e:
        print(f"❌ Non-Constitution test error: {e}")
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
                print("⚠️ No messages in history")
                return False
        else:
            print(f"❌ History endpoint failed: {response.status_code}")
            print(f"Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ History endpoint error: {e}")
        return False

def test_sse_streaming():
    """Test SSE streaming endpoint"""
    try:
        print("🧪 Testing SSE streaming...")
        params = {
            "session_id": TEST_SESSION_ID,
            "message": "Расскажи о структуре Конституции"
        }
        
        response = requests.get(f"{BASE_API_URL}/stream-chat", params=params, timeout=30, stream=True)
        
        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            if 'text/plain' in content_type:
                # Read first few chunks
                chunks = []
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk:
                        chunks.append(chunk.decode('utf-8'))
                        if len(chunks) >= 3:  # Just get first few chunks
                            break
                
                full_response = ''.join(chunks)
                if 'data:' in full_response:
                    print(f"✅ SSE streaming working: {len(chunks)} chunks")
                    return True
                else:
                    print(f"⚠️ Unexpected streaming format: {full_response[:100]}")
                    return False
            else:
                print(f"❌ Wrong content type: {content_type}")
                return False
        else:
            print(f"❌ SSE streaming failed: {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ SSE streaming timeout")
        return False
    except Exception as e:
        print(f"❌ SSE streaming error: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Quick Backend API Tests")
    print("=" * 50)
    
    results = []
    
    # Test basic connectivity
    results.append(("Root Endpoint", test_root_endpoint()))
    
    # Test chat functionality
    results.append(("Chat Endpoint", test_chat_endpoint()))
    results.append(("Constitution Prompt", test_non_constitution_question()))
    
    # Test storage and retrieval
    results.append(("History Endpoint", test_history_endpoint()))
    
    # Test streaming
    results.append(("SSE Streaming", test_sse_streaming()))
    
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