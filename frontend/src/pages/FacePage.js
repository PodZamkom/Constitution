import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Mic, MicOff, Volume2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import GeminiLiveClient from '../components/face/GeminiLiveClient';
import FaceCharacter from '../components/face/FaceCharacter';
import '../styles/FacePage.css';

const FacePage = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const geminiClientRef = useRef(null);
  const faceCharacterRef = useRef(null);

  const handleConnect = async () => {
    try {
      if (!geminiClientRef.current) {
        setError('Gemini client not initialized');
        return;
      }

      await geminiClientRef.current.connect();
      setIsConnected(true);
      setError(null);
      toast.success('Подключено к Gemini Live API');
    } catch (err) {
      const errorMsg = err.message || 'Ошибка подключения';
      setError(errorMsg);
      toast.error(`Ошибка подключения: ${errorMsg}`);
      setIsConnected(false);
    }
  };

  const handleDisconnect = () => {
    if (geminiClientRef.current) {
      geminiClientRef.current.disconnect();
    }
    setIsConnected(false);
    setIsListening(false);
    setError(null);
    toast.info('Отключено от Gemini Live API');
  };

  const handleStartListening = () => {
    if (!isConnected) {
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

  // Обработчик уровня аудио для lip sync
  const handleAudioLevel = (level) => {
    setAudioLevel(level);
    
    // Передаем уровень аудио персонажу для lip sync
    if (faceCharacterRef.current) {
      faceCharacterRef.current.setAudioLevel(level);
    }
  };

  const handleStatusChange = (status) => {
    if (status === 'connected' || status === 'ready') {
      setIsConnected(true);
    } else if (status === 'disconnected') {
      setIsConnected(false);
      setIsListening(false);
    }
  };

  const handleError = (errorMsg) => {
    setError(errorMsg);
    toast.error(errorMsg);
  };

  // Отправить тестовое текстовое сообщение
  const handleSendTestMessage = () => {
    if (!isConnected) {
      toast.error('Сначала подключитесь к серверу');
      return;
    }
    
    if (geminiClientRef.current) {
      geminiClientRef.current.sendTextMessage('Привет! Расскажи коротко о себе.');
      toast.success('Тестовое сообщение отправлено');
    }
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Constitution AI • Живой 3D-аватар';

    const descriptionMeta = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionMeta?.getAttribute('content') ?? null;
    const newDescription = 'Constitution AI Face — 3D-аватар с живой речью и липсингом.';
    if (descriptionMeta) {
      descriptionMeta.setAttribute('content', newDescription);
    }

    return () => {
      // Cleanup при размонтировании
      if (geminiClientRef.current) {
        geminiClientRef.current.disconnect();
      }
      document.title = previousTitle;
      if (descriptionMeta && previousDescription !== null) {
        descriptionMeta.setAttribute('content', previousDescription);
      }
    };
  }, []);

  return (
    <div className="face-page">
      <div className="face-page-container">
        {/* Основной контент с персонажем */}
        <div className="face-character-wrapper">
          <FaceCharacter
            ref={faceCharacterRef}
            isSpeaking={isConnected && !isListening}
            audioLevel={audioLevel}
          />
        </div>

        {/* Панель управления */}
        <Card className="control-panel">
          <CardContent className="control-panel-content">
            <div className="status-section">
              <div className="status-indicator">
                <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
                <span>{isConnected ? 'Подключено' : 'Не подключено'}</span>
              </div>
              
              {/* Индикатор уровня аудио */}
              {isConnected && audioLevel > 0 && (
                <div className="audio-level-indicator">
                  <Volume2 size={16} />
                  <div className="audio-level-bar">
                    <div 
                      className="audio-level-fill" 
                      style={{ width: `${audioLevel * 100}%` }}
                    />
                  </div>
                </div>
              )}
              
              {error && (
                <div className="error-message">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="controls-section">
              {!isConnected ? (
                <Button onClick={handleConnect} className="connect-button">
                  Подключиться
                </Button>
              ) : (
                <>
                  <Button onClick={handleDisconnect} variant="outline" className="disconnect-button">
                    Отключиться
                  </Button>
                  {!isListening ? (
                    <Button onClick={handleStartListening} className="listen-button">
                      <Mic size={16} />
                      Включить микрофон
                    </Button>
                  ) : (
                    <Button onClick={handleStopListening} variant="destructive" className="stop-button">
                      <MicOff size={16} />
                      Выключить микрофон
                    </Button>
                  )}
                  <Button onClick={handleSendTestMessage} variant="secondary" className="test-button">
                    🧪 Тест (текст)
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Скрытый компонент для работы с Gemini Live */}
        <GeminiLiveClient
          ref={geminiClientRef}
          onAudioLevel={handleAudioLevel}
          onStatusChange={handleStatusChange}
          onError={handleError}
        />
      </div>
    </div>
  );
};

export default FacePage;
