#!/usr/bin/env python3
"""
Тест для отладки голосового режима
Проверяет все этапы подключения и работы Voice Mode
"""

import asyncio
import websockets
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def test_voice_mode():
    """Тестирует голосовой режим пошагово"""
    
    print("🎤 [VOICE DEBUG TEST] Starting voice mode debug test...")
    
    # 1. Проверяем API ключ
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY not found in environment")
        return False
    print(f"✅ OpenAI API key found: {api_key[:10]}...")
    
    # 2. Тестируем WebSocket соединение с бэкендом
    backend_url = "ws://localhost:8001/api/voice/realtime/ws"
    print(f"🔌 Testing WebSocket connection to: {backend_url}")
    
    try:
        async with websockets.connect(backend_url) as websocket:
            print("✅ WebSocket connection to backend established")
            
            # 3. Отправляем тестовое сообщение
            test_message = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": "Test connection",
                    "voice": "shimmer"
                }
            }
            
            print("📤 Sending test message to backend...")
            await websocket.send(json.dumps(test_message))
            print("✅ Test message sent")
            
            # 4. Ждем ответ
            print("⏳ Waiting for response...")
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                print(f"📥 Received response: {response[:200]}...")
                print("✅ Backend WebSocket is working")
            except asyncio.TimeoutError:
                print("⚠️ No response received within 10 seconds")
            
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")
        return False
    
    # 5. Тестируем прямой доступ к OpenAI (если нужно)
    print("\n🔍 Testing direct OpenAI connection...")
    openai_url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    try:
        async with websockets.connect(openai_url, extra_headers=headers) as openai_ws:
            print("✅ Direct OpenAI connection established")
            
            # Отправляем тестовую конфигурацию
            test_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "instructions": "Test connection to OpenAI"
                }
            }
            
            await openai_ws.send(json.dumps(test_config))
            print("✅ Test configuration sent to OpenAI")
            
            # Ждем ответ
            try:
                response = await asyncio.wait_for(openai_ws.recv(), timeout=5.0)
                print(f"📥 OpenAI response: {response[:200]}...")
                print("✅ OpenAI Realtime API is accessible")
            except asyncio.TimeoutError:
                print("⚠️ No response from OpenAI within 5 seconds")
                
    except Exception as e:
        print(f"❌ Direct OpenAI connection failed: {e}")
        print("💡 This might be due to regional restrictions or API issues")
    
    print("\n🎤 [VOICE DEBUG TEST] Test completed!")
    return True

if __name__ == "__main__":
    asyncio.run(test_voice_mode())
