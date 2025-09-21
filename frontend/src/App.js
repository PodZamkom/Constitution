import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { RealtimeClient } from '@openai/realtime-api-beta';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Voice Mode RealtimeClient Class
class RealtimeAudioChat {
  constructor() {
    this.client = null;
    this.audioContext = null;
    this.audioWorkletNode = null;
    this.mediaStream = null;
    this.onStatusChange = null;
    this.onError = null;
    this.onMessage = null;
    this.isConnected = false;
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
      if (!data.client_secret) {
        throw new Error("Failed to get session token");
      }
      
      // Initialize RealtimeClient with relay server
      this.client = new RealtimeClient({ 
        url: `${BACKEND_URL}/api/voice/realtime/ws`,
        dangerouslyAllowAPIKeyInBrowser: true
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Configure session parameters
      this.client.updateSession({
        instructions: 'Ты Алеся - AI-ассистент по Конституции Республики Беларусь. Отвечай на вопросы согласно Конституции РБ редакции 2022 года. Говори дружелюбно и профессионально.',
        voice: 'shimmer',
        turn_detection: { type: 'server_vad' },
        input_audio_transcription: { model: 'whisper-1' },
        output_audio_format: 'pcm_16000'
      });

      // Connect to Realtime API
      await this.client.connect();
      
      // Set up audio processing
      await this.setupAudioProcessing();
      
      this.isConnected = true;
      console.log("Voice Mode connected successfully for Алеся");
      
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

  setupEventHandlers() {
    // Handle errors
    this.client.on('error', (event) => {
      console.error('RealtimeClient error:', event);
      if (this.onError) {
        this.onError(event.error?.message || 'Connection error');
      }
    });

    // Handle conversation updates
    this.client.on('conversation.updated', ({ item, delta }) => {
      console.log('Conversation updated:', item, delta);
      
      if (item.type === 'message' && item.role === 'assistant') {
        if (this.onMessage) {
          this.onMessage(item.content?.[0]?.text || '');
        }
      }
    });

    // Handle conversation interruption
    this.client.on('conversation.interrupted', () => {
      console.log('Conversation interrupted by user');
    });

    // Handle item completion
    this.client.on('conversation.item.completed', ({ item }) => {
      if (item.type === 'message' && item.role === 'assistant') {
        console.log('Assistant message completed');
        if (this.onStatusChange) {
          this.onStatusChange('ready');
        }
      }
    });
  }

  async setupAudioProcessing() {
    try {
      // Get user media with proper audio constraints
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Set up AudioContext for processing
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      // Create audio source from microphone
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create ScriptProcessorNode for audio processing
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (this.isConnected && this.client) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          
          // Send audio data to Realtime API
          this.client.appendInputAudio(int16Data);
        }
      };
      
      source.connect(processor);
      processor.connect(this.audioContext.destination);
      
      console.log('Audio processing setup complete');
      
    } catch (error) {
      console.error('Error setting up audio processing:', error);
      throw error;
    }
  }

  // Send a text message
  sendMessage(text) {
    if (this.client && this.isConnected) {
      this.client.sendUserMessageContent([{ type: 'input_text', text: text }]);
    }
  }

  // Start listening (trigger response)
  startListening() {
    if (this.client && this.isConnected) {
      this.client.createResponse();
    }
  }

  // Stop current response
  stopResponse() {
    if (this.client && this.isConnected) {
      const items = this.client.conversation.getItems();
      const currentItem = items[items.length - 1];
      if (currentItem && currentItem.status === 'in_progress') {
        this.client.cancelResponse(currentItem.id, 0);
      }
    }
  }
  
  disconnect() {
    this.isConnected = false;
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    if (this.client) {
      this.client.disconnect();
      this.client = null;
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
      const voiceChat = new RealtimeAudioChat();
      
      // Set up event handlers
      voiceChat.onStatusChange = (status) => {
        setVoiceModeStatus(status);
        if (status === 'connected') {
          setVoiceChat(voiceChat);
        }
      };
      
      voiceChat.onError = (error) => {
        console.error('Voice mode error:', error);
        alert(`Ошибка голосового режима: ${error}`);
        setVoiceModeStatus('disconnected');
      };
      
      voiceChat.onMessage = (text) => {
        // Add assistant message to chat
        const assistantMessage = {
          id: Date.now().toString(),
          content: text,
          role: 'assistant',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      };
      
      // Initialize voice chat
      await voiceChat.init();
      
    } catch (error) {
      console.error('Voice mode connection failed:', error);
      alert(`Не удалось подключиться к Voice Mode: ${error.message}`);
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
                    className={`voice-btn ${isRecording ? 'recording' : ''}`}
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    disabled={isLoading || isTranscribing}
                    title="Удерживайте для записи голоса"
                  >
                    {isRecording ? '🔴' : '🎤'}
                  </button>
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
                  <div className="voice-controls">
                    <button 
                      className="voice-listen-btn"
                      onClick={() => voiceChat?.startListening()}
                      disabled={voiceModeStatus !== 'ready'}
                    >
                      {voiceModeStatus === 'ready' ? '🎤 Начать разговор' : '⏳ Обработка...'}
                    </button>
                    <button 
                      className="voice-stop-btn"
                      onClick={() => voiceChat?.stopResponse()}
                      disabled={voiceModeStatus === 'ready'}
                    >
                      ⏹️ Остановить
                    </button>
                    <button 
                      className="voice-disconnect-btn"
                      onClick={disconnectVoiceMode}
                    >
                      ❌ Завершить разговор
                    </button>
                  </div>
                  <p className="voice-hint">
                    💡 Говорите естественно - я буду отвечать голосом
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