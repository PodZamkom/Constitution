#!/usr/bin/env python3
"""
Скрипт для проверки готовности к деплою на Railway
"""
import os
import sys
import subprocess
import requests
import json

def check_railway_config():
    """Проверяет конфигурацию Railway"""
    print("🚂 Проверка конфигурации Railway...")
    
    required_files = [
        'railway.json',
        'startup.py', 
        'requirements.txt',
        'backend/server.py'
    ]
    
    for file in required_files:
        if os.path.exists(file):
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ {file} не найден")
            return False
    
    # Проверяем содержимое railway.json
    try:
        with open('railway.json', 'r') as f:
            config = json.load(f)
        
        if 'deploy' in config and 'startCommand' in config['deploy']:
            print(f"  ✅ Команда запуска: {config['deploy']['startCommand']}")
        else:
            print("  ❌ Неправильная конфигурация railway.json")
            return False
            
    except Exception as e:
        print(f"  ❌ Ошибка чтения railway.json: {e}")
        return False
    
    return True

def check_requirements():
    """Проверяет requirements.txt"""
    print("\n📦 Проверка requirements.txt...")
    
    try:
        with open('requirements.txt', 'r') as f:
            lines = f.readlines()
        
        required_packages = [
            'fastapi',
            'uvicorn',
            'openai',
            'python-multipart',
            'pydantic'
        ]
        
        installed_packages = [line.split('==')[0] for line in lines if '==' in line]
        
        for package in required_packages:
            if package in installed_packages:
                print(f"  ✅ {package}")
            else:
                print(f"  ❌ {package} не найден в requirements.txt")
                return False
        
        print(f"  ✅ Всего пакетов: {len(lines)}")
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка чтения requirements.txt: {e}")
        return False

def check_startup_script():
    """Проверяет скрипт запуска"""
    print("\n🚀 Проверка startup.py...")
    
    try:
        with open('startup.py', 'r') as f:
            content = f.read()
        
        required_elements = [
            'uvicorn.run',
            'backend.server:app',
            'host="0.0.0.0"',
            'port='
        ]
        
        for element in required_elements:
            if element in content:
                print(f"  ✅ {element}")
            else:
                print(f"  ❌ {element} не найден")
                return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка чтения startup.py: {e}")
        return False

def check_environment_variables():
    """Проверяет переменные окружения"""
    print("\n🌍 Проверка переменных окружения...")
    
    # Проверяем, что OPENAI_API_KEY используется в коде
    try:
        with open('backend/server.py', 'r') as f:
            content = f.read()
        
        if 'OPENAI_API_KEY' in content:
            print("  ✅ OPENAI_API_KEY используется в коде")
        else:
            print("  ❌ OPENAI_API_KEY не найден в коде")
            return False
        
        if 'os.environ.get("PORT"' in content:
            print("  ✅ PORT переменная используется")
        else:
            print("  ❌ PORT переменная не найдена")
            return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка проверки переменных: {e}")
        return False

def check_cors_config():
    """Проверяет CORS конфигурацию"""
    print("\n🌐 Проверка CORS конфигурации...")
    
    try:
        with open('backend/server.py', 'r') as f:
            content = f.read()
        
        if 'allow_origins=["*"]' in content:
            print("  ✅ CORS настроен для всех источников")
        else:
            print("  ❌ CORS не настроен правильно")
            return False
        
        if 'CORSMiddleware' in content:
            print("  ✅ CORSMiddleware подключен")
        else:
            print("  ❌ CORSMiddleware не найден")
            return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка проверки CORS: {e}")
        return False

def check_api_endpoints():
    """Проверяет API эндпоинты"""
    print("\n🔌 Проверка API эндпоинтов...")
    
    try:
        with open('backend/server.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        required_endpoints = [
            '"/health"',
            '"/api/capabilities"',
            '"/api/chat"',
            '"/api/transcribe"',
            '"/api/voice/realtime/session"'
        ]
        
        for endpoint in required_endpoints:
            if endpoint in content:
                print(f"  ✅ {endpoint}")
            else:
                print(f"  ❌ {endpoint} не найден")
                return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка проверки эндпоинтов: {e}")
        return False

def check_mobile_compatibility():
    """Проверяет мобильную совместимость"""
    print("\n📱 Проверка мобильной совместимости...")
    
    try:
        with open('frontend/src/App.js', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Проверяем наличие обработчиков для мобильных устройств
        mobile_features = [
            'onTouchStart',
            'onTouchEnd',
            'getUserMedia',
            'MediaRecorder'
        ]
        
        for feature in mobile_features:
            if feature in content:
                print(f"  ✅ {feature}")
            else:
                print(f"  ⚠️  {feature} не найден (может быть не критично)")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка проверки мобильной совместимости: {e}")
        return False

def check_error_handling():
    """Проверяет обработку ошибок"""
    print("\n🛡️  Проверка обработки ошибок...")
    
    try:
        with open('backend/server.py', 'r') as f:
            content = f.read()
        
        error_handling = [
            'try:',
            'except Exception as e:',
            'HTTPException',
            'logger.error'
        ]
        
        for element in error_handling:
            if element in content:
                print(f"  ✅ {element}")
            else:
                print(f"  ⚠️  {element} не найден")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка проверки обработки ошибок: {e}")
        return False

def main():
    """Основная функция проверки готовности к деплою"""
    print("🚀 Проверка готовности к деплою на Railway")
    print("=" * 60)
    
    checks = [
        ("Конфигурация Railway", check_railway_config),
        ("Requirements.txt", check_requirements),
        ("Скрипт запуска", check_startup_script),
        ("Переменные окружения", check_environment_variables),
        ("CORS конфигурация", check_cors_config),
        ("API эндпоинты", check_api_endpoints),
        ("Мобильная совместимость", check_mobile_compatibility),
        ("Обработка ошибок", check_error_handling),
    ]
    
    results = []
    
    for check_name, check_func in checks:
        try:
            result = check_func()
            results.append((check_name, result))
        except Exception as e:
            print(f"  ❌ Критическая ошибка в {check_name}: {e}")
            results.append((check_name, False))
    
    print("\n" + "=" * 60)
    print("📊 РЕЗУЛЬТАТЫ ПРОВЕРКИ ГОТОВНОСТИ")
    print("=" * 60)
    
    passed = 0
    total = len(results)
    
    for check_name, result in results:
        status = "✅ ГОТОВО" if result else "❌ НЕ ГОТОВО"
        print(f"{check_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nИтого: {passed}/{total} проверок пройдено")
    
    if passed == total:
        print("\n🎉 ПРОЕКТ ПОЛНОСТЬЮ ГОТОВ К ДЕПЛОЮ!")
        print("\n📋 Инструкции по деплою:")
        print("1. Убедитесь, что OPENAI_API_KEY установлен в Railway")
        print("2. Подключите репозиторий к Railway")
        print("3. Railway автоматически определит Python проект")
        print("4. Деплой запустится автоматически")
        print("5. Проверьте работу на полученном URL")
        
        print("\n🔧 Дополнительные настройки:")
        print("- Убедитесь, что в Railway установлена переменная OPENAI_API_KEY")
        print("- Проверьте, что порт настроен правильно (Railway автоматически установит PORT)")
        print("- Убедитесь, что регион деплоя - Нидерланды (если требуется)")
        
    else:
        print(f"\n⚠️  {total - passed} проверок провалены")
        print("🔧 Исправьте ошибки перед деплоем")
        print("\n💡 Рекомендации:")
        print("- Проверьте все файлы конфигурации")
        print("- Убедитесь, что все зависимости установлены")
        print("- Проверьте код на ошибки")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
