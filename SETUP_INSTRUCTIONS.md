# 🔧 Инструкции по настройке

## Создание файла .env

Создайте файл `.env` в корневой папке проекта со следующим содержимым:

```env
# Переменные окружения для проекта Алеся
OPENAI_API_KEY=your_openai_api_key_here
PORT=8000
RAILWAY_ENVIRONMENT=production
```

**Важно:** Замените `your_openai_api_key_here` на ваш реальный ключ OpenAI API.

## Установка зависимостей

```bash
# Установите Python зависимости
pip install -r requirements.txt

# Установите зависимости фронтенда
cd frontend
npm install
cd ..
```

## Запуск проекта

```bash
# Запустите бэкенд
python startup.py

# В другом терминале запустите фронтенд
cd frontend
npm start
```

## Проверка готовности

```bash
# Полная проверка проекта
python full_check.py

# Или отдельные проверки
python check_setup.py
python deploy_check.py
```

## Тестирование

```bash
# Запустите все тесты
python run_tests.py

# Или отдельные тесты
python voice_test.py
python mobile_test.py
python integration_test.py
```

## Деплой на Railway

1. Убедитесь, что все проверки пройдены
2. Подключите репозиторий к Railway
3. Установите переменную `OPENAI_API_KEY` в Railway
4. Деплой запустится автоматически

Подробные инструкции см. в `DEPLOY.md`.
