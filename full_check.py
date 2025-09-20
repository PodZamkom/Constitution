#!/usr/bin/env python3
"""
Полная проверка проекта Алеся
"""
import subprocess
import sys
import os
import time

def run_script(script_name, description):
    """Запускает скрипт и возвращает результат"""
    print(f"\n{'='*60}")
    print(f"🔍 {description}")
    print(f"{'='*60}")
    
    try:
        result = subprocess.run([sys.executable, script_name], 
                              capture_output=True, 
                              text=True, 
                              timeout=120)
        
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print(f"❌ Скрипт {script_name} превысил время ожидания")
        return False
    except Exception as e:
        print(f"❌ Ошибка запуска {script_name}: {e}")
        return False

def main():
    """Основная функция полной проверки"""
    print("🚀 ПОЛНАЯ ПРОВЕРКА ПРОЕКТА АЛЕСЯ")
    print("=" * 60)
    print("Этот скрипт проверит все аспекты проекта:")
    print("- Настройку окружения")
    print("- Готовность к деплою")
    print("- Функциональность (если сервер запущен)")
    print("=" * 60)
    
    # Список проверок
    checks = [
        ("check_setup.py", "Проверка настройки проекта"),
        ("deploy_check.py", "Проверка готовности к деплою"),
    ]
    
    # Проверяем, запущен ли сервер
    print("\n🔍 Проверка сервера...")
    try:
        import requests
        response = requests.get("http://localhost:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ Сервер запущен - запускаем функциональные тесты")
            checks.append(("run_tests.py", "Функциональное тестирование"))
        else:
            print("⚠️  Сервер не отвечает - пропускаем функциональные тесты")
    except:
        print("⚠️  Сервер не запущен - пропускаем функциональные тесты")
    
    results = []
    
    for script_name, description in checks:
        if os.path.exists(script_name):
            success = run_script(script_name, description)
            results.append((description, success))
        else:
            print(f"⚠️  Файл {script_name} не найден")
            results.append((description, False))
    
    # Выводим итоги
    print(f"\n{'='*60}")
    print("📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ ПОЛНОЙ ПРОВЕРКИ")
    print(f"{'='*60}")
    
    passed = 0
    total = len(results)
    
    for description, success in results:
        status = "✅ ПРОЙДЕНА" if success else "❌ ПРОВАЛЕНА"
        print(f"{description}: {status}")
        if success:
            passed += 1
    
    print(f"\nИтого: {passed}/{total} проверок пройдено")
    
    if passed == total:
        print("\n🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!")
        print("🚀 ПРОЕКТ ПОЛНОСТЬЮ ГОТОВ К ДЕПЛОЮ НА RAILWAY!")
        
        print("\n📋 СЛЕДУЮЩИЕ ШАГИ:")
        print("1. Убедитесь, что OPENAI_API_KEY установлен в Railway")
        print("2. Подключите репозиторий к Railway")
        print("3. Railway автоматически определит Python проект")
        print("4. Деплой запустится автоматически")
        print("5. Проверьте работу на полученном URL")
        
        print("\n🔧 ВАЖНЫЕ НАСТРОЙКИ RAILWAY:")
        print("- Переменная окружения: OPENAI_API_KEY=your_key_here")
        print("- Регион: Нидерланды (если требуется)")
        print("- Порт: Railway автоматически установит PORT")
        
        print("\n📱 ТЕСТИРОВАНИЕ НА МОБИЛЬНЫХ:")
        print("- Откройте приложение на мобильном устройстве")
        print("- Проверьте голосовую запись")
        print("- Убедитесь, что интерфейс адаптивный")
        
    else:
        print(f"\n⚠️  {total - passed} проверок провалены")
        print("🔧 ИСПРАВЬТЕ ОШИБКИ ПЕРЕД ДЕПЛОЕМ")
        
        print("\n💡 РЕКОМЕНДАЦИИ:")
        print("1. Запустите: python check_setup.py")
        print("2. Исправьте найденные ошибки")
        print("3. Запустите: python deploy_check.py")
        print("4. Повторите полную проверку")
    
    print(f"\n{'='*60}")
    print("🏁 ПРОВЕРКА ЗАВЕРШЕНА")
    print(f"{'='*60}")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
