import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const BACKEND_URL = 'https://web-production-9ed88.up.railway.app';
const VERSION = '2.0.0'; // Force cache refresh

// Voice Mode WebSocket Class
class RealtimeAudioChat {
  constructor({
    backendUrl,
    voice,
    model,
    instructions,
  }) {
    this.websocket = null;
    this.audioElement = null;
    this.websocketUrl = null;
    this.sessionModel = model || "gpt-4o-realtime-preview-latest";
    this.backendUrl = backendUrl;
    this.voiceName = voice || "verse";
    this.instructions = instructions || null;
    this.onStatusChange = null;
    this.onError = null;
    this.localStream = null;
    this.mediaRecorder = null;
    this.isRecording = false;
  }

  async init() {
    try {
      console.log('Initializing Voice Mode for Алеся... (v2.0.0 - WebSocket)');
      
      // Get session from backend
      const tokenResponse = await fetch(`${this.backendUrl}/api/voice/realtime/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          voice: this.voiceName,
          model: this.sessionModel,
          instructions: this.instructions || undefined,
        })
      });

      if (!tokenResponse.ok) {
        throw new Error(`Session request failed: ${tokenResponse.status}`);
      }
      
      const data = await tokenResponse.json();
      if (!data.websocket_url) {
        throw new Error("Failed to get WebSocket URL");
      }
      
      this.websocketUrl = data.websocket_url;
      this.sessionModel = data.model || this.sessionModel;
      this.instructions = data.instructions || this.instructions;

      console.log('Voice Mode session created successfully');

      // Setup audio element for playback
      this.setupAudioElement();
      
      // Setup microphone access
      await this.setupLocalAudio();
      
      // Connect to WebSocket
      await this.connectWebSocket();

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
      this.audioElement.playsInline = true;
      document.body.appendChild(this.audioElement);
    }
  }

  async setupLocalAudio() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const audioTracks = this.localStream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error('Не удалось получить доступ к микрофону');
    }

    // Setup MediaRecorder for audio capture
    this.mediaRecorder = new MediaRecorder(this.localStream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        // Send audio data to WebSocket
        this.websocket.send(event.data);
      }
    };
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        console.log('Подключение к WebSocket:', this.websocketUrl);
        this.websocket = new WebSocket(this.websocketUrl);
        
        // Таймаут для подключения
        const connectionTimeout = setTimeout(() => {
          if (this.websocket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection timeout');
            this.websocket.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10 секунд
        
        this.websocket.onopen = () => {
          console.log('WebSocket подключен к Realtime API');
          clearTimeout(connectionTimeout);
          
          // Отправляем конфигурацию сессии
          this.websocket.send(JSON.stringify({
            type: 'session.update',
            session: {
              instructions: this.instructions,
              voice: this.voiceName,
              model: this.sessionModel
            }
          }));

          // Начинаем запись аудио
          this.startRecording();
          
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
          } catch (error) {
            console.error('Ошибка парсинга WebSocket сообщения:', error);
          }
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket ошибка:', error);
          clearTimeout(connectionTimeout);
          
          // Определяем тип ошибки
          let errorMessage = 'WebSocket соединение не удалось';
          if (this.websocket.readyState === WebSocket.CLOSED) {
            errorMessage = 'WebSocket соединение закрыто (возможно, проблема с регионом)';
          } else if (this.websocket.readyState === WebSocket.CONNECTING) {
            errorMessage = 'Не удалось подключиться к WebSocket (проверьте VPN)';
          }
          
          if (this.onError) {
            this.onError(errorMessage);
          }
          reject(new Error(errorMessage));
        };

        this.websocket.onclose = (event) => {
          console.log('WebSocket отключен:', event.code, event.reason);
          clearTimeout(connectionTimeout);
          
          // Анализируем код закрытия
          let closeReason = 'Неизвестная причина';
          switch (event.code) {
            case 1006:
              closeReason = 'Соединение потеряно (возможно, проблема с регионом)';
              break;
            case 1011:
              closeReason = 'Ошибка сервера';
              break;
            case 1000:
              closeReason = 'Нормальное закрытие';
              break;
            default:
              closeReason = `Код: ${event.code}`;
          }
          
          if (this.onStatusChange) {
            this.onStatusChange('disconnected');
          }
          
          if (event.code !== 1000 && this.onError) {
            this.onError(`WebSocket закрыт: ${closeReason}`);
          }
        };

      } catch (error) {
        console.error('Ошибка создания WebSocket:', error);
        reject(error);
      }
    });
  }

  handleWebSocketMessage(data) {
    console.log('Received WebSocket message:', data);
    
    switch (data.type) {
      case 'response.audio.delta':
        // Handle audio response
        if (data.delta && this.audioElement) {
          // Convert base64 audio to blob and play
          const audioBlob = this.base64ToBlob(data.delta, 'audio/mpeg');
          const audioUrl = URL.createObjectURL(audioBlob);
          this.audioElement.src = audioUrl;
          this.audioElement.play();
        }
        break;
        
      case 'response.done':
        console.log('Response completed');
        break;
        
      case 'error':
        console.error('Realtime API error:', data.error);
        if (this.onError) {
          this.onError(data.error.message || 'Unknown error');
        }
        break;
        
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  startRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorder.start(100); // Send data every 100ms
      this.isRecording = true;
      console.log('Started recording');
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.isRecording = false;
      console.log('Stopped recording');
    }
  }

  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }


  disconnect() {
    // Stop recording
    this.stopRecording();

    // Close WebSocket connection
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    // Stop local audio stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Remove audio element
    if (this.audioElement) {
      document.body.removeChild(this.audioElement);
      this.audioElement = null;
    }
    
    if (this.onStatusChange) {
      this.onStatusChange('disconnected');
    }
  }
}

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false); // false = text/voice, true = realtime voice
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceModeStatus, setVoiceModeStatus] = useState('disconnected'); // disconnected, connecting, connected, ready
  const [voiceChat, setVoiceChat] = useState(null);
  const [capabilities, setCapabilities] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load chat history and capabilities
    loadChatHistory();
    loadCapabilities();
  }, []);

  const loadCapabilities = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/capabilities`);
      if (response.ok) {
        const data = await response.json();
        setCapabilities(data);
        console.log('Backend capabilities:', data);
      }
    } catch (error) {
      console.error('Error loading capabilities:', error);
    }
  };

