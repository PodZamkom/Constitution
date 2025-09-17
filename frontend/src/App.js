import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

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
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load chat history
    loadChatHistory();
  }, []);

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
    console.log('Voice mode:', !voiceMode);
  };

  const playTTS = async (text) => {
    // Simple browser TTS for now
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
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
                <p>Добро пожаловать! Я помогу вам получить информацию по Конституции Республики Беларусь.</p>
                <p>Задайте ваш вопрос текстом или голосом, и я отвечу согласно Конституции РБ редакции 2022 года.</p>
              </div>
            )}
            
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="message-content">
                  {message.content}
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
                    className={`record-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onMouseLeave={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    disabled={isLoading || isTranscribing}
                    title="Удерживайте для записи голосового сообщения"
                  >
                    {isTranscribing ? '⏳' : '🎤'}
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
              <p>Режим голосового общения в реальном времени</p>
              <button className="voice-connect-btn">
                Подключиться к голосовому чату
              </button>
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