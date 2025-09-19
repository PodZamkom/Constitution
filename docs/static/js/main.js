// Основная логика приложения для GitHub Pages
function resolveBackendUrl() {
    const candidates = [
        typeof window !== 'undefined' ? window.BACKEND_URL : null,
        typeof window !== 'undefined' ? window.REACT_APP_BACKEND_URL : null,
        typeof window !== 'undefined' ? window.__BACKEND_URL__ : null,
    ];

    if (typeof window !== 'undefined' && window.process && window.process.env) {
        candidates.push(window.process.env.REACT_APP_BACKEND_URL);
    }

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.replace(/\/+$/, '');
        }
    }

    if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return window.location.origin.replace(/\/+$/, '');
    }

    return '';
}

const BACKEND_URL = resolveBackendUrl();
const DEFAULT_VOICE_INSTRUCTIONS = "Ты консультант по Конституции Республики Беларусь. Отвечай только по Конституции 2022 года, всегда указывай номер статьи. Если вопрос не относится к Конституции — вежливо отказывай.";
const DEFAULT_VOICE_NAME = 'alloy';
const DEFAULT_VOICE_MODEL = 'gpt-4o-realtime-preview-latest';
let sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
let voiceMode = false;
let voiceChat = null;
let voiceModeStatus = 'disconnected';
let capabilities = {};

function getFallbackCapabilities() {
    return {
        chat: true,
        chat_available: true,
        voice_mode: true,
        voice_mode_available: true,
        voice_model: DEFAULT_VOICE_MODEL,
    };
}

function ensureCapabilityDefaults() {
    if (!capabilities || typeof capabilities !== 'object') {
        capabilities = getFallbackCapabilities();
        return;
    }

    if (!capabilities.voice_model) {
        capabilities.voice_model = DEFAULT_VOICE_MODEL;
    }

    if (typeof capabilities.voice_mode === 'undefined') {
        capabilities.voice_mode = true;
    }
}

// Voice Mode WebRTC Class
class RealtimeAudioChat {
    constructor(options = {}) {
        this.peerConnection = null;
        this.dataChannel = null;
        this.audioElement = null;
        this.sessionToken = null;
        this.sessionModel = options.model || DEFAULT_VOICE_MODEL;
        this.voiceName = options.voice || DEFAULT_VOICE_NAME;
        this.instructions = options.instructions || DEFAULT_VOICE_INSTRUCTIONS;
        this.backendUrl = options.backendUrl || BACKEND_URL;
        this.onStatusChange = null;
        this.onError = null;
    }