  const loadChatHistory = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/history/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const sendMessage = async (message = inputMessage) => {
    if (!message.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      content: message,
      role: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: message
        })
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage = {
          id: data.message_id,
          content: data.response,
          role: 'assistant',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        id: Date.now().toString(),
        content: 'Извините, произошла ошибка при отправке сообщения.',
        role: 'assistant',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      const audioChunks = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);
        
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Transcribe audio
        await transcribeAudio(audioBlob);
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      console.log('Starting voice recording...');
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Ошибка доступа к микрофону. Пожалуйста, разрешите доступ к микрофону.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      console.log('Stopping voice recording...');
    }
  };

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true);
    
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      
      const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        const transcription = data.transcription;
        
        if (transcription && transcription.trim()) {
          // Set the transcribed text as input and send it
          setInputMessage(transcription);
          setTimeout(() => {
            sendMessage(transcription);
          }, 100);
        } else {
          console.warn('Empty transcription received');
          alert('Не удалось распознать речь. Попробуйте еще раз.');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Transcription failed:', errorData);
        alert('Ошибка при распознавании речи. Попробуйте еще раз.');
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      alert('Ошибка при отправке аудио. Проверьте соединение с интернетом.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleVoiceMode = () => {
    setVoiceMode(!voiceMode);
    
    // Disconnect existing voice chat when switching modes
    if (voiceChat && voiceModeStatus !== 'disconnected') {
      disconnectVoiceMode();
    }
  };

  const connectVoiceMode = async () => {
    if (!capabilities.voice_mode_available) {
      alert('Voice Mode недоступен. Проверьте настройки сервера.');
      return;
    }

    setVoiceModeStatus('connecting');

    try {
      const newVoiceChat = new RealtimeAudioChat({
        backendUrl: BACKEND_URL,
        voice: capabilities.voice_name,
        model: capabilities.voice_model,
        instructions: capabilities.voice_instructions,
      });

      newVoiceChat.onStatusChange = (status) => {
        setVoiceModeStatus(status);
      };
      
      newVoiceChat.onError = (error) => {
        alert(`Ошибка Voice Mode: ${error}`);
        setVoiceModeStatus('disconnected');
      };
      
      await newVoiceChat.init();
      setVoiceChat(newVoiceChat);
      
    } catch (error) {
      console.error('Voice mode connection failed:', error);
      alert('Не удалось подключиться к Voice Mode. Попробуйте еще раз.');
      setVoiceModeStatus('disconnected');
    }
  };

  const disconnectVoiceMode = () => {
    if (voiceChat) {
      voiceChat.disconnect();
      setVoiceChat(null);
    }
    setVoiceModeStatus('disconnected');
  };

  const playTTS = async (text) => {
    // Simple browser TTS for now
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  };

  const getVoiceModeStatusText = () => {
    switch (voiceModeStatus) {
      case 'connecting': return 'Подключение...';
      case 'connected': return 'Подключен';
      case 'ready': return 'Готов к разговору';
      case 'disconnected': return 'Отключен';
      default: return 'Неизвестно';
    }
  };

  return (
    <div className="app">
      {/* Header with Belarus symbols */}
      <header className="app-header">
        <div className="header-content">
          <div className="symbols">
            <img 
              src="https://customer-assets.emergentagent.com/job_belarus-constitution/artifacts/zbmwau2o_1613443720_6-p-fon-dlya-prezentatsii-pro-belarus-10.jpg" 
              alt="Флаг Беларуси" 
              className="flag"
            />
            <img 
              src="https://customer-assets.emergentagent.com/job_belarus-constitution/artifacts/nvezqned_Belarus_gerb_2021.jpg" 
              alt="Герб Беларуси" 
              className="coat-of-arms"
            />
          </div>
          <h1 className="title">AI-ассистент по Конституции Республики Беларусь</h1>
          <div className="mode-toggle">
            <button 
              className={`mode-btn ${!voiceMode ? 'active' : ''}`}
              onClick={() => setVoiceMode(false)}
            >
              Текст/Голос
            </button>
            <button 
              className={`mode-btn ${voiceMode ? 'active' : ''}`}
              onClick={toggleVoiceMode}
            >
              Voice Mode
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Chat area */}
        <div className="chat-container">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="welcome-message">
                <p>Добро пожаловать! Меня зовут <strong>Алеся</strong>, и я помогу вам получить информацию по Конституции Республики Беларусь.</p>
                <p>Задайте ваш вопрос текстом или голосом, и я отвечу согласно Конституции РБ редакции 2022 года.</p>
                {voiceMode && (
                  <p>🎤 <strong>Voice Mode</strong> - режим голосового общения в реальном времени с возможностью перебивания.</p>
                )}
              </div>
            )}
            
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="message-content">
                  <span className="message-text">{message.content}</span>
                  {message.role === 'assistant' && (
                    <button 
                      className="tts-btn"
                      onClick={() => playTTS(message.content)}
                      title="Озвучить ответ"
                    >
                      🔊
                    </button>
                  )}
                </div>
                <div className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString('ru-RU')}
                </div>
              </div>
            ))}
            
            {(isLoading || isTranscribing) && (
              <div className="message assistant">
                <div className="message-content loading">
                  <span>{isTranscribing ? 'Распознавание речи...' : 'Ассистент думает...'}</span>
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {!voiceMode ? (
            <div className="chat-input">
              <div className="input-container">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Задайте ваш вопрос по Конституции Республики Беларусь..."
                  disabled={isLoading || isTranscribing}
                  rows="2"
                />
                <div className="input-buttons">
                  <button
                    className="send-btn"
                    onClick={() => sendMessage()}
                    disabled={isLoading || !inputMessage.trim() || isTranscribing}
                  >
                    Отправить
                  </button>
                </div>
              </div>
              {isRecording && (
                <div className="recording-indicator">
                  🔴 Запись... Отпустите кнопку чтобы отправить
                </div>
              )}
            </div>
          ) : (
            <div className="voice-mode-controls">
              <div className="voice-status">
                <p>Режим голосового общения в реальном времени</p>
                <div className={`status-indicator ${voiceModeStatus}`}>
                  <span className="status-dot"></span>
                  Статус: {getVoiceModeStatusText()}
                </div>
              </div>
              
              {voiceModeStatus === 'disconnected' && (
                <button 
                  className="voice-connect-btn"
                  onClick={connectVoiceMode}
                  disabled={!capabilities.voice_mode_available}
                >
                  {capabilities.voice_mode_available ? 'Подключиться к голосовому чату' : 'Voice Mode недоступен'}
                </button>
              )}
              
              {voiceModeStatus === 'connecting' && (
                <div className="voice-connecting">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <p>Подключение к Voice Mode...</p>
                </div>
              )}
              
              {(voiceModeStatus === 'connected' || voiceModeStatus === 'ready') && (
                <div className="voice-active">
                  <div className="voice-indicator">
                    🎤 <strong>Говорите!</strong> Я слушаю...
                  </div>
                  <button 
                    className="voice-disconnect-btn"
                    onClick={disconnectVoiceMode}
                  >
                    Завершить разговор
                  </button>
                  <p className="voice-hint">
                    💡 Вы можете перебивать меня в любой момент
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="avatar-container">
          <img 
            src="https://customer-assets.emergentagent.com/job_belarus-constitution/artifacts/mqexhzvw_d3788255-d883-47b1-837f-751a2e82c62b.png" 
            alt="Ассистент" 
            className="avatar"
          />
        </div>
      </main>
    </div>
  );
}

export default App;