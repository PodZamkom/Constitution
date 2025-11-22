import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Voice Mode RealtimeClient Class - РЕАЛЬНАЯ РЕАЛИЗАЦИЯ
class RealtimeAudioChat {
  constructor() {
    this.client = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.onStatusChange = null;
    this.onError = null;
    this.onMessage = null;
    this.isConnected = false;
    this.websocket = null;
  }

  async init() {
    try {
      console.log('🎤 [VOICE INIT] Starting REAL Voice Mode initialization...');
      
      // Step 1: Get session from backend
      console.log('🎤 [VOICE INIT] Step 1: Requesting session from backend...');
      const tokenResponse = await fetch(`${BACKEND_URL}/api/voice/realtime/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          voice: "shimmer",
          model: "gpt-4o-realtime-preview-2024-12-17"
        })
      });
      
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
      
      // Step 2: Connect to OpenAI Realtime API via WebSocket
      console.log('🎤 [VOICE INIT] Step 2: Connecting to OpenAI Realtime API...');
      await this.connectToRealtimeAPI(data.client_secret);
      
      // Step 3: Set up audio processing
      console.log('🎤 [VOICE INIT] Step 3: Setting up audio processing...');
      await this.setupAudioProcessing();
      
      this.isConnected = true;
      console.log('🎤 [VOICE INIT] ✅ REAL Voice Mode connected successfully!');
      
      if (this.onStatusChange) {
        this.onStatusChange('connected');
      }
      
    } catch (error) {
      console.error("🎤 [VOICE INIT] ❌ Failed to initialize REAL audio chat:", error);
      if (this.onError) {
        this.onError(error.message);
      }
      throw error;
    }
  }

  async connectToRealtimeAPI(clientSecret) {
    return new Promise((resolve, reject) => {
      console.log('🎤 [WEBSOCKET] Connecting to OpenAI Realtime API...');
      
      // Connect to OpenAI Realtime API WebSocket
      this.websocket = new WebSocket(`wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17&client_secret=${clientSecret}`);
      
      this.websocket.onopen = () => {
        console.log('🎤 [WEBSOCKET] ✅ Connected to OpenAI Realtime API');
        
        // Send session configuration
        this.websocket.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: "Ты Алеся - AI-ассистент по Конституции Республики Беларусь. Отвечай на вопросы согласно Конституции РБ редакции 2022 года. Говори дружелюбно и профессионально.",
            voice: "shimmer",
            turn_detection: { type: "server_vad" },
            input_audio_transcription: { model: "whisper-1" }
          }
        }));
        
        resolve();
      };
      
      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('🎤 [WEBSOCKET] Received message:', data);
          
          if (data.type === "conversation.item.delta") {
            if (data.delta?.audio) {
              console.log('🎤 [WEBSOCKET] 🔊 Audio delta received:', data.delta.audio.length, 'samples');
              this.playAudio(data.delta.audio);
            }
            if (data.delta?.transcript) {
              console.log('🎤 [WEBSOCKET] 📝 Transcript delta:', data.delta.transcript);
              if (this.onMessage) {
                this.onMessage(data.delta.transcript);
              }
            }
          }
        } catch (error) {
          console.error('🎤 [WEBSOCKET] Error parsing message:', error);
        }
      };
      
      this.websocket.onerror = (error) => {
        console.error('🎤 [WEBSOCKET] ❌ WebSocket error:', error);
        reject(error);
      };
      
      this.websocket.onclose = () => {
        console.log('🎤 [WEBSOCKET] Connection closed');
        this.isConnected = false;
        if (this.onStatusChange) {
          this.onStatusChange('disconnected');
        }
      };
    });
  }

  async setupAudioProcessing() {
    try {
      console.log('🎤 [AUDIO SETUP] Starting REAL audio processing setup...');
      
      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('🎤 [AUDIO SETUP] ✅ Microphone access granted');
      
      // Set up AudioContext
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });
      
      // Create audio source and processor
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      const processor = this.audioContext.createScriptProcessor(2400, 1, 1);
      
      let audioChunkCount = 0;
      processor.onaudioprocess = (event) => {
        if (this.isConnected && this.websocket) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          
          // Send audio data to OpenAI
          if (audioChunkCount % 10 === 0) {
            console.log('🎤 [AUDIO PROCESSING] Sending audio chunk #' + audioChunkCount);
          }
          
          try {
            this.websocket.send(JSON.stringify({
              type: "input_audio_buffer.append",
              audio: Array.from(int16Data)
            }));
          } catch (error) {
            console.error('🎤 [AUDIO PROCESSING] Error sending audio:', error);
          }
          
          audioChunkCount++;
        }
      };
      
      source.connect(processor);
      processor.connect(this.audioContext.destination);
      
      console.log('🎤 [AUDIO SETUP] ✅ REAL audio processing setup complete');
      
    } catch (error) {
      console.error('🎤 [AUDIO SETUP] ❌ Error setting up audio processing:', error);
      throw error;
    }
  }

  // Start listening (trigger response)
  startListening() {
    console.log('🎤 [VOICE ACTIONS] 🎤 Starting REAL listening...');
    if (this.websocket && this.isConnected) {
      try {
        this.websocket.send(JSON.stringify({
          type: "response.create"
        }));
        console.log('🎤 [VOICE ACTIONS] ✅ REAL response creation triggered');
      } catch (error) {
        console.error('🎤 [VOICE ACTIONS] ❌ Error starting response:', error);
      }
    } else {
      console.warn('🎤 [VOICE ACTIONS] ⚠️ Cannot start listening - not connected');
    }
  }

  // Stop current response
  stopResponse() {
    console.log('🎤 [VOICE ACTIONS] ⏹️ Stopping REAL response...');
    if (this.websocket && this.isConnected) {
      try {
        this.websocket.send(JSON.stringify({
          type: "response.cancel"
        }));
        console.log('🎤 [VOICE ACTIONS] ✅ REAL response cancelled');
      } catch (error) {
        console.error('🎤 [VOICE ACTIONS] ❌ Error stopping response:', error);
      }
    } else {
      console.warn('🎤 [VOICE ACTIONS] ⚠️ Cannot stop response - not connected');
    }
  }

  // Play audio from OpenAI
  playAudio(audioData) {
    try {
      console.log('🎤 [AUDIO PLAY] Playing REAL audio:', audioData.length, 'samples');
      
      // Convert Int16Array to Float32Array
      const floatData = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        floatData[i] = audioData[i] / 32768.0;
      }
      
      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(1, floatData.length, 24000);
      audioBuffer.copyToChannel(floatData, 0);
      
      // Play audio
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
      
      console.log('🎤 [AUDIO PLAY] ✅ REAL audio playing');
    } catch (error) {
      console.error('🎤 [AUDIO PLAY] ❌ Error playing audio:', error);
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
    
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
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
  const [voiceMode, setVoiceMode] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceModeStatus, setVoiceModeStatus] = useState('disconnected');
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
    fetchCapabilities();
  }, []);

  const fetchCapabilities = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/capabilities`);
      const data = await response.json();
      setCapabilities(data);
    } catch (error) {
      console.error('Error fetching capabilities:', error);
    }
  };