    async init() {
        try {
            console.log('Initializing Voice Mode for Алеся...');
            
            // РЕАЛЬНЫЙ API вызов для создания сессии
            const payload = {
                voice: this.voiceName,
                model: this.sessionModel,
            };
            if (this.instructions) {
                payload.instructions = this.instructions;
            }

            const tokenResponse = await fetch(`${this.backendUrl}/api/voice/realtime/session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!tokenResponse.ok) {
                throw new Error(`Session request failed: ${tokenResponse.status}`);
            }

            const data = await tokenResponse.json();
            if (!data.client_secret?.value) {
                throw new Error("Failed to get session token");
            }

            this.sessionToken = data.client_secret.value;
            this.sessionModel = data.model || this.sessionModel;
            if (data.voice) {
                this.voiceName = data.voice;
            }

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
            const response = await fetch(`${this.backendUrl}/api/voice/realtime/negotiate`, {
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
    if (isVoiceMode && capabilities.voice_mode === false) {
        alert('Голосовой режим сейчас недоступен.');
        return;
    }

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
    const disabled = capabilities.voice_mode === false;
    voiceControls.innerHTML = `
        <div class="voice-status">
            <p>Режим голосового общения в реальном времени</p>
            <div class="status-indicator disconnected">
                <span class="status-dot"></span>
                Статус: Отключен
            </div>
        </div>
        <button class="voice-connect-btn" onclick="connectVoiceMode()" ${disabled ? 'disabled' : ''}>
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

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    input.value = '';

    // Показать индикатор загрузки
    showLoadingIndicator();

    try {
        // РЕАЛЬНЫЙ API вызов к ChatGPT
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                session_id: sessionId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        hideLoadingIndicator();
        addMessage(data.response, 'assistant');
    } catch (error) {
        console.error('Error:', error);
        hideLoadingIndicator();
        addMessage('Извините, произошла ошибка при отправке сообщения. Проверьте подключение к интернету.', 'assistant');
    }
}

function generateLocalResponse(message) {
    const messageLower = message.toLowerCase();
    
    // Greeting responses
    if (messageLower.includes('привет') || messageLower.includes('здравствуй') || messageLower.includes('добрый день')) {
        return "Привет! Меня зовут Алеся. Я ваш консультант по Конституции Республики Беларусь редакции 2022 года. Я знаю наизусть всю Конституцию и помогу вам с любыми вопросами о ней. Что вас интересует?";
    }
    
    // Constitution-related responses
    if (messageLower.includes('конституция') || messageLower.includes('статья') || messageLower.includes('права') || messageLower.includes('обязанности')) {
        return `Отличный вопрос о Конституции Республики Беларусь! Вы спросили: "${message}". 

Согласно Конституции РБ редакции 2022 года, основные принципы нашего государства включают:
- Народовластие (статья 3)
- Верховенство права (статья 7) 
- Разделение властей (статья 6)
- Социальная справедливость (статья 21)

Если вас интересует конкретная статья, укажите номер, и я дам подробный ответ.`;
    }
    
    // Rights and freedoms
    if (messageLower.includes('права') || messageLower.includes('свободы')) {
        return `Права и свободы граждан Республики Беларусь закреплены в разделе II Конституции (статьи 21-63).

Основные права включают:
- Право на жизнь (статья 24)
- Право на свободу и личную неприкосновенность (статья 25)
- Право на неприкосновенность жилища (статья 28)
- Право на образование (статья 49)
- Право на труд (статья 41)

Справка: это регулируется статьями 21-63 Конституции Республики Беларусь.`;
    }
    
    // State structure
    if (messageLower.includes('государство') || messageLower.includes('президент') || messageLower.includes('парламент')) {
        return `Государственное устройство Республики Беларусь определено в разделе III Конституции (статьи 79-116).

Основные органы власти:
- Президент Республики Беларусь (статьи 79-89)
- Парламент - Национальное собрание (статьи 90-100)
- Правительство - Совет Министров (статьи 106-116)
- Суды (статьи 109-116)

Справка: это регулируется статьями 79-116 Конституции Республики Беларусь.`;
    }
    
    // General responses
    return `Меня зовут Алеся, и я могу отвечать только по вопросам Конституции Республики Беларусь. Вы спросили: "${message}". 

Пожалуйста, задайте вопрос о Конституции, и я с радостью помогу вам разобраться в любых правовых аспектах нашего основного закона.

Например, вы можете спросить о:
- Правах и свободах граждан
- Государственном устройстве
- Конкретных статьях Конституции
- Принципах правового государства`;
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
    if (voiceModeStatus === 'connecting') {
        return;
    }

    if (capabilities.voice_mode === false) {
        alert('Голосовой режим сейчас недоступен.');
        setVoiceModeStatus('disconnected');
        return;
    }

    setVoiceModeStatus('connecting');

    const options = {
        backendUrl: BACKEND_URL,
        model: capabilities.voice_model || undefined,
        voice: capabilities.voice_name || DEFAULT_VOICE_NAME,
        instructions: capabilities.voice_instructions || DEFAULT_VOICE_INSTRUCTIONS,
    };

    if (voiceChat && typeof voiceChat.disconnect === 'function') {
        voiceChat.disconnect();
    }

    voiceChat = new RealtimeAudioChat(options);
    voiceChat.onStatusChange = (status) => setVoiceModeStatus(status);
    voiceChat.onError = (message) => {
        console.error('Voice mode error:', message);
        alert('Не удалось подключиться к Voice Mode. Попробуйте еще раз.');
        setVoiceModeStatus('disconnected');
        voiceChat = null;
    };

    try {
        await voiceChat.init();
    } catch (error) {
        console.error('Voice mode connection failed:', error);
        if (voiceChat && voiceChat.disconnect) {
            voiceChat.disconnect();
        }
        voiceChat = null;
        setVoiceModeStatus('disconnected');
        alert('Не удалось подключиться к Voice Mode. Проверьте API ключ и попробуйте снова.');
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
        // РЕАЛЬНАЯ проверка API
        const response = await fetch(`${BACKEND_URL}/api/capabilities`);
        if (response.ok) {
            capabilities = await response.json();
            console.log('API capabilities:', capabilities);
        } else {
            // Fallback если API недоступен
            capabilities = getFallbackCapabilities();
            console.log('Using fallback capabilities:', capabilities);
        }
    } catch (error) {
        console.error('Failed to load capabilities:', error);
        // Fallback при ошибке
        capabilities = getFallbackCapabilities();
    }

    ensureCapabilityDefaults();
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
