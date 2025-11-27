import React, {
  useImperativeHandle,
  forwardRef,
  useRef,
  useEffect,
} from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const WS_URL = BACKEND_URL.replace(/^http/, 'ws');

const GeminiLiveClient = forwardRef(({ onAudioData, onStatusChange, onError, onAudioLevel }, ref) => {
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const inputStreamRef = useRef(null);
  const isListeningRef = useRef(false);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const wsEndpointsRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Получаем WebSocket URL из BACKEND_URL
  const getWebSocketEndpoints = () => {
    if (wsEndpointsRef.current) {
      return wsEndpointsRef.current;
    }

    const wsProtocol = BACKEND_URL.startsWith('https') ? 'wss' : 'ws';
    const wsBase = BACKEND_URL.replace(/^https?/, wsProtocol);

    // На constitution бекенде до сих пор живет старый путь /ws/gemini-live,
    // поэтому пытаемся подключаться и к нему как к запасному.
    const endpoints = [
      `${wsBase}/ws/gemini-live-face`,
      `${wsBase}/ws/gemini-live`,
    ];

    // Удаляем дубли на случай одинаковых путей
    wsEndpointsRef.current = Array.from(new Set(endpoints));
    return wsEndpointsRef.current;
  };

  // Конвертация Float32Array в Int16Array (PCM)
  const floatTo16BitPCM = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  };

  // Ресемплинг аудио с одной частоты на другую
  const resampleAudio = (inputData, inputSampleRate, outputSampleRate) => {
    if (inputSampleRate === outputSampleRate) {
      return inputData;
    }
    
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.ceil(inputData.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
      const t = srcIndex - srcIndexFloor;
      
      // Линейная интерполяция
      output[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t;
    }
    
    return output;
  };

  // Конвертация ArrayBuffer в Base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Конвертация Base64 в ArrayBuffer
  const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Конвертация Int16 в Float32
  const int16ToFloat32 = (inputBuffer) => {
    const input = new Int16Array(inputBuffer);
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] / 32768;
    }
    return output;
  };

  // Запуск анализа аудио уровня в реальном времени
  const startAudioLevelAnalysis = () => {
    if (!analyserRef.current || animationFrameRef.current) return;
    
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const analyze = () => {
      if (!analyserRef.current) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Вычисляем средний уровень громкости
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length / 255;
      
      // Нелинейное масштабирование для лучшей визуализации речи
      const scaled = Math.pow(average * 2, 0.8);
      const level = Math.min(1.0, Math.max(0, scaled));
      
      // Передаем уровень для lip sync
      if (onAudioLevel) {
        onAudioLevel(level);
      }
      
      animationFrameRef.current = requestAnimationFrame(analyze);
    };
    
    analyze();
  };

  // Остановка анализа аудио уровня
  const stopAudioLevelAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Сбрасываем уровень
    if (onAudioLevel) {
      onAudioLevel(0);
    }
  };

  // Воспроизведение аудио из очереди с анализом громкости
  const playNextChunk = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      stopAudioLevelAnalysis();
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift();
    
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
      }

      // Gemini audio output is typically PCM 16-bit Little Endian at 24kHz
      const float32 = int16ToFloat32(chunk);
      const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      // Создаем analyser для lip sync
      if (!analyserRef.current) {
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.3;
        analyserRef.current.connect(audioContextRef.current.destination);
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      
      // Подключаем через analyser для анализа уровня
      source.connect(analyserRef.current);
      
      source.onended = () => playNextChunk();
      source.start();

      // Запускаем анализ уровня если еще не запущен
      startAudioLevelAnalysis();

      // Также передаем аудио данные для дополнительной обработки
      if (onAudioData) {
        onAudioData(chunk, 'audio/pcm');
      }

    } catch (error) {
      console.error('Error playing audio chunk:', error);
      playNextChunk();
    }
  };

  // Захват аудио с микрофона (через MediaRecorder API)
  const startAudioInput = async () => {
    try {
      console.log('🎤 Requesting microphone access...');
      
      // Запрашиваем микрофон
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000
        }
      });
      
      console.log('🎤 Microphone access granted');
      
      // Получаем информацию о треке
      const audioTrack = stream.getAudioTracks()[0];
      const settings = audioTrack.getSettings();
      console.log('🎤 Audio track settings:', JSON.stringify(settings));

      // Создаем AudioContext для конвертации в PCM
      const inputContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      // Ждём пока AudioContext станет активным
      if (inputContext.state === 'suspended') {
        await inputContext.resume();
        console.log('🎤 AudioContext resumed');
      }
      
      console.log(`🎤 AudioContext state: ${inputContext.state}, sample rate: ${inputContext.sampleRate} Hz`);
      
      const source = inputContext.createMediaStreamSource(stream);
      
      // Создаем ScriptProcessorNode для захвата PCM данных
      const bufferSize = 4096;
      const processor = inputContext.createScriptProcessor(bufferSize, 1, 1);
      
      let chunkCount = 0;
      let totalBytesSent = 0;
      
      processor.onaudioprocess = (event) => {
        if (!isListeningRef.current) return;
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Вычисляем уровень сигнала для логирования
        let sum = 0;
        let maxVal = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
          maxVal = Math.max(maxVal, Math.abs(inputData[i]));
        }
        const rms = Math.sqrt(sum / inputData.length);
        const db = 20 * Math.log10(Math.max(rms, 0.0001));
        
        // NOISE GATE: Не отправляем слишком тихие звуки (фоновый шум)
        // Порог -40 dB - ниже этого считаем тишиной
        if (db < -40) {
          return; // Пропускаем тихий шум
        }
        
        // Логируем каждую секунду (~10 чанков при 16kHz)
        chunkCount++;
        if (chunkCount % 10 === 0) {
          console.log(`🎤 Audio: ${db.toFixed(1)} dB, RMS: ${rms.toFixed(4)}, max: ${maxVal.toFixed(4)}, sent: ${(totalBytesSent/1024).toFixed(1)}KB`);
        }
        
        // Конвертируем Float32 в Int16 PCM
        const pcmData = floatTo16BitPCM(inputData);
        const base64Data = arrayBufferToBase64(pcmData.buffer);
        
        totalBytesSent += pcmData.buffer.byteLength;

        try {
          socketRef.current.send(JSON.stringify({
            realtime_input: {
              media_chunks: [{
                mime_type: "audio/pcm",
                data: base64Data
              }]
            }
          }));
        } catch (sendError) {
          console.error('Error sending audio:', sendError);
        }
      };
      
      // Подключаем процессор
      source.connect(processor);
      processor.connect(inputContext.destination);

      inputStreamRef.current = { stream, source, processor, context: inputContext };
      console.log('🎤 Audio input started successfully (ScriptProcessorNode)');
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      if (onError) {
        onError('Не удалось получить доступ к микрофону: ' + error.message);
      }
    }
  };

  // Остановка захвата аудио
  const stopAudioInput = () => {
    if (inputStreamRef.current) {
      const { stream, source, processor, context } = inputStreamRef.current;
      
      console.log('🎤 Stopping audio input...');
      
      if (processor) {
        processor.disconnect();
        processor.onaudioprocess = null;
      }
      
      if (source) {
        source.disconnect();
      }
      
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      if (context && context.state !== 'closed') {
        context.close();
      }
      
      inputStreamRef.current = null;
      console.log('🎤 Audio input stopped');
    }
  };

  // Подключение к WebSocket
  const connect = async () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log('Already connected');
      return;
    }

    try {
      // Создаем AudioContext для воспроизведения
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });

      const tryConnect = (endpointIndex = 0) => {
        const endpoints = getWebSocketEndpoints();

        if (endpointIndex >= endpoints.length) {
          const errorMsg = 'Не удалось подключиться ни к одному WebSocket endpoint';
          console.error(errorMsg);
          if (onError) {
            onError(errorMsg);
          }
          return;
        }

        const wsUrl = endpoints[endpointIndex];
        console.log('🔌 Connecting to:', wsUrl);
      
        const socket = new WebSocket(wsUrl);
        let hasOpened = false;
        let fallbackTriggered = false;

        const attemptFallback = () => {
          const hasNext = endpointIndex + 1 < endpoints.length;
          if (fallbackTriggered || !hasNext) {
            return false;
          }

          fallbackTriggered = true;
          console.warn(
            `WebSocket ${wsUrl} недоступен, пробуем резервный ${endpoints[endpointIndex + 1]}`
          );
          tryConnect(endpointIndex + 1);
          return true;
        };

        socket.onopen = () => {
          hasOpened = true;
          socketRef.current = socket;
          console.log('✅ Connected to Gemini Live WebSocket');
          if (onStatusChange) {
            onStatusChange('connected');
          }
        };

        socket.onmessage = async (event) => {
          try {
            let message;
            if (event.data instanceof Blob) {
              const text = await event.data.text();
              console.log('📩 Received Blob from server, size:', event.data.size);
              message = JSON.parse(text);
            } else {
              console.log('📩 Received text from server, length:', event.data.length);
              message = JSON.parse(event.data);
            }

            // Формат Constitution: serverContent.modelTurn.parts[].inlineData
            if (message.serverContent?.modelTurn?.parts) {
              const parts = message.serverContent.modelTurn.parts;
              console.log('🔊 Got audio response from Gemini, parts:', parts.length);
              
              for (const part of parts) {
                if (part.inlineData) {
                  console.log('🔊 Processing audio chunk, mime:', part.inlineData.mimeType, 'dataLen:', part.inlineData.data?.length);
                  
                  // Конвертируем base64 в ArrayBuffer
                  const audioArrayBuffer = base64ToArrayBuffer(part.inlineData.data);
                  
                  // Добавляем в очередь для воспроизведения
                  audioQueueRef.current.push(audioArrayBuffer);

                  // Запускаем воспроизведение если еще не играет
                  if (!isPlayingRef.current) {
                    playNextChunk();
                  }
                }
                
                // Также проверяем на текстовые части
                if (part.text) {
                  console.log('📝 Text response from Gemini:', part.text);
                }
              }
            } else if (message.status === 'connected') {
              console.log('✅ Gemini Live API connected and ready');
              if (onStatusChange) {
                onStatusChange('ready');
              }
            } else if (message.type === 'error' || message.error) {
              console.error('❌ Gemini error:', message);
              if (onError) {
                onError(message.message || message.error || 'Ошибка Gemini API');
              }
            } else if (message.serverContent?.turnComplete) {
              console.log('✅ Gemini turn complete');
            } else {
              console.log('📩 Other message from server:', JSON.stringify(message).substring(0, 300));
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };

        socket.onclose = (event) => {
          if (!hasOpened && fallbackTriggered) {
            return;
          }

          console.log('🔌 WebSocket closed, code:', event.code, 'reason:', event.reason);
          if (socketRef.current === socket) {
            stopAudioInput();
            stopAudioLevelAnalysis();
            socketRef.current = null;
            if (onStatusChange) {
              onStatusChange('disconnected');
            }
          }
        };

        socket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          if (!hasOpened && attemptFallback()) {
            socket.close();
            return;
          }
          if (onError) {
            onError('Ошибка подключения к серверу');
          }
        };
      };

      tryConnect();

    } catch (error) {
      console.error('Failed to connect:', error);
      if (onError) {
        onError(error.message || 'Ошибка подключения');
      }
    }
  };

  // Отключение
  const disconnect = () => {
    stopAudioInput();
    stopAudioLevelAnalysis();
    isListeningRef.current = false;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  // Начать прослушивание
  const startListening = async () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    if (isListeningRef.current) {
      console.log('Already listening');
      return;
    }

    console.log('🎤 Starting listening mode...');
    isListeningRef.current = true;
    await startAudioInput();
  };

  // Остановить прослушивание
  const stopListening = () => {
    console.log('🎤 Stopping listening mode...');
    isListeningRef.current = false;
    stopAudioInput();
  };

  // Отправить текстовое сообщение (для тестирования без микрофона)
  const sendTextMessage = (text) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    console.log('📤 Sending text message:', text);
    
    // Формат client_content для текстовых сообщений
    socketRef.current.send(JSON.stringify({
      client_content: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turn_complete: true
      }
    }));
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    connect,
    disconnect,
    startListening,
    stopListening,
    sendTextMessage
  }));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return null; // This component doesn't render anything
});

GeminiLiveClient.displayName = 'GeminiLiveClient';

export default GeminiLiveClient;
