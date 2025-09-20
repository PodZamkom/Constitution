#!/usr/bin/env python3
"""
Тест для проверки голосового режима и транскрипции
"""
import requests
import json
import os
import tempfile
import wave
import numpy as np
from io import BytesIO

# Настройки
BACKEND_URL = "http://localhost:8000"
TEST_AUDIO_DURATION = 3  # секунды

def create_test_audio():
    """Создает тестовый аудиофайл с синусоидальным сигналом"""
    sample_rate = 16000
    duration = TEST_AUDIO_DURATION
    frequency = 440  # A4 note
    
    # Генерируем синусоидальный сигнал
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio_data = np.sin(2 * np.pi * frequency * t)
    
    # Конвертируем в 16-bit PCM
    audio_data = (audio_data * 32767).astype(np.int16)
    
    # Создаем WAV файл в памяти
    wav_buffer = BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)  # моно
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())
    
    wav_buffer.seek(0)
    return wav_buffer.getvalue()

def test_health():
    """Тест здоровья сервера"""
    print("🔍 Тестирование здоровья сервера...")
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=10)
        if response.status_code == 200:
            print("✅ Сервер работает")
            return True
        else:
            print(f"❌ Сервер вернул код {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка подключения к серверу: {e}")
        return False

def test_capabilities():
    """Тест возможностей сервера"""
    print("🔍 Тестирование возможностей сервера...")
    try:
        response = requests.get(f"{BACKEND_URL}/api/capabilities", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Возможности сервера: {data}")
            
            if not data.get('chat'):
                print("❌ Чат недоступен")
                return False
                
            if not data.get('voice_mode_available'):
                print("⚠️  Голосовой режим недоступен (ожидаемо для тестирования)")
            
            return True
        else:
            print(f"❌ Не удалось получить возможности сервера: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка при получении возможностей: {e}")
        return False

def test_chat():
    """Тест чата"""
    print("🔍 Тестирование чата...")
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/chat",
            json={
                "message": "Привет! Как дела?",
                "session_id": "test_session"
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Чат работает. Ответ: {data['response'][:100]}...")
            return True
        else:
            print(f"❌ Чат вернул код {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Ошибка в чате: {e}")
        return False

def test_voice_session():
    """Тест создания голосовой сессии"""
    print("🔍 Тестирование создания голосовой сессии...")
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
            print(f"✅ Голосовая сессия создана: {data['session_id']}")
            return True
        else:
            print(f"❌ Создание сессии вернуло код {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Ошибка создания голосовой сессии: {e}")
        return False

def test_transcription():
    """Тест транскрипции аудио"""
    print("🔍 Тестирование транскрипции аудио...")
    try:
        # Создаем тестовый аудиофайл
        audio_data = create_test_audio()
        
        # Отправляем на транскрипцию
        files = {'file': ('test.wav', audio_data, 'audio/wav')}
        response = requests.post(
            f"{BACKEND_URL}/api/transcribe",
            files=files,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Транскрипция работает. Результат: {data.get('transcription', 'Пустой ответ')}")
            return True
        else:
            print(f"❌ Транскрипция вернула код {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Ошибка транскрипции: {e}")
        return False

def test_streaming_chat():
    """Тест потокового чата"""
    print("🔍 Тестирование потокового чата...")
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/chat/stream",
            json={
                "message": "Расскажи о Конституции Беларуси",
                "session_id": "test_stream_session"
            },
            stream=True,
            timeout=30
        )
        
        if response.status_code == 200:
            print("✅ Потоковый чат работает")
            # Читаем первые несколько чанков
            chunk_count = 0
            for line in response.iter_lines():
                if line and chunk_count < 3:
                    print(f"   Чанк: {line.decode()}")
                    chunk_count += 1
                if chunk_count >= 3:
                    break
            return True
        else:
            print(f"❌ Потоковый чат вернул код {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Ошибка потокового чата: {e}")
        return False

def main():
    """Основная функция тестирования"""
    print("🚀 Запуск тестов голосового режима")
    print("=" * 50)
    
    tests = [
        ("Здоровье сервера", test_health),
        ("Возможности сервера", test_capabilities),
        ("Чат", test_chat),
        ("Голосовая сессия", test_voice_session),
        ("Транскрипция", test_transcription),
        ("Потоковый чат", test_streaming_chat),
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
    
    print("\n" + "=" * 50)
    print("📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ")
    print("=" * 50)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ ПРОЙДЕН" if result else "❌ ПРОВАЛЕН"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nИтого: {passed}/{total} тестов пройдено")
    
    if passed == total:
        print("🎉 Все тесты пройдены успешно!")
    else:
        print("⚠️  Некоторые тесты провалены. Проверьте настройки сервера.")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
