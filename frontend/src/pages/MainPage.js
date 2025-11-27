import React, { useState, useEffect, useRef } from 'react';
import '../App.css';
import FaceCharacter from '../components/face/FaceCharacter';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const WS_URL = BACKEND_URL.replace(/^http/, 'ws');

// Gemini Live WebSocket Class
class GeminiLiveChat {
  constructor() {
    this.socket = null;
    this.audioContext = null;
    this.audioWorkletNode = null;
    this.sourceNode = null;
    this.isPlaying = false;
    this.audioQueue = [];
    this.onStatusChange = null;
    this.onError = null;
    this.onAudioLevel = null;
    this.initialized = false;
    this.analyser = null;
    this.animationFrame = null;
  }

  async init() {
    try {
      console.log('Initializing Gemini Live for Алеся...');
      
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000, // Gemini output is often 24kHz
      });

      // Connect to WebSocket
      this.socket = new WebSocket(`${WS_URL}/ws/gemini-live`);
      
      this.socket.onopen = () => {
        console.log("Connected to Backend WebSocket");
        this.startAudioInput();
        if (this.onStatusChange) this.onStatusChange('connected');
      };

      this.socket.onmessage = async (event) => {
        await this.handleMessage(event.data);
      };

      this.socket.onclose = () => {
        console.log("WebSocket closed");
        this.stopAudio();
        if (this.onStatusChange) this.onStatusChange('disconnected');
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (this.onError) this.onError("Connection error");
      };

      this.initialized = true;

    } catch (error) {
      console.error("Failed to initialize Gemini Live:", error);
      if (this.onError) this.onError(error.message);
      throw error;
    }
  }

  async startAudioInput() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const inputContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = inputContext.createMediaStreamSource(stream);
      
      // ScriptProcessor is deprecated but widely supported. AudioWorklet is better but requires loading a file.
      // For simplicity in a single file React app without public folder access for worklets easily, we use ScriptProcessor.
      const processor = inputContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          // Convert float32 to int16 (PCM)
          const pcmData = this.floatTo16BitPCM(inputData);
          const base64Data = this.arrayBufferToBase64(pcmData);

          // Send to backend -> Gemini
          this.socket.send(JSON.stringify({
            realtime_input: {
              media_chunks: [{
                mime_type: "audio/pcm",
                data: base64Data
              }]
            }
          }));
        }
      };

      source.connect(processor);
      processor.connect(inputContext.destination);

      this.sourceNode = source;
      this.audioWorkletNode = processor; // Storing it here to stop later
      
      if (this.onStatusChange) this.onStatusChange('ready');

    } catch (e) {
      console.error("Error accessing microphone:", e);
      if (this.onError) this.onError("Microphone access failed");
    }
  }

  async handleMessage(data) {
    try {
      let message;
      if (data instanceof Blob) {
        message = JSON.parse(await data.text());
      } else {
        message = JSON.parse(data);
      }

      // Gemini sends "serverContent" with "modelTurn" -> "parts" -> "inlineData"
      if (message.serverContent?.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
            if (part.inlineData) {
                // Audio data
                const audioData = this.base64ToArrayBuffer(part.inlineData.data);
                this.queueAudio(audioData);
            }
        }
      }
      
    } catch (e) {
      console.error("Error processing message:", e);
    }
  }

  queueAudio(audioData) {
    this.audioQueue.push(audioData);
    if (!this.isPlaying) {
      this.playNextChunk();
    }
  }

  async playNextChunk() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const chunk = this.audioQueue.shift();
    
    try {
      // Gemini audio output is typically PCM 24kHz. 
      // We need to decode or play raw PCM. 
      // Since we can't easily use decodeAudioData on raw PCM chunks without headers,
      // we should create a buffer.
      
      // Assumption: Gemini sends PCM 16-bit Little Endian at 24kHz (based on typical response config).
      // We can construct an AudioBuffer.
      const float32 = this.int16ToFloat32(chunk);
      const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      
      // Create analyser if not exists
      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.3;
        this.analyser.connect(this.audioContext.destination);
      }
      
      source.connect(this.analyser);
      source.onended = () => this.playNextChunk();
      source.start();
      
      this.startAudioLevelAnalysis();

    } catch (e) {
      console.error("Error playing audio chunk:", e);
      this.playNextChunk();
    }
  }

  startAudioLevelAnalysis() {
    if (!this.analyser || this.animationFrame) return;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const analyze = () => {
      if (!this.analyser) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length / 255;
      
      // Nonlinear scaling
      const scaled = Math.pow(average * 2, 0.8);
      const level = Math.min(1.0, Math.max(0, scaled));
      
      if (this.onAudioLevel) {
        this.onAudioLevel(level);
      }
      
      if (this.isPlaying) {
        this.animationFrame = requestAnimationFrame(analyze);
      } else {
        this.animationFrame = null;
        if (this.onAudioLevel) this.onAudioLevel(0);
      }
    };
    
    analyze();
  }

  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  }

  int16ToFloat32(inputBuffer) {
    const input = new Int16Array(inputBuffer);
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] / 32768;
    }
    return output;
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  stopAudio() {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
    this.stopAudio();
    this.initialized = false;
    if (this.onStatusChange) this.onStatusChange('disconnected');
  }
}

