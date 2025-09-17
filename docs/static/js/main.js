// Основная логика приложения для GitHub Pages
const BACKEND_URL = 'https://belarus-constitution-backend.herokuapp.com'; // URL развернутого бэкенда
let sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
let voiceMode = false;
let voiceChat = null;
let voiceModeStatus = 'disconnected';
let capabilities = {};

// Voice Mode WebRTC Class
class RealtimeAudioChat {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.audioElement = null;
        this.sessionToken = null;
        this.sessionModel = "gpt-4o-realtime-preview-2024-12-17";
        this.onStatusChange = null;
        this.onError = null;
    }

    async init() {
        try {
            console.log('Initializing Voice Mode for Алеся...');
            
            // Get session from backend
            const tokenResponse = await fetch(`${BACKEND_URL}/api/voice/realtime/session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    voice: "shimmer", // Female voice for Алеся
                    model: "gpt-4o-realtime-preview-2024-12-17"
                })
            });
            
            if (!tokenResponse.ok) {
                throw new Error(`Session request failed: ${tokenResponse.status}`);
            }
            
            const data = await tokenResponse.json();
            if (!data.client_secret?.value) {
                throw new Error("Failed to get session token");
            }
            
            this.sessionToken = data.client_secret.value;
            this.sessionModel = (data.model) || this.sessionModel;

            console.log('Voice Mode session created successfully');

            // Create and set up WebRTC peer connection
            this.peerConnection = new RTCPeerConnection();
            this.setupAudioElement();
            await this.setupLocalAudio();
            this.setupDataChannel();

            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Send offer to backend and get answer
            const response = await fetch(`${BACKEND_URL}/api/voice/realtime/negotiate`, {
                method: "POST",
                body: offer.sdp,
                headers: {
                    "Content-Type": "application/sdp",
                    "Authorization": `Bearer ${this.sessionToken}`,
                    "X-OpenAI-Model": this.sessionModel
                }
            });
            
            if (!response.ok) {
                throw new Error(`Negotiation failed: ${response.status}`);
            }

            const { sdp: answerSdp } = await response.json();
            const answer = {
                type: "answer",
                sdp: answerSdp
            };

            await this.peerConnection.setRemoteDescription(answer);
            console.log("WebRTC connection established for Алеся Voice Mode");
            
            if (this.onStatusChange) {
                this.onStatusChange('connected');
            }
            
        } catch (error) {
            console.error("Failed to initialize Алеся audio chat:", error);
            if (this.onError) {
                this.onError(error.message);
            }
            throw error;
        }
    }

    setupAudioElement() {
        if (!this.audioElement) {
            this.audioElement = document.createElement("audio");
            this.audioElement.autoplay = true;
            document.body.appendChild(this.audioElement);
        }

        this.peerConnection.ontrack = (event) => {
            this.audioElement.srcObject = event.streams[0];
        };
    }

    async setupLocalAudio() {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, stream);
        });
    }

    setupDataChannel() {
        this.dataChannel = this.peerConnection.createDataChannel("oai-events");
        this.dataChannel.onmessage = (event) => {
            console.log("Received event:", event.data);
        };
        
        this.dataChannel.onopen = () => {
            console.log("Data channel opened");
            if (this.onStatusChange) {
                this.onStatusChange('ready');
            }
        };
        
        this.dataChannel.onclose = () => {
            console.log("Data channel closed");
            if (this.onStatusChange) {
                this.onStatusChange('disconnected');
            }
        };
    }
    
    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        
        if (this.audioElement) {
            document.body.removeChild(this.audioElement);
            this.audioElement = null;
        }
        
        if (this.onStatusChange) {
            this.onStatusChange('disconnected');
        }
    }
}

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
            if (voiceModeStatus === 'ready' || voiceModeStatus === 'connected') {
                createVoiceActiveControls();
            } else {
                createVoiceControls();
            }
        }
    } else {
        chatInput.style.display = 'flex';
        if (voiceControls) {
            voiceControls.remove();
        }
        // Disconnect voice mode when switching to text
        if (voiceChat) {
            disconnectVoiceMode();
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

function createVoiceActiveControls() {
    const chatContainer = document.querySelector('.chat-container');
    const voiceControls = document.createElement('div');
    voiceControls.className = 'voice-mode-controls';
    voiceControls.innerHTML = `
        <div class="voice-active">
            <div class="voice-indicator">
                🎤 <strong>Говорите!</strong> Я слушаю...
            </div>
            <button class="voice-disconnect-btn" onclick="disconnectVoiceMode()">
                Завершить разговор
            </button>
            <p class="voice-hint">
                💡 Вы можете перебивать меня в любой момент
            </p>
        </div>
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

async function connectVoiceMode() {
    if (!capabilities.voice_mode_available) {
        alert('Voice Mode недоступен. Проверьте настройки сервера.');
        return;
    }
    
    setVoiceModeStatus('connecting');
    
    try {
        const newVoiceChat = new RealtimeAudioChat();
        
        newVoiceChat.onStatusChange = (status) => {
            setVoiceModeStatus(status);
        };
        
        newVoiceChat.onError = (error) => {
            alert(`Ошибка Voice Mode: ${error}`);
            setVoiceModeStatus('disconnected');
        };
        
        await newVoiceChat.init();
        voiceChat = newVoiceChat;
        
    } catch (error) {
        console.error('Voice mode connection failed:', error);
        alert('Не удалось подключиться к Voice Mode. Попробуйте еще раз.');
        setVoiceModeStatus('disconnected');
    }
}

function disconnectVoiceMode() {
    if (voiceChat) {
        voiceChat.disconnect();
        voiceChat = null;
    }
    setVoiceModeStatus('disconnected');
}

function setVoiceModeStatus(status) {
    voiceModeStatus = status;
    updateVoiceStatusDisplay();
    
    // Update interface if in voice mode
    if (voiceMode) {
        const voiceControls = document.querySelector('.voice-mode-controls');
        if (voiceControls) {
            voiceControls.remove();
        }
        
        if (status === 'ready' || status === 'connected') {
            createVoiceActiveControls();
        } else {
            createVoiceControls();
        }
    }
}

function updateVoiceStatusDisplay() {
    const statusIndicator = document.querySelector('.status-indicator');
    if (statusIndicator) {
        statusIndicator.className = `status-indicator ${voiceModeStatus}`;
        statusIndicator.innerHTML = `
            <span class="status-dot"></span>
            Статус: ${getVoiceModeStatusText()}
        `;
    }
}

function getVoiceModeStatusText() {
    switch (voiceModeStatus) {
        case 'connecting': return 'Подключение...';
        case 'connected': return 'Подключен';
        case 'ready': return 'Готов к разговору';
        case 'disconnected': return 'Отключен';
        default: return 'Неизвестно';
    }
}

// Load capabilities on page load
async function loadCapabilities() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/capabilities`);
        if (response.ok) {
            const data = await response.json();
            capabilities = data;
            console.log('Backend capabilities:', data);
        }
    } catch (error) {
        console.error('Failed to load capabilities:', error);
    }
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
    
    // Load capabilities on page load
    loadCapabilities();
});
