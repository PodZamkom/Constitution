#!/usr/bin/env python3
"""
Скрипт для проверки настройки проекта
"""
import os
import sys
import subprocess
import importlib.util

def check_python_version():
    """Проверяет версию Python"""
    print("🐍 Проверка версии Python...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 9:
        print(f"✅ Python {version.major}.{version.minor}.{version.micro} - OK")
        return True
    else:
        print(f"❌ Python {version.major}.{version.minor}.{version.micro} - требуется Python 3.9+")
        return False

def check_dependencies():
    """Проверяет установленные зависимости"""
    print("\n📦 Проверка зависимостей...")
    
    required_packages = [
        'fastapi',
        'uvicorn', 
        'openai',
        'python-multipart',
        'pydantic',
        'python-dotenv',
        'requests',
        'numpy'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            spec = importlib.util.find_spec(package)
            if spec is None:
                missing_packages.append(package)
            else:
                print(f"  ✅ {package}")
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"  ❌ Отсутствуют пакеты: {', '.join(missing_packages)}")
        print("  💡 Установите командой: pip install -r requirements.txt")
        return False
    else:
        print("  ✅ Все зависимости установлены")
        return True

def check_env_file():
    """Проверяет файл .env"""
    print("\n🔐 Проверка файла .env...")
    
    if os.path.exists('.env'):
        print("  ✅ Файл .env найден")
        
        # Проверяем содержимое
        with open('.env', 'r') as f:
            content = f.read()
            
        if 'OPENAI_API_KEY' in content:
            print("  ✅ OPENAI_API_KEY найден в .env")
            return True
        else:
            print("  ⚠️  OPENAI_API_KEY не найден в .env")
            print("  💡 Добавьте: OPENAI_API_KEY=your_key_here")
            return False
    else:
        print("  ❌ Файл .env не найден")
        print("  💡 Создайте файл .env с OPENAI_API_KEY")
        return False

def check_frontend():
    """Проверяет настройку фронтенда"""
    print("\n⚛️  Проверка фронтенда...")
    
    if os.path.exists('frontend/package.json'):
        print("  ✅ package.json найден")
        
        # Проверяем node_modules
        if os.path.exists('frontend/node_modules'):
            print("  ✅ node_modules найден")
            return True
        else:
            print("  ❌ node_modules не найден")
            print("  💡 Запустите: cd frontend && npm install")
            return False
    else:
        print("  ❌ frontend/package.json не найден")
        return False

def check_railway_config():
    """Проверяет конфигурацию Railway"""
    print("\n🚂 Проверка конфигурации Railway...")
    
    files_to_check = ['railway.json', 'startup.py', 'requirements.txt']
    
    for file in files_to_check:
        if os.path.exists(file):
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ {file} не найден")
            return False
    
    print("  ✅ Конфигурация Railway готова")
    return True

def main():
    """Основная функция проверки"""
    print("🔍 Проверка настройки проекта Алеся")
    print("=" * 50)
    
    checks = [
        ("Версия Python", check_python_version),
        ("Зависимости Python", check_dependencies),
        ("Файл .env", check_env_file),
        ("Фронтенд", check_frontend),
        ("Конфигурация Railway", check_railway_config),
    ]
    
    results = []
    
    for check_name, check_func in checks:
        try:
            result = check_func()
            results.append((check_name, result))
        except Exception as e:
            print(f"  ❌ Ошибка в проверке {check_name}: {e}")
            results.append((check_name, False))
    
    print("\n" + "=" * 50)
    print("📊 РЕЗУЛЬТАТЫ ПРОВЕРКИ")
    print("=" * 50)
    
    passed = 0
    total = len(results)
    
    for check_name, result in results:
        status = "✅ ПРОЙДЕНА" if result else "❌ ПРОВАЛЕНА"
        print(f"{check_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nИтого: {passed}/{total} проверок пройдено")
    
    if passed == total:
        print("\n🎉 Все проверки пройдены!")
        print("🚀 Проект готов к запуску и деплою")
        print("\n💡 Для запуска:")
        print("   python startup.py")
        print("\n💡 Для тестирования:")
        print("   python run_tests.py")
    else:
        print("\n⚠️  Некоторые проверки провалены")
        print("🔧 Исправьте ошибки перед запуском")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
