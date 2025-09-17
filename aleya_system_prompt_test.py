#!/usr/bin/env python3
"""
Enhanced System Prompt Testing for Алеся - Belarus Constitution AI Assistant
Specifically tests the enhanced system prompt for Алеся focusing on:
1. Identity and Role Testing
2. Constitution Knowledge Testing  
3. Non-Constitution Refusal Testing
4. Article Reference Testing
5. Voice Mode API Testing with Enhanced Prompt
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

# Get backend URL from environment variable
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')
BASE_API_URL = f"{BACKEND_URL}/api"

print(f"Testing Алеся enhanced system prompt at: {BASE_API_URL}")

class AleyaSystemPromptTester:
    def __init__(self):
        self.session = None
        self.test_session_id = str(uuid.uuid4())
        self.results = {
            'identity_role_testing': {'passed': False, 'details': []},
            'constitution_knowledge': {'passed': False, 'details': []},
            'non_constitution_refusal': {'passed': False, 'details': []},
            'article_references': {'passed': False, 'details': []},
            'voice_mode_session': {'passed': False, 'details': []},
            'backend_logging': {'passed': False, 'details': []},
            'system_prompt_length': {'passed': False, 'details': []}
        }

    async def setup(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession()

    async def cleanup(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()

    async def test_identity_and_role(self):
        """Test Identity and Role Testing - Questions like 'Кто ты?', 'Расскажи о себе', etc."""
        print("\n🧪 Testing Identity and Role Recognition...")
        
        identity_questions = [
            "Кто ты?",
            "Расскажи о себе",
            "Какая твоя роль?",
            "Что ты знаешь?"
        ]
        
        passed_tests = 0
        total_tests = len(identity_questions)
        
        for question in identity_questions:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_identity",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '').lower()
                        
                        # Check for Алеся identity markers
                        aleya_markers = [
                            'алеся',
                            'виртуальный консультант',
                            'конституция республики беларусь',
                            'конституция беларуси'
                        ]
                        
                        markers_found = sum(1 for marker in aleya_markers if marker in response_text)
                        
                        if markers_found >= 2:  # Should mention at least 2 key identity markers
                            passed_tests += 1
                            self.results['identity_role_testing']['details'].append(f"✅ '{question}' - Алеся properly identified herself ({markers_found}/4 markers)")
                            print(f"✅ '{question}' - Identity confirmed")
                        else:
                            self.results['identity_role_testing']['details'].append(f"❌ '{question}' - Insufficient identity markers ({markers_found}/4)")
                            print(f"❌ '{question}' - Identity unclear: {response_text[:100]}...")
                    else:
                        self.results['identity_role_testing']['details'].append(f"❌ '{question}' - HTTP {response.status}")
                        print(f"❌ '{question}' - Request failed: {response.status}")
                        
            except Exception as e:
                self.results['identity_role_testing']['details'].append(f"❌ '{question}' - Exception: {str(e)}")
                print(f"❌ '{question}' - Error: {str(e)}")
        
        if passed_tests >= 3:  # At least 3 out of 4 should pass
            self.results['identity_role_testing']['passed'] = True
            print(f"✅ Identity and Role Testing: {passed_tests}/{total_tests} passed")
        else:
            print(f"❌ Identity and Role Testing: {passed_tests}/{total_tests} passed (need at least 3)")
        
        return passed_tests >= 3

    async def test_constitution_knowledge(self):
        """Test Constitution Knowledge Testing - Specific Constitution questions"""
        print("\n🧪 Testing Constitution Knowledge...")
        
        constitution_questions = [
            "Какие права граждан гарантирует Конституция Беларуси?",
            "Расскажи о структуре власти по Конституции",
            "Что говорит Конституция о правах человека?",
            "Какие обязанности граждан установлены Конституцией?",
            "Что сказано в Конституции о государственном языке?"
        ]
        
        passed_tests = 0
        total_tests = len(constitution_questions)
        
        for question in constitution_questions:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_constitution",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '')
                        
                        # Check for Constitution-specific content
                        constitution_markers = [
                            'конституция',
                            'статья',
                            'статьи',
                            'республики беларусь',
                            'беларуси'
                        ]
                        
                        markers_found = sum(1 for marker in constitution_markers if marker.lower() in response_text.lower())
                        
                        # Check response length (should be substantial for Constitution questions)
                        if len(response_text) > 100 and markers_found >= 2:
                            passed_tests += 1
                            self.results['constitution_knowledge']['details'].append(f"✅ '{question[:50]}...' - Detailed Constitution response ({len(response_text)} chars, {markers_found} markers)")
                            print(f"✅ Constitution question answered with detail")
                        else:
                            self.results['constitution_knowledge']['details'].append(f"❌ '{question[:50]}...' - Insufficient detail ({len(response_text)} chars, {markers_found} markers)")
                            print(f"❌ Constitution question - insufficient detail")
                    else:
                        self.results['constitution_knowledge']['details'].append(f"❌ '{question[:50]}...' - HTTP {response.status}")
                        print(f"❌ Constitution question failed: {response.status}")
                        
            except Exception as e:
                self.results['constitution_knowledge']['details'].append(f"❌ '{question[:50]}...' - Exception: {str(e)}")
                print(f"❌ Constitution question error: {str(e)}")
        
        if passed_tests >= 4:  # At least 4 out of 5 should pass
            self.results['constitution_knowledge']['passed'] = True
            print(f"✅ Constitution Knowledge Testing: {passed_tests}/{total_tests} passed")
        else:
            print(f"❌ Constitution Knowledge Testing: {passed_tests}/{total_tests} passed (need at least 4)")
        
        return passed_tests >= 4

    async def test_non_constitution_refusal(self):
        """Test Non-Constitution Refusal Testing - Test refusal behavior"""
        print("\n🧪 Testing Non-Constitution Question Refusal...")
        
        non_constitution_questions = [
            "Какая погода сегодня?",
            "Расскажи о законах России",
            "Как приготовить борщ?",
            "Что происходит в мире?",
            "Расскажи анекдот"
        ]
        
        expected_refusal_phrases = [
            "меня зовут алеся",
            "могу отвечать только",
            "конституции республики беларусь",
            "конституции беларуси",
            "пожалуйста, задайте вопрос о конституции"
        ]
        
        passed_tests = 0
        total_tests = len(non_constitution_questions)
        
        for question in non_constitution_questions:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_refusal",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '').lower()
                        
                        # Check for proper refusal message
                        refusal_markers_found = sum(1 for phrase in expected_refusal_phrases if phrase in response_text)
                        
                        if refusal_markers_found >= 2:  # Should have at least 2 refusal markers
                            passed_tests += 1
                            self.results['non_constitution_refusal']['details'].append(f"✅ '{question}' - Properly refused ({refusal_markers_found} markers)")
                            print(f"✅ Non-Constitution question properly refused")
                        else:
                            self.results['non_constitution_refusal']['details'].append(f"❌ '{question}' - Improper refusal ({refusal_markers_found} markers): {response_text[:100]}...")
                            print(f"❌ Non-Constitution question - improper refusal")
                    else:
                        self.results['non_constitution_refusal']['details'].append(f"❌ '{question}' - HTTP {response.status}")
                        print(f"❌ Non-Constitution question failed: {response.status}")
                        
            except Exception as e:
                self.results['non_constitution_refusal']['details'].append(f"❌ '{question}' - Exception: {str(e)}")
                print(f"❌ Non-Constitution question error: {str(e)}")
        
        if passed_tests >= 4:  # At least 4 out of 5 should pass
            self.results['non_constitution_refusal']['passed'] = True
            print(f"✅ Non-Constitution Refusal Testing: {passed_tests}/{total_tests} passed")
        else:
            print(f"❌ Non-Constitution Refusal Testing: {passed_tests}/{total_tests} passed (need at least 4)")
        
        return passed_tests >= 4

    async def test_article_references(self):
        """Test Article Reference Testing - Verify responses include specific article numbers"""
        print("\n🧪 Testing Article Reference Inclusion...")
        
        article_specific_questions = [
            "Что говорит статья 24 Конституции?",
            "Расскажи о статье 33 Конституции Беларуси",
            "Какие права гарантирует статья 25?",
            "Что сказано в статье 50 Конституции?",
            "Расскажи о правах граждан по Конституции"  # Should reference multiple articles
        ]
        
        passed_tests = 0
        total_tests = len(article_specific_questions)
        
        for question in article_specific_questions:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_articles",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '').lower()
                        
                        # Check for article references
                        article_patterns = [
                            'статья',
                            'статьи',
                            'статье',
                            'статью'
                        ]
                        
                        # Check for specific article numbers
                        import re
                        article_numbers = re.findall(r'стать[яеию]\s*(\d+)', response_text)
                        
                        article_references = sum(1 for pattern in article_patterns if pattern in response_text)
                        
                        if article_references > 0 and (len(article_numbers) > 0 or 'справка:' in response_text):
                            passed_tests += 1
                            self.results['article_references']['details'].append(f"✅ '{question[:40]}...' - Article references found ({article_references} refs, numbers: {article_numbers})")
                            print(f"✅ Article references included")
                        else:
                            self.results['article_references']['details'].append(f"❌ '{question[:40]}...' - No article references ({article_references} refs, numbers: {article_numbers})")
                            print(f"❌ No article references found")
                    else:
                        self.results['article_references']['details'].append(f"❌ '{question[:40]}...' - HTTP {response.status}")
                        print(f"❌ Article reference question failed: {response.status}")
                        
            except Exception as e:
                self.results['article_references']['details'].append(f"❌ '{question[:40]}...' - Exception: {str(e)}")
                print(f"❌ Article reference question error: {str(e)}")
        
        if passed_tests >= 3:  # At least 3 out of 5 should pass
            self.results['article_references']['passed'] = True
            print(f"✅ Article Reference Testing: {passed_tests}/{total_tests} passed")
        else:
            print(f"❌ Article Reference Testing: {passed_tests}/{total_tests} passed (need at least 3)")
        
        return passed_tests >= 3

    async def test_voice_mode_session_creation(self):
        """Test Voice Mode API Testing - Session creation with enhanced prompt"""
        print("\n🧪 Testing Voice Mode Session Creation with Enhanced Prompt...")
        
        try:
            # Test session creation endpoint
            async with self.session.post(f"{BASE_API_URL}/voice/realtime/session") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Check if session data contains expected fields
                    if 'client_secret' in data or 'session_id' in data:
                        self.results['voice_mode_session']['passed'] = True
                        self.results['voice_mode_session']['details'].append("✅ Voice Mode session created successfully")
                        self.results['voice_mode_session']['details'].append(f"Response keys: {list(data.keys())}")
                        print("✅ Voice Mode session creation successful")
                        return True
                    else:
                        self.results['voice_mode_session']['details'].append(f"❌ Unexpected session response format: {data}")
                        print(f"❌ Unexpected session response: {data}")
                        return False
                else:
                    error_text = await response.text()
                    self.results['voice_mode_session']['details'].append(f"❌ Session creation failed: HTTP {response.status} - {error_text}")
                    print(f"❌ Voice Mode session creation failed: {response.status}")
                    return False
                    
        except Exception as e:
            self.results['voice_mode_session']['details'].append(f"❌ Session creation exception: {str(e)}")
            print(f"❌ Voice Mode session creation error: {str(e)}")
            return False

    async def test_backend_capabilities(self):
        """Test backend capabilities and logging"""
        print("\n🧪 Testing Backend Capabilities...")
        
        try:
            # Test capabilities endpoint
            async with self.session.get(f"{BASE_API_URL}/capabilities") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Check for expected capabilities
                    expected_capabilities = ['whisper_available', 'voice_mode_available', 'llm_available']
                    capabilities_found = sum(1 for cap in expected_capabilities if cap in data)
                    
                    if capabilities_found == len(expected_capabilities):
                        self.results['backend_logging']['passed'] = True
                        self.results['backend_logging']['details'].append("✅ All expected capabilities present")
                        self.results['backend_logging']['details'].append(f"Capabilities: {data}")
                        print("✅ Backend capabilities verified")
                        return True
                    else:
                        self.results['backend_logging']['details'].append(f"❌ Missing capabilities: {capabilities_found}/{len(expected_capabilities)}")
                        print(f"❌ Missing capabilities: {data}")
                        return False
                else:
                    self.results['backend_logging']['details'].append(f"❌ Capabilities check failed: HTTP {response.status}")
                    print(f"❌ Capabilities check failed: {response.status}")
                    return False
                    
        except Exception as e:
            self.results['backend_logging']['details'].append(f"❌ Capabilities check exception: {str(e)}")
            print(f"❌ Backend capabilities error: {str(e)}")
            return False

    async def test_system_prompt_effectiveness(self):
        """Test overall system prompt effectiveness"""
        print("\n🧪 Testing Overall System Prompt Effectiveness...")
        
        # Test a comprehensive scenario
        test_scenario = [
            ("Кто ты?", "identity"),
            ("Какие права граждан гарантирует Конституция Беларуси?", "constitution"),
            ("Какая погода сегодня?", "refusal"),
            ("Что говорит статья 24 Конституции?", "article_reference")
        ]
        
        passed_tests = 0
        total_tests = len(test_scenario)
        
        for question, test_type in test_scenario:
            try:
                payload = {
                    "session_id": f"{self.test_session_id}_comprehensive",
                    "message": question
                }
                
                async with self.session.post(f"{BASE_API_URL}/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        response_text = data.get('response', '').lower()
                        
                        # Evaluate based on test type
                        if test_type == "identity" and 'алеся' in response_text:
                            passed_tests += 1
                            print(f"✅ Identity test passed")
                        elif test_type == "constitution" and 'конституция' in response_text and len(response_text) > 100:
                            passed_tests += 1
                            print(f"✅ Constitution test passed")
                        elif test_type == "refusal" and 'могу отвечать только' in response_text:
                            passed_tests += 1
                            print(f"✅ Refusal test passed")
                        elif test_type == "article_reference" and 'статья' in response_text:
                            passed_tests += 1
                            print(f"✅ Article reference test passed")
                        else:
                            print(f"❌ {test_type} test failed")
                    else:
                        print(f"❌ {test_type} test - HTTP {response.status}")
                        
            except Exception as e:
                print(f"❌ {test_type} test error: {str(e)}")
        
        if passed_tests >= 3:  # At least 3 out of 4 should pass
            self.results['system_prompt_length']['passed'] = True
            self.results['system_prompt_length']['details'].append(f"✅ System prompt effectiveness: {passed_tests}/{total_tests} scenarios passed")
            print(f"✅ System Prompt Effectiveness: {passed_tests}/{total_tests} passed")
        else:
            self.results['system_prompt_length']['details'].append(f"❌ System prompt effectiveness: {passed_tests}/{total_tests} scenarios passed")
            print(f"❌ System Prompt Effectiveness: {passed_tests}/{total_tests} passed (need at least 3)")
        
        return passed_tests >= 3

    async def run_all_tests(self):
        """Run all enhanced system prompt tests"""
        print("🚀 Starting Enhanced System Prompt Tests for Алеся")
        print("=" * 80)
        
        await self.setup()
        
        try:
            # Run all specific tests as requested
            await self.test_identity_and_role()
            await self.test_constitution_knowledge()
            await self.test_non_constitution_refusal()
            await self.test_article_references()
            await self.test_voice_mode_session_creation()
            await self.test_backend_capabilities()
            await self.test_system_prompt_effectiveness()
            
        finally:
            await self.cleanup()
        
        return self.results

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 80)
        print("📊 ENHANCED SYSTEM PROMPT TEST RESULTS SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for result in self.results.values() if result['passed'])
        
        print(f"Overall: {passed_tests}/{total_tests} test categories passed")
        print()
        
        for test_name, result in self.results.items():
            status = "✅ PASS" if result['passed'] else "❌ FAIL"
            print(f"{status} {test_name.replace('_', ' ').title()}")
            
            for detail in result['details']:
                print(f"    {detail}")
            print()
        
        # Overall assessment
        if passed_tests >= 5:  # At least 5 out of 7 categories should pass
            print("🎉 OVERALL ASSESSMENT: Enhanced System Prompt is working effectively!")
            print("✅ Алеся understands her role and knowledge base correctly")
        else:
            print("⚠️ OVERALL ASSESSMENT: Enhanced System Prompt needs improvement")
            print("❌ Some critical functionality is not working as expected")

async def main():
    """Main test execution"""
    tester = AleyaSystemPromptTester()
    results = await tester.run_all_tests()
    tester.print_summary()
    
    # Return exit code based on results
    passed_tests = sum(1 for result in results.values() if result['passed'])
    return 0 if passed_tests >= 5 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)