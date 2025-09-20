import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const BACKEND_URL = 'http://localhost:8000';
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
    this.playbackContext = null;
    this.playbackTime = 0;
    this.websocketUrl = null;
    this.sessionModel = model || "gpt-4o-realtime-preview-latest";
    this.backendUrl = backendUrl;
    this.voiceName = voice || "verse";
    this.instructions = instructions || null;
    this.onStatusChange = null;
    this.onError = null;
    this.localStream = null;
    this.audioContext = null;
    this.inputSource = null;
    this.processorNode = null;
    this.isRecording = false;
    this.clientSecret = null;
    this.pendingCommit = false;
    this.lastAudioTimestamp = 0;
    this.commitTimer = null;
    this.silenceThreshold = 0.01;
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
      const clientSecret =
        (data.client_secret && data.client_secret.value) ||
        data.client_secret_value;
      if (!data.websocket_url || !clientSecret) {
        throw new Error("Failed to get Voice Mode credentials");
      }

      this.websocketUrl = data.websocket_url;
      this.sessionModel = data.model || this.sessionModel;
      this.instructions = data.instructions || this.instructions;
      this.clientSecret = clientSecret;

      console.log('Voice Mode session created successfully');

      // Setup audio playback context
      this.setupPlaybackContext();

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

  setupPlaybackContext() {
    if (!this.playbackContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      try {
        this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      } catch (error) {
        console.warn('Falling back to default AudioContext sampleRate:', error);
        this.playbackContext = new AudioContextClass();
      }
      this.playbackTime = 0;
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

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    await this.audioContext.resume();

    this.inputSource = this.audioContext.createMediaStreamSource(this.localStream);
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0;

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isRecording || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      const inputBuffer = event.inputBuffer;
      const channelData = inputBuffer.getChannelData(0);
      const rms = this.calculateRMS(channelData);

      if (rms < this.silenceThreshold) {
        return;
      }

      const downsampled = this.downsampleBuffer(channelData, inputBuffer.sampleRate, 24000);
      if (!downsampled.length) {
        return;
      }

      const pcm = this.floatTo16BitPCM(downsampled);
      const base64Audio = this.arrayBufferToBase64(pcm.buffer);

      this.websocket.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio,
      }));

      this.lastAudioTimestamp = Date.now();
      this.pendingCommit = true;
    };

    this.inputSource.connect(this.processorNode);
    this.processorNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        const protocols = [
          'realtime',
          `openai-insecure-api-key.${this.clientSecret}`,
          'openai-beta.realtime-v1'
        ];
        this.websocket = new WebSocket(this.websocketUrl, protocols);

        this.websocket.onopen = () => {
          console.log('WebSocket connected to Realtime API');

          // Send session configuration
          this.websocket.send(JSON.stringify({
            type: 'session.update',
            session: {
              instructions: this.instructions,
              voice: this.voiceName,
              model: this.sessionModel
            }
          }));

          // Start audio recording
          this.startRecording();

          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (this.onError) {
            this.onError('WebSocket connection failed');
          }
          reject(error);
        };

        this.websocket.onclose = () => {
          console.log('WebSocket disconnected');
          if (this.onStatusChange) {
            this.onStatusChange('disconnected');
          }
          this.stopRecording();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  handleWebSocketMessage(data) {
    console.log('Received WebSocket message:', data);

    switch (data.type) {
      case 'response.audio.delta':
        if (data.delta) {
          this.playbackAudioDelta(data.delta);
        }
        break;

      case 'response.done':
        console.log('Response completed');
        break;

      case 'response.error':
        if (data.error) {
          console.error('Realtime API response error:', data.error);
        }
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
    if (this.isRecording) {
      return;
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((error) => {
        console.error('Failed to resume audio context:', error);
      });
    }

    this.isRecording = true;
    this.lastAudioTimestamp = Date.now();
    console.log('Started realtime audio streaming');

    if (!this.commitTimer) {
      this.commitTimer = window.setInterval(() => {
        if (
          this.pendingCommit &&
          Date.now() - this.lastAudioTimestamp > 600 &&
          this.websocket &&
          this.websocket.readyState === WebSocket.OPEN
        ) {
          this.websocket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          this.websocket.send(JSON.stringify({ type: 'response.create' }));
          this.pendingCommit = false;
        }
      }, 300);
    }

    if (this.onStatusChange) {
      this.onStatusChange('ready');
    }
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    this.pendingCommit = false;
    console.log('Stopped realtime audio streaming');

    if (this.commitTimer) {
      clearInterval(this.commitTimer);
      this.commitTimer = null;
    }

    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      this.websocket.send(JSON.stringify({ type: 'response.create' }));
    }
  }

  calculateRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  downsampleBuffer(buffer, sampleRate, outSampleRate) {
    if (outSampleRate === sampleRate) {
      return buffer;
    }

    const sampleRateRatio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = accum / (count || 1);
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  floatTo16BitPCM(buffer) {
    const length = buffer.length;
    const result = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return result;
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  base64ToInt16(base64) {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(buffer);
  }

  playbackAudioDelta(base64Audio) {
    if (!this.playbackContext) {
      return;
    }

    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume().catch((error) => {
        console.warn('Failed to resume playback context:', error);
      });
    }

    const int16Array = this.base64ToInt16(base64Audio);
    if (!int16Array.length) {
      return;
    }

    const floatArray = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      floatArray[i] = int16Array[i] / 0x8000;
    }

    const audioBuffer = this.playbackContext.createBuffer(1, floatArray.length, 24000);
    audioBuffer.copyToChannel(floatArray, 0);

    const source = this.playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.playbackContext.destination);

    const startAt = Math.max(this.playbackContext.currentTime, this.playbackTime);
    source.start(startAt);
    this.playbackTime = startAt + audioBuffer.duration;
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

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.playbackContext) {
      this.playbackContext.close().catch(() => {});
      this.playbackContext = null;
      this.playbackTime = 0;
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