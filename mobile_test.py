#!/usr/bin/env python3
"""
Тест для проверки мобильной совместимости голосового режима
"""
import requests
import json
import time

# Настройки
BACKEND_URL = "http://localhost:8000"

def test_mobile_voice_recording():
    """Тест голосовой записи для мобильных устройств"""
    print("📱 Тестирование мобильной голосовой записи...")
    
    # Симулируем различные типы аудиофайлов, которые могут отправлять мобильные устройства
    test_cases = [
        {
            "name": "WebM Opus (Chrome Mobile)",
            "filename": "recording.webm",
            "mime_type": "audio/webm;codecs=opus",
            "content": b"fake_webm_opus_audio_data"
        },
        {
            "name": "WebM (Firefox Mobile)",
            "filename": "recording.webm", 
            "mime_type": "audio/webm",
            "content": b"fake_webm_audio_data"
        },
        {
            "name": "MP4 AAC (Safari Mobile)",
            "filename": "recording.m4a",
            "mime_type": "audio/mp4",
            "content": b"fake_mp4_aac_audio_data"
        }
    ]
    
    results = []
    
    for test_case in test_cases:
        print(f"  🔍 Тестирование {test_case['name']}...")
        
        try:
            # Создаем файл с правильным MIME типом
            files = {
                'file': (
                    test_case['filename'],
                    test_case['content'],
                    test_case['mime_type']
                )
            }
            
            response = requests.post(
                f"{BACKEND_URL}/api/transcribe",
                files=files,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"    ✅ {test_case['name']} - успешно обработан")
                results.append(True)
            else:
                print(f"    ❌ {test_case['name']} - ошибка {response.status_code}: {response.text}")
                results.append(False)
                
        except Exception as e:
            print(f"    ❌ {test_case['name']} - исключение: {e}")
            results.append(False)
    
    return all(results)

def test_cors_headers():
    """Тест CORS заголовков для мобильных браузеров"""
    print("🌐 Тестирование CORS заголовков...")
    
    try:
        # Тестируем preflight запрос
        response = requests.options(
            f"{BACKEND_URL}/api/transcribe",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type"
            },
            timeout=10
        )
        
        cors_headers = {
            "Access-Control-Allow-Origin": response.headers.get("Access-Control-Allow-Origin"),
            "Access-Control-Allow-Methods": response.headers.get("Access-Control-Allow-Methods"),
            "Access-Control-Allow-Headers": response.headers.get("Access-Control-Allow-Headers"),
        }
        
        print(f"  CORS заголовки: {cors_headers}")
        
        if cors_headers["Access-Control-Allow-Origin"] == "*":
            print("  ✅ CORS настроен правильно для мобильных устройств")
            return True
        else:
            print("  ❌ CORS не настроен для всех источников")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка CORS теста: {e}")
        return False

def test_mobile_user_agents():
    """Тест с различными User-Agent мобильных браузеров"""
    print("📱 Тестирование с мобильными User-Agent...")
    
    mobile_user_agents = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
        "Mozilla/5.0 (Mobile; rv:68.0) Gecko/68.0 Firefox/68.0"
    ]
    
    results = []
    
    for ua in mobile_user_agents:
        print(f"  🔍 Тестирование {ua.split('(')[1].split(')')[0]}...")
        
        try:
            response = requests.get(
                f"{BACKEND_URL}/api/capabilities",
                headers={"User-Agent": ua},
                timeout=10
            )
            
            if response.status_code == 200:
                print(f"    ✅ Успешно")
                results.append(True)
            else:
                print(f"    ❌ Ошибка {response.status_code}")
                results.append(False)
                
        except Exception as e:
            print(f"    ❌ Исключение: {e}")
            results.append(False)
    
    return all(results)

def test_audio_permissions():
    """Тест эндпоинтов для проверки разрешений на аудио"""
    print("🎤 Тестирование разрешений на аудио...")
    
    try:
        # Проверяем, что сервер возвращает правильные заголовки для аудио
        response = requests.get(f"{BACKEND_URL}/api/capabilities", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Возможности: {data}")
            
            # Проверяем, что голосовые функции доступны
            if data.get('voice_mode_available') or data.get('chat'):
                print("  ✅ Голосовые функции доступны")
                return True
            else:
                print("  ❌ Голосовые функции недоступны")
                return False
        else:
            print(f"  ❌ Ошибка получения возможностей: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка теста разрешений: {e}")
        return False

def main():
    """Основная функция тестирования мобильной совместимости"""
    print("📱 Запуск тестов мобильной совместимости")
    print("=" * 60)
    
    tests = [
        ("CORS заголовки", test_cors_headers),
        ("Мобильные User-Agent", test_mobile_user_agents),
        ("Разрешения на аудио", test_audio_permissions),
        ("Мобильная голосовая запись", test_mobile_voice_recording),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n📋 {test_name}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Критическая ошибка в тесте {test_name}: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("📊 РЕЗУЛЬТАТЫ МОБИЛЬНОГО ТЕСТИРОВАНИЯ")
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
        print("🎉 Все мобильные тесты пройдены успешно!")
        print("📱 Приложение готово для работы на мобильных устройствах")
    else:
        print("⚠️  Некоторые мобильные тесты провалены.")
        print("📱 Рекомендуется проверить настройки для мобильных устройств")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
