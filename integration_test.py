#!/usr/bin/env python3
"""
Интеграционный тест для проверки всего функционала
"""
import requests
import json
import time
import os
import tempfile
import wave
import numpy as np
from io import BytesIO

# Настройки
BACKEND_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:3000"

def create_test_audio():
    """Создает тестовый аудиофайл"""
    sample_rate = 16000
    duration = 2
    frequency = 440
    
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio_data = np.sin(2 * np.pi * frequency * t)
    audio_data = (audio_data * 32767).astype(np.int16)
    
    wav_buffer = BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())
    
    wav_buffer.seek(0)
    return wav_buffer.getvalue()

def test_backend_health():
    """Тест здоровья бэкенда"""
    print("🔍 Тест здоровья бэкенда...")
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=10)
        if response.status_code == 200:
            print("  ✅ Бэкенд работает")
            return True
        else:
            print(f"  ❌ Бэкенд вернул код {response.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Ошибка подключения к бэкенду: {e}")
        return False

def test_openai_integration():
    """Тест интеграции с OpenAI"""
    print("🔍 Тест интеграции с OpenAI...")
    try:
        # Проверяем capabilities
        response = requests.get(f"{BACKEND_URL}/api/capabilities", timeout=10)
        if response.status_code != 200:
            print("  ❌ Не удалось получить capabilities")
            return False
        
        data = response.json()
        if not data.get('chat'):
            print("  ❌ Чат недоступен")
            return False
        
        # Тестируем чат
        chat_response = requests.post(
            f"{BACKEND_URL}/api/chat",
            json={
                "message": "Привет! Это тест.",
                "session_id": "test_integration"
            },
            timeout=30
        )
        
        if chat_response.status_code == 200:
            print("  ✅ OpenAI интеграция работает")
            return True
        else:
            print(f"  ❌ Чат вернул код {chat_response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка тестирования OpenAI: {e}")
        return False

def test_voice_transcription():
    """Тест голосовой транскрипции"""
    print("🔍 Тест голосовой транскрипции...")
    try:
        audio_data = create_test_audio()
        
        files = {'file': ('test.wav', audio_data, 'audio/wav')}
        response = requests.post(
            f"{BACKEND_URL}/api/transcribe",
            files=files,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✅ Транскрипция работает: {data.get('transcription', 'Пустой ответ')}")
            return True
        else:
            print(f"  ❌ Транскрипция вернула код {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка транскрипции: {e}")
        return False

def test_streaming_chat():
    """Тест потокового чата"""
    print("🔍 Тест потокового чата...")
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/chat/stream",
            json={
                "message": "Расскажи кратко о Конституции Беларуси",
                "session_id": "test_stream"
            },
            stream=True,
            timeout=30
        )
        
        if response.status_code == 200:
            print("  ✅ Потоковый чат работает")
            # Читаем несколько чанков
            chunk_count = 0
            for line in response.iter_lines():
                if line and chunk_count < 2:
                    try:
                        data = json.loads(line.decode().replace('data: ', ''))
                        if 'content' in data:
                            print(f"    Получен чанк: {data['content'][:50]}...")
                            chunk_count += 1
                    except:
                        pass
                if chunk_count >= 2:
                    break
            return True
        else:
            print(f"  ❌ Потоковый чат вернул код {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка потокового чата: {e}")
        return False

def test_voice_session():
    """Тест создания голосовой сессии"""
    print("🔍 Тест голосовой сессии...")
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/voice/realtime/session",
            json={
                "voice": "shimmer",
                "model": "gpt-4o-realtime-preview-2024-12-17"
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✅ Голосовая сессия создана: {data['session_id'][:20]}...")
            return True
        else:
            print(f"  ❌ Создание сессии вернуло код {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка создания сессии: {e}")
        return False

def test_cors_headers():
    """Тест CORS заголовков"""
    print("🔍 Тест CORS заголовков...")
    try:
        response = requests.options(
            f"{BACKEND_URL}/api/chat",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST"
            },
            timeout=10
        )
        
        cors_origin = response.headers.get("Access-Control-Allow-Origin")
        if cors_origin == "*":
            print("  ✅ CORS настроен правильно")
            return True
        else:
            print(f"  ❌ CORS не настроен: {cors_origin}")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка CORS теста: {e}")
        return False

def test_mobile_compatibility():
    """Тест мобильной совместимости"""
    print("🔍 Тест мобильной совместимости...")
    try:
        mobile_headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15"
        }
        
        response = requests.get(
            f"{BACKEND_URL}/api/capabilities",
            headers=mobile_headers,
            timeout=10
        )
        
        if response.status_code == 200:
            print("  ✅ Мобильная совместимость OK")
            return True
        else:
            print(f"  ❌ Мобильный запрос вернул код {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка мобильного теста: {e}")
        return False

def test_railway_readiness():
    """Тест готовности к деплою на Railway"""
    print("🔍 Тест готовности к Railway...")
    try:
        # Проверяем переменные окружения
        port = os.environ.get("PORT", "8000")
        print(f"  Порт: {port}")
        
        # Проверяем, что сервер может запуститься
        response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        if response.status_code == 200:
            print("  ✅ Сервер готов к деплою")
            return True
        else:
            print("  ❌ Сервер не готов")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка проверки Railway: {e}")
        return False

def main():
    """Основная функция интеграционного тестирования"""
    print("🧪 Интеграционное тестирование проекта Алеся")
    print("=" * 60)
    
    tests = [
        ("Здоровье бэкенда", test_backend_health),
        ("OpenAI интеграция", test_openai_integration),
        ("Голосовая транскрипция", test_voice_transcription),
        ("Потоковый чат", test_streaming_chat),
        ("Голосовая сессия", test_voice_session),
        ("CORS заголовки", test_cors_headers),
        ("Мобильная совместимость", test_mobile_compatibility),
        ("Готовность к Railway", test_railway_readiness),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n📋 {test_name}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"  ❌ Критическая ошибка: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("📊 РЕЗУЛЬТАТЫ ИНТЕГРАЦИОННОГО ТЕСТИРОВАНИЯ")
    print("=" * 60)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ ПРОЙДЕН" if result else "❌ ПРОВАЛЕН"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nИтого: {passed}/{total} тестов пройдено")
    
    if passed == total:
        print("\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!")
        print("🚀 Проект полностью готов к деплою на Railway!")
        print("\n📋 Следующие шаги:")
        print("1. Убедитесь, что OPENAI_API_KEY установлен в Railway")
        print("2. Подключите репозиторий к Railway")
        print("3. Запустите деплой")
        print("4. Проверьте работу на продакшене")
    else:
        print(f"\n⚠️  {total - passed} тестов провалены")
        print("🔧 Исправьте ошибки перед деплоем")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
