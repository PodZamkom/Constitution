// Основная логика приложения для GitHub Pages
const BACKEND_URL = 'https://your-backend-url.herokuapp.com'; // Замените на ваш URL бэкенда
let sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
let voiceMode = false;

function setMode(isVoiceMode) {
    voiceMode = isVoiceMode;
    const buttons = document.querySelectorAll('.mode-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Обновить интерфейс в зависимости от режима
    updateInterface();
}

function updateInterface() {
    const chatInput = document.querySelector('.chat-input');
    const voiceControls = document.querySelector('.voice-mode-controls');
    
    if (voiceMode) {
        chatInput.style.display = 'none';
        if (!voiceControls) {
            createVoiceControls();
        }
    } else {
        chatInput.style.display = 'flex';
        if (voiceControls) {
            voiceControls.remove();
        }
    }
}

function createVoiceControls() {
    const chatContainer = document.querySelector('.chat-container');
    const voiceControls = document.createElement('div');
    voiceControls.className = 'voice-mode-controls';
    voiceControls.innerHTML = `
        <div class="voice-status">
            <p>Режим голосового общения в реальном времени</p>
            <div class="status-indicator disconnected">
                <span class="status-dot"></span>
                Статус: Отключен
            </div>
        </div>
        <button class="voice-connect-btn" onclick="connectVoiceMode()">
            Подключиться к голосовому чату
        </button>
    `;
    chatContainer.appendChild(voiceControls);
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    input.value = '';

    // Показать индикатор загрузки
    showLoadingIndicator();

    // Отправить сообщение на бэкенд
    fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId,
            message: message
        })
    })
    .then(response => response.json())
    .then(data => {
        hideLoadingIndicator();
        addMessage(data.response, 'assistant');
    })
    .catch(error => {
        console.error('Error:', error);
        hideLoadingIndicator();
        addMessage('Извините, произошла ошибка при отправке сообщения. Проверьте подключение к интернету.', 'assistant');
    });
}

function addMessage(content, role) {
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('ru-RU');
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <span class="message-text">${content}</span>
            ${role === 'assistant' ? '<button class="tts-btn" onclick="playTTS(\'' + content.replace(/'/g, "\\'") + '\')" title="Озвучить ответ">🔊</button>' : ''}
        </div>
        <div class="message-time">${timeString}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showLoadingIndicator() {
    const messagesContainer = document.getElementById('messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = 'loading-indicator';
    loadingDiv.innerHTML = `
        <div class="message-content loading">
            <span>Ассистент думает...</span>
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

function playTTS(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        window.speechSynthesis.speak(utterance);
    }
}

function connectVoiceMode() {
    alert('Voice Mode требует настройки бэкенда. Пожалуйста, используйте текстовый режим.');
}

// Обработка Enter для отправки сообщения
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});
