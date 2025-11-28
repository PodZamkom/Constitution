import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import '../App.css';
import '../styles/FacePage.css';
import FaceCharacter from '../components/face/FaceCharacter';
import GeminiLiveClient from '../components/face/GeminiLiveClient';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

function MainPage() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false); // false = text/voice, true = realtime voice
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [, setRecordedAudio] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceModeStatus, setVoiceModeStatus] = useState('disconnected'); // disconnected, connecting, connected, ready
  const [capabilities, setCapabilities] = useState({});
  const [audioLevel, setAudioLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const geminiClientRef = useRef(null);
  const faceCharacterRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isVoiceConnected = voiceModeStatus === 'connected' || voiceModeStatus === 'ready';

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
    // основной упор на обновленный голосовой режим.
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
          alert("Голосовой ввод в текстовом режиме временно недоступен. Пожалуйста, используйте Голосовой режим.");
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

  const handleVoiceDisconnect = useCallback(() => {
    if (geminiClientRef.current) {
      geminiClientRef.current.disconnect();
    }
    setVoiceModeStatus('disconnected');
    setIsListening(false);
    setAudioLevel(0);
    setVoiceError(null);
    setIsConnecting(false);
  }, []);

  const handleVoiceConnect = async () => {
    if (!capabilities.voice_mode) {
      toast.error('Голосовой режим недоступен. Проверьте настройки сервера.');
      return;
    }

    if (!geminiClientRef.current) {
      setVoiceError('Клиент голосового режима не инициализирован');
      return;
    }

    setIsConnecting(true);
    setVoiceModeStatus('connecting');
    setVoiceError(null);

    try {
      await geminiClientRef.current.connect();
      toast.success('Подключено к голосовому режиму');
    } catch (error) {
      const errorMsg = error?.message || 'Ошибка подключения';
      setVoiceError(errorMsg);
      setVoiceModeStatus('disconnected');
      toast.error(`Ошибка подключения: ${errorMsg}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartListening = () => {
    if (!isVoiceConnected) {
      toast.error('Сначала подключитесь к серверу');
      return;
    }

    if (geminiClientRef.current) {
      geminiClientRef.current.startListening();
      setIsListening(true);
      toast.success('Микрофон активирован');
    }
  };

  const handleStopListening = () => {
    if (geminiClientRef.current) {
      geminiClientRef.current.stopListening();
      setIsListening(false);
      toast.info('Микрофон отключен');
    }
  };

  const handleAudioLevel = (level) => {
    setAudioLevel(level);
    if (faceCharacterRef.current) {
      faceCharacterRef.current.setAudioLevel(level);
    }
  };

  const handleStatusChange = (status) => {
    if (status === 'connected' || status === 'ready') {
      setVoiceModeStatus(status);
    } else if (status === 'disconnected') {
      setVoiceModeStatus('disconnected');
      setIsListening(false);
      setAudioLevel(0);
    }
    setIsConnecting(false);
  };

  const handleVoiceError = (errorMsg) => {
    setVoiceError(errorMsg);
    toast.error(errorMsg);
    setIsConnecting(false);
  };

  const handleSendTestMessage = () => {
    if (!isVoiceConnected) {
      toast.error('Сначала подключитесь к серверу');
      return;
    }
    
    if (geminiClientRef.current) {
      geminiClientRef.current.sendTextMessage('Привет! Расскажи коротко о себе.');
      toast.success('Тестовое сообщение отправлено');
    }
  };

  const handleSwitchToTextMode = () => {
    setVoiceMode(false);
    handleVoiceDisconnect();
  };

  const handleSwitchToVoiceMode = () => {
    setVoiceMode(true);
  };

  useEffect(() => {
    if (!voiceMode) {
      handleVoiceDisconnect();
    }
  }, [voiceMode, handleVoiceDisconnect]);

  useEffect(() => {
    return () => {
      handleVoiceDisconnect();
    };
  }, [handleVoiceDisconnect]);

  const playTTS = async (text) => {
    // Simple browser TTS for now
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  };

  const getVoiceModeStatusText = () => {
    if (isConnecting) return 'Подключение...';
    if (isListening) return 'Слушаю вас';

    switch (voiceModeStatus) {
      case 'connected':
        return 'Подключено';
      case 'ready':
        return 'Готов к разговору';
      default:
        return 'Отключено';
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
              onClick={handleSwitchToTextMode}
            >
              Текст/Голос
            </button>
            <button 
              className={`mode-btn ${voiceMode ? 'active' : ''}`}
              onClick={handleSwitchToVoiceMode}
            >
              Голосовой режим
            </button>
          </div>
        </div>
      </header>

      {voiceMode ? (
        <main className="voice-mode-main">
          <div className="voice-mode-container">
            <div className="voice-avatar-wrapper">
              <div className="voice-avatar-square">
                <FaceCharacter
                  ref={faceCharacterRef}
                  isSpeaking={isVoiceConnected && !isListening}
                  audioLevel={audioLevel}
                />
              </div>
            </div>

            <div className="voice-mode-controls-centered">
              <div className="voice-status">
                <p>Голосовой режим в реальном времени</p>
                <div className={`status-indicator ${isConnecting ? 'connecting' : voiceModeStatus}`}>
                  <span className="status-dot"></span>
                  Статус: {getVoiceModeStatusText()}
                </div>
                {isVoiceConnected && (
                  <div className="audio-level-indicator">
                    <span role="img" aria-label="Аудио уровень">🔊</span>
                    <div className="audio-level-bar">
                      <div 
                        className="audio-level-fill" 
                        style={{ width: `${Math.min(1, audioLevel) * 100}%` }} 
                      />
                    </div>
                  </div>
                )}
                {voiceError && (
                  <div className="error-message">
                    {voiceError}
                  </div>
                )}
              </div>

              <div className="voice-controls-grid">
                {!isVoiceConnected ? (
                  <button
                    className="voice-connect-btn"
                    onClick={handleVoiceConnect}
                    disabled={isConnecting || !capabilities.voice_mode}
                  >
                    {capabilities.voice_mode ? (isConnecting ? 'Подключаемся...' : 'Подключиться к серверу') : 'Голосовой режим недоступен'}
                  </button>
                ) : (
                  <>
                    {!isListening ? (
                      <button className="voice-connect-btn" onClick={handleStartListening}>
                        Включить микрофон
                      </button>
                    ) : (
                      <button className="voice-disconnect-btn" onClick={handleStopListening}>
                        Выключить микрофон
                      </button>
                    )}
                    <button className="voice-disconnect-btn" onClick={handleVoiceDisconnect}>
                      Отключиться
                    </button>
                    <button className="voice-connect-btn" onClick={handleSendTestMessage}>
                      🧪 Тест (текст)
                    </button>
                  </>
                )}
              </div>
              <p className="voice-hint">
                💡 Можете перебивать ассистента в любой момент
              </p>
            </div>
          </div>

          <GeminiLiveClient
            ref={geminiClientRef}
            onAudioLevel={handleAudioLevel}
            onStatusChange={handleStatusChange}
            onError={handleVoiceError}
          />
        </main>
      ) : (
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

          {/* Avatar */}
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