function MainPage() {
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
  const [audioLevel, setAudioLevel] = useState(0);
  const faceCharacterRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load chat history and capabilities
    // loadChatHistory(); // History temporarily disabled for clean start
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
    // Legacy text-to-speech recording logic kept for text mode if needed, 
    // but focusing on Voice Mode update.
    // ... implementation preserved for text mode input ...
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
          stream.getTracks().forEach(track => track.stop());
          
          // Placeholder: We don't have a transcribe endpoint in new backend yet, 
          // so we just alert or use direct text.
          alert("Голосовой ввод в текстовом режиме временно недоступен. Пожалуйста, используйте Voice Mode.");
        };
        
        recorder.start();
        setMediaRecorder(recorder);
        setIsRecording(true);
        
      } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Ошибка доступа к микрофону.');
      }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
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
    if (!capabilities.voice_mode) {
      alert('Voice Mode недоступен. Проверьте настройки сервера.');
      return;
    }
    
    setVoiceModeStatus('connecting');
    
    try {
      const newVoiceChat = new GeminiLiveChat();
      
      newVoiceChat.onStatusChange = (status) => {
        setVoiceModeStatus(status);
      };
      
      newVoiceChat.onAudioLevel = (level) => {
        setAudioLevel(level);
        if (faceCharacterRef.current) {
          faceCharacterRef.current.setAudioLevel(level);
        }
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

      {/* Voice Mode - Full screen avatar layout */}
      {voiceMode ? (
        <main className="voice-mode-main">
          <div className="voice-mode-container">
            {/* Centered square avatar with FaceCharacter (VRM + lip sync) */}
            <div className="voice-avatar-wrapper">
              <div className="voice-avatar-square">
                <FaceCharacter
                  ref={faceCharacterRef}
                  isSpeaking={voiceModeStatus === 'connected' || voiceModeStatus === 'ready'}
                  audioLevel={audioLevel}
                />
              </div>
            </div>
            
            {/* Voice controls below avatar */}
            <div className="voice-mode-controls-centered">
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
                  disabled={!capabilities.voice_mode}
                >
                  {capabilities.voice_mode ? 'Подключиться к голосовому чату' : 'Voice Mode недоступен'}
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
          </div>
        </main>
      ) : (
        /* Text/Voice Mode - Original layout */
        <main className="main-content">
          {/* Chat area */}
          <div className="chat-container">
            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="welcome-message">
                  <p>Добро пожаловать! Меня зовут <strong>Алеся</strong>, и я помогу вам получить информацию по Конституции Республики Беларусь.</p>
                  <p>Задайте ваш вопрос текстом или голосом, и я отвечу согласно Конституции РБ редакции 2022 года.</p>
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
          </div>

          {/* Avatar for Text mode */}
          <div className="avatar-container">
            <img 
              src="https://customer-assets.emergentagent.com/job_belarus-constitution/artifacts/mqexhzvw_d3788255-d883-47b1-837f-751a2e82c62b.png" 
              alt="Ассистент" 
              className="avatar"
            />
          </div>
        </main>
      )}
    </div>
  );
}

export default MainPage;
