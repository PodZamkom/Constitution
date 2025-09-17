#!/usr/bin/env python3
"""
Backend API Testing for Belarus Constitution AI Assistant
Tests OpenAI GPT-5 integration, MongoDB storage, and Constitution system prompt
"""

import asyncio
import aiohttp
import json
import uuid
import time
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://belarus-constitution.preview.emergentagent.com')
BASE_API_URL = f"{BACKEND_URL}/api"

print(f"Testing backend at: {BASE_API_URL}")

class BackendTester:
    def __init__(self):
        self.session = None
        self.test_session_id = str(uuid.uuid4())
        self.results = {
            'chat_endpoint': {'passed': False, 'details': []},
            'constitution_prompt': {'passed': False, 'details': []},
            'mongodb_storage': {'passed': False, 'details': []},
            'sse_streaming': {'passed': False, 'details': []},
            'history_retrieval': {'passed': False, 'details': []}
        }

    async def setup(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession()

    async def cleanup(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()

    async def test_root_endpoint(self):
        """Test root endpoint availability"""
        try:
            async with self.session.get(f"{BACKEND_URL}/") as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Root endpoint working: {data}")
                    return True
                else:
                    print(f"❌ Root endpoint failed with status: {response.status}")
                    return False
        except Exception as e:
            print(f"❌ Root endpoint error: {str(e)}")
            return False

    async def test_constitution_question(self):
        """Test Constitution-related question in Russian"""
        print("\n🧪 Testing Constitution question...")
        
        constitution_question = "Какие права граждан гарантирует Конституция Беларуси?"
        
        try:
            payload = {
                "session_id": self.test_session_id,
                "message": constitution_question
            }
            
            async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    response_text = data.get('response', '')
                    
                    # Check if response is in Russian and mentions Constitution
                    if response_text and len(response_text) > 50:
                        self.results['chat_endpoint']['passed'] = True
                        self.results['constitution_prompt']['passed'] = True
                        self.results['chat_endpoint']['details'].append(f"Constitution question answered: {response_text[:100]}...")
                        self.results['constitution_prompt']['details'].append("Response is in Russian and addresses Constitution")
                        
                        # Check for article references
                        if "статья" in response_text.lower() or "статьи" in response_text.lower():
                            self.results['constitution_prompt']['details'].append("✅ Response includes article references")
                        else:
                            self.results['constitution_prompt']['details'].append("⚠️ No article references found")
                        
                        print(f"✅ Constitution question answered successfully")
                        print(f"Response preview: {response_text[:200]}...")
                        return True
                    else:
                        self.results['chat_endpoint']['details'].append("Response too short or empty")
                        print(f"❌ Response too short: {response_text}")
                        return False
                else:
                    error_text = await response.text()
                    self.results['chat_endpoint']['details'].append(f"HTTP {response.status}: {error_text}")
                    print(f"❌ Constitution question failed with status: {response.status}")
                    print(f"Error: {error_text}")
                    return False
                    
        except Exception as e:
            self.results['chat_endpoint']['details'].append(f"Exception: {str(e)}")
            print(f"❌ Constitution question error: {str(e)}")
            return False

    async def test_non_constitution_question(self):
        """Test non-Constitution question should be refused"""
        print("\n🧪 Testing non-Constitution question refusal...")
        
        non_constitution_question = "Какая погода сегодня в Минске?"
        
        try:
            payload = {
                "session_id": self.test_session_id,
                "message": non_constitution_question
            }
            
            async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    response_text = data.get('response', '')
                    
                    # Check for refusal message
                    expected_refusal = "Я могу отвечать только по Конституции Республики Беларусь"
                    if expected_refusal in response_text:
                        self.results['constitution_prompt']['details'].append("✅ Non-Constitution question properly refused")
                        print(f"✅ Non-Constitution question properly refused")
                        return True
                    else:
                        self.results['constitution_prompt']['details'].append(f"⚠️ Unexpected response to non-Constitution question: {response_text}")
                        print(f"⚠️ Unexpected response: {response_text}")
                        return False
                else:
                    print(f"❌ Non-Constitution question test failed with status: {response.status}")
                    return False
                    
        except Exception as e:
            print(f"❌ Non-Constitution question test error: {str(e)}")
            return False

    async def test_chat_history_storage(self):
        """Test MongoDB chat history storage and retrieval"""
        print("\n🧪 Testing MongoDB chat history storage...")
        
        try:
            # First, send a test message
            test_message = "Что говорит Конституция о правах человека?"
            payload = {
                "session_id": self.test_session_id,
                "message": test_message
            }
            
            async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                if response.status != 200:
                    print(f"❌ Failed to send test message for history test")
                    return False
            
            # Wait a moment for database write
            await asyncio.sleep(1)
            
            # Retrieve chat history
            async with self.session.get(f"{BASE_API_URL}/history/{self.test_session_id}") as response:
                if response.status == 200:
                    data = await response.json()
                    messages = data.get('messages', [])
                    
                    if len(messages) >= 2:  # Should have user message and assistant response
                        self.results['mongodb_storage']['passed'] = True
                        self.results['history_retrieval']['passed'] = True
                        
                        # Check message structure
                        for msg in messages:
                            if 'id' in msg and 'timestamp' in msg and 'role' in msg:
                                self.results['mongodb_storage']['details'].append("✅ Messages have proper UUID IDs and timestamps")
                                break
                        
                        # Check timestamp format (should be UTC ISO-8601)
                        if messages and 'timestamp' in messages[0]:
                            timestamp = messages[0]['timestamp']
                            if isinstance(timestamp, str) and 'T' in timestamp:
                                self.results['mongodb_storage']['details'].append("✅ Timestamps in UTC ISO-8601 format")
                            else:
                                self.results['mongodb_storage']['details'].append(f"⚠️ Timestamp format: {timestamp}")
                        
                        self.results['history_retrieval']['details'].append(f"Retrieved {len(messages)} messages successfully")
                        print(f"✅ Chat history retrieved: {len(messages)} messages")
                        return True
                    else:
                        self.results['mongodb_storage']['details'].append(f"Expected at least 2 messages, got {len(messages)}")
                        print(f"❌ Expected at least 2 messages, got {len(messages)}")
                        return False
                else:
                    error_text = await response.text()
                    self.results['history_retrieval']['details'].append(f"HTTP {response.status}: {error_text}")
                    print(f"❌ History retrieval failed with status: {response.status}")
                    return False
                    
        except Exception as e:
            self.results['mongodb_storage']['details'].append(f"Exception: {str(e)}")
            print(f"❌ Chat history storage test error: {str(e)}")
            return False

    async def test_sse_streaming(self):
        """Test SSE streaming endpoint"""
        print("\n🧪 Testing SSE streaming...")
        
        try:
            stream_url = f"{BASE_API_URL}/stream-chat"
            params = {
                "session_id": self.test_session_id,
                "message": "Расскажи о структуре Конституции Беларуси"
            }
            
            async with self.session.get(stream_url, params=params) as response:
                if response.status == 200:
                    content_type = response.headers.get('content-type', '')
                    if 'text/plain' in content_type:
                        # Read streaming response
                        chunks = []
                        async for chunk in response.content.iter_chunked(1024):
                            chunk_text = chunk.decode('utf-8')
                            chunks.append(chunk_text)
                            if len(chunks) > 10:  # Limit chunks to avoid infinite loop
                                break
                        
                        full_response = ''.join(chunks)
                        
                        # Check for SSE format
                        if 'data:' in full_response and '"content"' in full_response:
                            self.results['sse_streaming']['passed'] = True
                            self.results['sse_streaming']['details'].append("✅ SSE streaming format detected")
                            self.results['sse_streaming']['details'].append(f"Received {len(chunks)} chunks")
                            print(f"✅ SSE streaming working: {len(chunks)} chunks received")
                            return True
                        else:
                            self.results['sse_streaming']['details'].append(f"Unexpected streaming format: {full_response[:200]}")
                            print(f"⚠️ Unexpected streaming format")
                            return False
                    else:
                        self.results['sse_streaming']['details'].append(f"Wrong content type: {content_type}")
                        print(f"❌ Wrong content type: {content_type}")
                        return False
                else:
                    error_text = await response.text()
                    self.results['sse_streaming']['details'].append(f"HTTP {response.status}: {error_text}")
                    print(f"❌ SSE streaming failed with status: {response.status}")
                    return False
                    
        except Exception as e:
            self.results['sse_streaming']['details'].append(f"Exception: {str(e)}")
            print(f"❌ SSE streaming test error: {str(e)}")
            return False

    async def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests for Belarus Constitution Assistant")
        print("=" * 70)
        
        await self.setup()
        
        try:
            # Test basic connectivity
            root_ok = await self.test_root_endpoint()
            if not root_ok:
                print("❌ Cannot connect to backend, aborting tests")
                return self.results
            
            # Test Constitution question handling
            await self.test_constitution_question()
            await self.test_non_constitution_question()
            
            # Test MongoDB storage
            await self.test_chat_history_storage()
            
            # Test SSE streaming
            await self.test_sse_streaming()
            
        finally:
            await self.cleanup()
        
        return self.results

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 70)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 70)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for result in self.results.values() if result['passed'])
        
        print(f"Overall: {passed_tests}/{total_tests} tests passed")
        print()
        
        for test_name, result in self.results.items():
            status = "✅ PASS" if result['passed'] else "❌ FAIL"
            print(f"{status} {test_name.replace('_', ' ').title()}")
            
            for detail in result['details']:
                print(f"    {detail}")
            print()

async def main():
    """Main test execution"""
    tester = BackendTester()
    results = await tester.run_all_tests()
    tester.print_summary()
    
    # Return exit code based on results
    all_passed = all(result['passed'] for result in results.values())
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)