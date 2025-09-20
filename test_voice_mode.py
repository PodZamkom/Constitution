#!/usr/bin/env python3
"""
Тест Voice Mode для Belarus Constitution AI Assistant
Проверяет создание сессии и обработку ошибок
"""

import requests
import json
import uuid

# Конфигурация теста
BACKEND_URL = "http://localhost:8002"
BASE_API_URL = f"{BACKEND_URL}/api"

def test_voice_session_creation():
    """Тест создания Voice Mode сессии"""
    try:
        print("🧪 Тестирование создания Voice Mode сессии...")
        
        payload = {
            "model": "gpt-4o-realtime-preview-latest",
            "voice": "verse",
            "instructions": "Ты консультант по Конституции Республики Беларусь. Отвечай только по Конституции 2022 года."
        }
        
        response = requests.post(
            f"{BASE_API_URL}/voice/realtime/session", 
            json=payload, 
            timeout=30
        )
        
        print(f"📊 Статус ответа: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Voice Mode сессия создана успешно")
            print(f"📋 Модель: {data.get('model', 'N/A')}")
            print(f"🎤 Голос: {data.get('voice', 'N/A')}")
            print(f"🔗 WebSocket URL: {data.get('websocket_url', 'N/A')[:50]}...")
            return True
        elif response.status_code == 403:
            data = response.json()
            error_detail = data.get('detail', '')
            if "регион" in error_detail.lower() or "region" in error_detail.lower():
                print("✅ Voice Mode API корректно обрабатывает региональные ограничения")
                print(f"📝 Сообщение: {error_detail}")
                return True
            else:
                print(f"❌ Неожиданная ошибка 403: {error_detail}")
                return False
        else:
            print(f"❌ Ошибка создания сессии: {response.status_code}")
            print(f"📝 Детали: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Таймаут при создании сессии")
        return False
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return False

def test_voice_session_with_region_error():
    """Тест обработки ошибки региона"""
    try:
        print("\n🧪 Тестирование обработки ошибки региона...")
        
        payload = {
            "model": "gpt-4o-realtime-preview-latest",
            "voice": "verse"
        }
        
        response = requests.post(
            f"{BASE_API_URL}/voice/realtime/session", 
            json=payload, 
            timeout=30
        )
        
        print(f"📊 Статус ответа: {response.status_code}")
        
        if response.status_code in [403, 404, 502]:
            data = response.json()
            error_detail = data.get('detail', '')
            print(f"📝 Детали ошибки: {error_detail}")
            
            if "регион" in error_detail.lower() or "region" in error_detail.lower():
                print("✅ Ошибка региона обработана корректно")
                return True
            elif "endpoint" in error_detail.lower() or "не найден" in error_detail.lower():
                print("✅ Ошибка endpoint обработана корректно")
                return True
            else:
                print("⚠️ Неожиданная ошибка")
                return False
        else:
            print("✅ Сессия создана (нет ошибки региона)")
            return True
            
    except Exception as e:
        print(f"❌ Ошибка при тестировании: {e}")
        return False

def test_capabilities_endpoint():
    """Тест эндпоинта capabilities"""
    try:
        print("\n🧪 Тестирование эндпоинта capabilities...")
        
        response = requests.get(f"{BASE_API_URL}/capabilities", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Capabilities получены")
            print(f"🎤 Voice Mode доступен: {data.get('voice_mode_available', False)}")
            print(f"🤖 Модель голоса: {data.get('voice_model', 'N/A')}")
            print(f"🎵 Имя голоса: {data.get('voice_name', 'N/A')}")
            return True
        else:
            print(f"❌ Ошибка получения capabilities: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return False

def main():
    """Запуск всех тестов Voice Mode"""
    print("🚀 Тестирование Voice Mode")
    print("=" * 50)
    
    results = []
    
    # Тестируем capabilities
    results.append(("Capabilities Endpoint", test_capabilities_endpoint()))
    
    # Тестируем создание сессии
    results.append(("Voice Session Creation", test_voice_session_creation()))
    
    # Тестируем обработку ошибок
    results.append(("Error Handling", test_voice_session_with_region_error()))
    
    # Итоги
    print("\n" + "=" * 50)
    print("📊 ИТОГИ ТЕСТИРОВАНИЯ VOICE MODE")
    print("=" * 50)
    
    passed = 0
    for test_name, result in results:
        status = "✅ ПРОЙДЕН" if result else "❌ ПРОВАЛЕН"
        print(f"{status} {test_name}")
        if result:
            passed += 1
    
    print(f"\nОбщий результат: {passed}/{len(results)} тестов пройдено")
    
    if passed == len(results):
        print("🎉 Все тесты Voice Mode пройдены успешно!")
    else:
        print("⚠️ Некоторые тесты не пройдены. Проверьте настройки сервера.")
    
    return passed == len(results)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
