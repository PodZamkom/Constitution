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
      console.log('🎤 [VOICE INIT] Starting Voice Mode initialization for Алеся...');
      console.log('🎤 [VOICE INIT] Backend URL:', BACKEND_URL);
      
      // Step 1: Get session from backend
      console.log('🎤 [VOICE INIT] Step 1: Requesting session from backend...');
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
      
      console.log('🎤 [VOICE INIT] Session response status:', tokenResponse.status);
      console.log('🎤 [VOICE INIT] Session response headers:', Object.fromEntries(tokenResponse.headers.entries()));
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('🎤 [VOICE INIT] Session request failed:', errorText);
        throw new Error(`Session request failed: ${tokenResponse.status} - ${errorText}`);
      }
      
      const data = await tokenResponse.json();
      console.log('🎤 [VOICE INIT] Session data received:', data);
      
      if (!data.client_secret) {
        console.error('🎤 [VOICE INIT] No client_secret in response:', data);
        throw new Error("Failed to get session token");
      }
      
      console.log('🎤 [VOICE INIT] Step 2: Initializing RealtimeClient...');
      // Initialize RealtimeClient with relay server
      this.client = new RealtimeClient({ 
        url: `${BACKEND_URL}/api/voice/realtime/ws`,
        dangerouslyAllowAPIKeyInBrowser: true
      });
      console.log('🎤 [VOICE INIT] RealtimeClient created successfully');

      // Set up event handlers
      console.log('🎤 [VOICE INIT] Step 3: Setting up event handlers...');
      this.setupEventHandlers();
      console.log('🎤 [VOICE INIT] Event handlers set up');

      // Configure session parameters
      console.log('🎤 [VOICE INIT] Step 4: Configuring session parameters...');
      this.client.updateSession({
        instructions: 'Ты Алеся - AI-ассистент по Конституции Республики Беларусь. Отвечай на вопросы согласно Конституции РБ редакции 2022 года. Говори дружелюбно и профессионально.',
        voice: 'shimmer',
        turn_detection: { type: 'server_vad' },
        input_audio_transcription: { model: 'whisper-1' },
        output_audio_format: 'pcm_16000'
      });
      console.log('🎤 [VOICE INIT] Session parameters configured');

      // Connect to Realtime API
      console.log('🎤 [VOICE INIT] Step 5: Connecting to Realtime API...');
      await this.client.connect();
      console.log('🎤 [VOICE INIT] Connected to Realtime API successfully');
      
      // Set up audio processing
      console.log('🎤 [VOICE INIT] Step 6: Setting up audio processing...');
      await this.setupAudioProcessing();
      console.log('🎤 [VOICE INIT] Audio processing set up successfully');
      
      this.isConnected = true;
      console.log('🎤 [VOICE INIT] ✅ Voice Mode connected successfully for Алеся');
      
      if (this.onStatusChange) {
        this.onStatusChange('connected');
      }
      
    } catch (error) {
      console.error("🎤 [VOICE INIT] ❌ Failed to initialize Алеся audio chat:", error);
      console.error("🎤 [VOICE INIT] Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      if (this.onError) {
        this.onError(error.message);
      }
      throw error;
    }
  }

  setupEventHandlers() {
    console.log('🎤 [EVENT HANDLERS] Setting up event handlers...');
    
    // Handle errors
    this.client.on('error', (event) => {
      console.error('🎤 [EVENT HANDLERS] ❌ RealtimeClient error:', event);
      console.error('🎤 [EVENT HANDLERS] Error details:', {
        type: event.type,
        error: event.error,
        message: event.message
      });
      if (this.onError) {
        this.onError(event.error?.message || 'Connection error');
      }
    });

    // Handle conversation updates
    this.client.on('conversation.updated', ({ item, delta }) => {
      console.log('🎤 [EVENT HANDLERS] 📝 Conversation updated:', {
        itemType: item.type,
        itemRole: item.role,
        itemStatus: item.status,
        hasDelta: !!delta,
        deltaType: delta ? Object.keys(delta) : null
      });
      
      if (item.type === 'message' && item.role === 'assistant') {
        console.log('🎤 [EVENT HANDLERS] 🤖 Assistant message received:', item.content);
        if (this.onMessage) {
          this.onMessage(item.content?.[0]?.text || '');
        }
      }
    });

    // Handle conversation interruption
    this.client.on('conversation.interrupted', () => {
      console.log('🎤 [EVENT HANDLERS] ⏸️ Conversation interrupted by user');
    });

    // Handle item completion
    this.client.on('conversation.item.completed', ({ item }) => {
      console.log('🎤 [EVENT HANDLERS] ✅ Item completed:', {
        type: item.type,
        role: item.role,
        status: item.status
      });
      if (item.type === 'message' && item.role === 'assistant') {
        console.log('🎤 [EVENT HANDLERS] 🤖 Assistant message completed');
        if (this.onStatusChange) {
          this.onStatusChange('ready');
        }
      }
    });

    // Handle realtime events
    this.client.on('realtime.event', ({ time, source, event }) => {
      console.log('🎤 [EVENT HANDLERS] 🔄 Realtime event:', {
        time,
        source,
        eventType: event.type,
        event: event
      });
    });

    console.log('🎤 [EVENT HANDLERS] ✅ Event handlers set up successfully');
  }

  async setupAudioProcessing() {
    try {
      console.log('🎤 [AUDIO SETUP] Starting audio processing setup...');
      
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }
      
      console.log('🎤 [AUDIO SETUP] Requesting microphone access...');
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
      
      console.log('🎤 [AUDIO SETUP] ✅ Microphone access granted');
      console.log('🎤 [AUDIO SETUP] Media stream tracks:', this.mediaStream.getTracks().length);
      console.log('🎤 [AUDIO SETUP] Audio track settings:', this.mediaStream.getAudioTracks()[0]?.getSettings());

      // Set up AudioContext for processing
      console.log('🎤 [AUDIO SETUP] Creating AudioContext...');
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      console.log('🎤 [AUDIO SETUP] AudioContext state:', this.audioContext.state);
      console.log('🎤 [AUDIO SETUP] AudioContext sample rate:', this.audioContext.sampleRate);

      // Create audio source from microphone
      console.log('🎤 [AUDIO SETUP] Creating audio source...');
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create ScriptProcessorNode for audio processing
      console.log('🎤 [AUDIO SETUP] Creating ScriptProcessorNode...');
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      let audioChunkCount = 0;
      processor.onaudioprocess = (event) => {
        if (this.isConnected && this.client) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          
          // Log every 10th chunk to avoid spam
          audioChunkCount++;
          if (audioChunkCount % 10 === 0) {
            console.log('🎤 [AUDIO PROCESSING] Sending audio chunk #' + audioChunkCount, {
              dataLength: int16Data.length,
              sampleRate: inputBuffer.sampleRate,
              duration: inputBuffer.duration
            });
          }
          
          // Send audio data to Realtime API
          try {
            this.client.appendInputAudio(int16Data);
          } catch (error) {
            console.error('🎤 [AUDIO PROCESSING] Error sending audio:', error);
          }
        }
      };
      
      console.log('🎤 [AUDIO SETUP] Connecting audio nodes...');
      source.connect(processor);
      processor.connect(this.audioContext.destination);
      
      console.log('🎤 [AUDIO SETUP] ✅ Audio processing setup complete');
      console.log('🎤 [AUDIO SETUP] Audio graph connected successfully');
      
    } catch (error) {
      console.error('🎤 [AUDIO SETUP] ❌ Error setting up audio processing:', error);
      console.error('🎤 [AUDIO SETUP] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Send a text message
  sendMessage(text) {
    console.log('🎤 [VOICE ACTIONS] 📤 Sending text message:', text);
    if (this.client && this.isConnected) {
      try {
        this.client.sendUserMessageContent([{ type: 'input_text', text: text }]);
        console.log('🎤 [VOICE ACTIONS] ✅ Text message sent successfully');
      } catch (error) {
        console.error('🎤 [VOICE ACTIONS] ❌ Error sending text message:', error);
      }
    } else {
      console.warn('🎤 [VOICE ACTIONS] ⚠️ Cannot send message - client not connected');
    }
  }

  // Start listening (trigger response)
  startListening() {
    console.log('🎤 [VOICE ACTIONS] 🎤 Starting listening...');
    if (this.client && this.isConnected) {
      try {
        this.client.createResponse();
        console.log('🎤 [VOICE ACTIONS] ✅ Response creation triggered');
      } catch (error) {
        console.error('🎤 [VOICE ACTIONS] ❌ Error starting response:', error);
      }
    } else {
      console.warn('🎤 [VOICE ACTIONS] ⚠️ Cannot start listening - client not connected');
    }
  }

  // Stop current response
  stopResponse() {
    console.log('🎤 [VOICE ACTIONS] ⏹️ Stopping current response...');
    if (this.client && this.isConnected) {
      try {
        const items = this.client.conversation.getItems();
        console.log('🎤 [VOICE ACTIONS] Current conversation items:', items.length);
        const currentItem = items[items.length - 1];
        if (currentItem && currentItem.status === 'in_progress') {
          console.log('🎤 [VOICE ACTIONS] Cancelling response for item:', currentItem.id);
          this.client.cancelResponse(currentItem.id, 0);
          console.log('🎤 [VOICE ACTIONS] ✅ Response cancelled');
        } else {
          console.log('🎤 [VOICE ACTIONS] No active response to cancel');
        }
      } catch (error) {
        console.error('🎤 [VOICE ACTIONS] ❌ Error stopping response:', error);
      }
    } else {
      console.warn('🎤 [VOICE ACTIONS] ⚠️ Cannot stop response - client not connected');
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
    console.log('🎤 [CONNECT VOICE] Starting voice mode connection...');
    console.log('🎤 [CONNECT VOICE] Capabilities:', capabilities);
    
    if (!capabilities.voice_mode_available) {
      console.error('🎤 [CONNECT VOICE] ❌ Voice Mode not available');
      alert('Voice Mode недоступен. Проверьте настройки сервера.');
      return;
    }
    
    console.log('🎤 [CONNECT VOICE] Setting status to connecting...');
    setVoiceModeStatus('connecting');
    
    try {
      console.log('🎤 [CONNECT VOICE] Creating RealtimeAudioChat instance...');
      const voiceChat = new RealtimeAudioChat();
      
      // Set up event handlers
      console.log('🎤 [CONNECT VOICE] Setting up event handlers...');
      voiceChat.onStatusChange = (status) => {
        console.log('🎤 [CONNECT VOICE] Status changed:', status);
        setVoiceModeStatus(status);
        if (status === 'connected') {
          console.log('🎤 [CONNECT VOICE] ✅ Voice chat connected, setting instance');
          setVoiceChat(voiceChat);
        }
      };
      
      voiceChat.onError = (error) => {
        console.error('🎤 [CONNECT VOICE] ❌ Voice mode error:', error);
        alert(`Ошибка голосового режима: ${error}`);
        setVoiceModeStatus('disconnected');
      };
      
      voiceChat.onMessage = (text) => {
        console.log('🎤 [CONNECT VOICE] 📝 Received message from voice chat:', text);
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
      console.log('🎤 [CONNECT VOICE] Initializing voice chat...');
      await voiceChat.init();
      console.log('🎤 [CONNECT VOICE] ✅ Voice chat initialization completed');
      
    } catch (error) {
      console.error('🎤 [CONNECT VOICE] ❌ Voice mode connection failed:', error);
      console.error('🎤 [CONNECT VOICE] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
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