#!/usr/bin/env python3
"""
Скрипт для запуска всех тестов проекта
"""
import subprocess
import sys
import os
import time

def run_test(test_file, description):
    """Запускает тест и возвращает результат"""
    print(f"\n{'='*60}")
    print(f"🧪 {description}")
    print(f"{'='*60}")
    
    try:
        result = subprocess.run([sys.executable, test_file], 
                              capture_output=True, 
                              text=True, 
                              timeout=60)
        
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print(f"❌ Тест {test_file} превысил время ожидания")
        return False
    except Exception as e:
        print(f"❌ Ошибка запуска теста {test_file}: {e}")
        return False

def check_server_running():
    """Проверяет, запущен ли сервер"""
    import requests
    try:
        response = requests.get("http://localhost:8000/health", timeout=5)
        return response.status_code == 200
    except:
        return False

def main():
    """Основная функция"""
    print("🚀 Запуск тестов проекта Алеся")
    print("=" * 60)
    
    # Проверяем, запущен ли сервер
    print("🔍 Проверка сервера...")
    if not check_server_running():
        print("❌ Сервер не запущен на localhost:8000")
        print("💡 Запустите сервер командой: python startup.py")
        return False
    
    print("✅ Сервер запущен")
    
    # Список тестов
    tests = [
        ("voice_test.py", "Тесты голосового режима"),
        ("mobile_test.py", "Тесты мобильной совместимости"),
        ("integration_test.py", "Интеграционное тестирование"),
    ]
    
    results = []
    
    for test_file, description in tests:
        if os.path.exists(test_file):
            success = run_test(test_file, description)
            results.append((description, success))
        else:
            print(f"⚠️  Файл {test_file} не найден")
            results.append((description, False))
    
    # Выводим итоги
    print(f"\n{'='*60}")
    print("📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ")
    print(f"{'='*60}")
    
    passed = 0
    total = len(results)
    
    for description, success in results:
        status = "✅ ПРОЙДЕН" if success else "❌ ПРОВАЛЕН"
        print(f"{description}: {status}")
        if success:
            passed += 1
    
    print(f"\nИтого: {passed}/{total} тестов пройдено")
    
    if passed == total:
        print("🎉 Все тесты пройдены успешно!")
        print("🚀 Проект готов к деплою на Railway!")
    else:
        print("⚠️  Некоторые тесты провалены.")
        print("🔧 Рекомендуется исправить ошибки перед деплоем.")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