  const connectVoiceMode = async () => {
    try {
      console.log('🎤 [VOICE MODE] Connecting to REAL voice mode...');
      setVoiceModeStatus('connecting');
      
      const audioChat = new RealtimeAudioChat();
      
      audioChat.onStatusChange = (status) => {
        console.log('🎤 [VOICE MODE] Status changed:', status);
        setVoiceModeStatus(status);
      };
      
      audioChat.onError = (error) => {
        console.error('🎤 [VOICE MODE] Error:', error);
        setVoiceModeStatus('error');
      };
      
      audioChat.onMessage = (message) => {
        console.log('🎤 [VOICE MODE] Message received:', message);
        setMessages(prev => [...prev, { role: 'assistant', content: message }]);
      };
      
      await audioChat.init();
      setVoiceChat(audioChat);
      setVoiceMode(true);
      
    } catch (error) {
      console.error('🎤 [VOICE MODE] Failed to connect:', error);
      setVoiceModeStatus('error');
    }
  };

  const toggleVoiceMode = () => {
    if (voiceMode) {
      console.log('🎤 [VOICE MODE] Disconnecting...');
      if (voiceChat) {
        voiceChat.disconnect();
        setVoiceChat(null);
      }
      setVoiceMode(false);
      setVoiceModeStatus('disconnected');
    } else {
      connectVoiceMode();
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMessage = { role: 'user', content: inputMessage };
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
          message: inputMessage,
          session_id: sessionId
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Извините, произошла ошибка при отправке сообщения.' }]);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);
        setIsTranscribing(true);
        
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');
          
          const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
            method: 'POST',
            body: formData
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          setInputMessage(data.transcript);
        } catch (error) {
          console.error('Error transcribing audio:', error);
          setMessages(prev => [...prev, { role: 'assistant', content: 'Извините, произошла ошибка при расшифровке аудио.' }]);
        } finally {
          setIsTranscribing(false);
        }
      };
      
      mediaRecorder.start();
      setMediaRecorder(mediaRecorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setMediaRecorder(null);
      setIsRecording(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Алеся - AI-ассистент по Конституции РБ</h1>
        <p>Задавайте вопросы о Конституции Республики Беларусь</p>
      </header>
      
      <main className="App-main">
        <div className="chat-container">
          <div className="messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                <div className="message-content">
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="input-container">
            {voiceMode ? (
              <div className="voice-controls">
                <button 
                  className="voice-listen-btn"
                  onClick={() => voiceChat?.startListening()}
                  disabled={voiceModeStatus !== 'connected'}
                >
                  Начать разговор
                </button>
                <button 
                  className="voice-stop-btn"
                  onClick={() => voiceChat?.stopResponse()}
                  disabled={voiceModeStatus !== 'connected'}
                >
                  Остановить
                </button>
                <div className="voice-status">
                  Статус: {voiceModeStatus}
                </div>
              </div>
            ) : (
              <div className="text-input">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Введите ваш вопрос о Конституции РБ..."
                  rows="3"
                />
                <div className="input-buttons">
                  <button 
                    className="record-btn"
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onMouseLeave={stopRecording}
                    disabled={isTranscribing}
                  >
                    {isRecording ? 'Записываю...' : isTranscribing ? 'Расшифровываю...' : '🎤 Записать'}
                  </button>
                  <button 
                    className="send-btn"
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                  >
                    Отправить
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="controls">
          <button 
            className={`voice-btn ${voiceMode ? 'active' : ''}`}
            onClick={toggleVoiceMode}
            disabled={!capabilities.voice_mode_available}
          >
            {voiceMode ? 'Отключить голосовой режим' : 'Подключиться к голосовому чату'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
