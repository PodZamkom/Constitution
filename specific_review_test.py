#!/usr/bin/env python3
"""
Specific Review Request Tests for Алеся - Belarus Constitution AI Assistant
Tests the exact questions mentioned in the review request
"""

import asyncio
import aiohttp
import json
import uuid
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment variable
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')
BASE_API_URL = f"{BACKEND_URL}/api"

print(f"Testing specific review request scenarios at: {BASE_API_URL}")

class SpecificReviewTester:
    def __init__(self):
        self.session = None
        self.test_session_id = str(uuid.uuid4())

    async def setup(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession()

    async def cleanup(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()

    async def test_specific_identity_questions(self):
        """Test the exact identity questions from review request"""
        print("\n🧪 Testing Specific Identity Questions from Review Request...")
        
        specific_questions = [
            "Кто ты?",
            "Расскажи о себе", 
            "Какая твоя роль?",
            "Что ты знаешь?"
        ]
        
        for question in specific_questions:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_specific",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '')
                        
                        print(f"\n📝 Question: {question}")
                        print(f"📋 Response: {response_text}")
                        print("-" * 80)
                    else:
                        print(f"❌ '{question}' - HTTP {response.status}")
                        
            except Exception as e:
                print(f"❌ '{question}' - Error: {str(e)}")

    async def test_specific_constitution_questions(self):
        """Test the exact Constitution questions from review request"""
        print("\n🧪 Testing Specific Constitution Questions from Review Request...")
        
        constitution_questions = [
            "Какие права граждан гарантирует Конституция Беларуси?",
            "Расскажи о структуре власти по Конституции",
            "Что говорит Конституция о правах человека?"
        ]
        
        for question in constitution_questions:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_constitution_specific",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '')
                        
                        print(f"\n📝 Question: {question}")
                        print(f"📋 Response: {response_text}")
                        
                        # Check for article references
                        import re
                        article_numbers = re.findall(r'стать[яеию]\s*(\d+)', response_text.lower())
                        if article_numbers:
                            print(f"📊 Article references found: {article_numbers}")
                        else:
                            print("⚠️ No specific article numbers found")
                        print("-" * 80)
                    else:
                        print(f"❌ '{question}' - HTTP {response.status}")
                        
            except Exception as e:
                print(f"❌ '{question}' - Error: {str(e)}")

    async def test_specific_refusal_questions(self):
        """Test the exact non-Constitution questions from review request"""
        print("\n🧪 Testing Specific Non-Constitution Questions from Review Request...")
        
        refusal_questions = [
            "Какая погода сегодня?",
            "Расскажи о законах России",
            "Как приготовить борщ?"
        ]
        
        for question in refusal_questions:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_refusal_specific",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '')
                        
                        print(f"\n📝 Question: {question}")
                        print(f"📋 Response: {response_text}")
                        
                        # Check for proper refusal
                        expected_phrases = ["алеся", "конституции беларуси", "могу отвечать только"]
                        found_phrases = [phrase for phrase in expected_phrases if phrase in response_text.lower()]
                        print(f"📊 Refusal markers found: {found_phrases}")
                        print("-" * 80)
                    else:
                        print(f"❌ '{question}' - HTTP {response.status}")
                        
            except Exception as e:
                print(f"❌ '{question}' - Error: {str(e)}")

    async def test_voice_mode_session_detailed(self):
        """Test Voice Mode session creation with detailed logging"""
        print("\n🧪 Testing Voice Mode Session Creation (Detailed)...")
        
        try:
            # Test session creation
            async with self.session.post(f"{BASE_API_URL}/voice/realtime/session") as response:
                print(f"📊 Voice Mode Session Response Status: {response.status}")
                
                if response.status == 200:
                    data = await response.json()
                    print(f"📋 Session Data Keys: {list(data.keys())}")
                    
                    # Check for instructions in response
                    if 'instructions' in data:
                        instructions = data['instructions']
                        print(f"📝 Instructions Length: {len(instructions)} characters")
                        print(f"📋 Instructions Preview: {instructions[:200]}...")
                        
                        # Check for Алеся-specific content
                        aleya_markers = ['алеся', 'конституция республики беларусь', 'виртуальный консультант']
                        found_markers = [marker for marker in aleya_markers if marker.lower() in instructions.lower()]
                        print(f"📊 Алеся markers in instructions: {found_markers}")
                    else:
                        print("⚠️ No instructions field in session response")
                    
                    # Check voice configuration
                    if 'voice' in data:
                        print(f"🎤 Voice configured: {data['voice']}")
                    
                    print("✅ Voice Mode session creation successful")
                else:
                    error_text = await response.text()
                    print(f"❌ Voice Mode session failed: {error_text}")
                    
        except Exception as e:
            print(f"❌ Voice Mode session error: {str(e)}")

    async def run_specific_tests(self):
        """Run all specific review request tests"""
        print("🚀 Starting Specific Review Request Tests for Алеся")
        print("=" * 80)
        
        await self.setup()
        
        try:
            await self.test_specific_identity_questions()
            await self.test_specific_constitution_questions()
            await self.test_specific_refusal_questions()
            await self.test_voice_mode_session_detailed()
            
        finally:
            await self.cleanup()

async def main():
    """Main test execution"""
    tester = SpecificReviewTester()
    await tester.run_specific_tests()

if __name__ == "__main__":
    asyncio.run(main())