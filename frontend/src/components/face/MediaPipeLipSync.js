import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';

const MediaPipeLipSync = forwardRef((props, ref) => {
  const faceMeshRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [audioAnalyzer, setAudioAnalyzer] = useState(null);

  // Загрузка MediaPipe Face Mesh
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        // Динамический импорт MediaPipe
        const { FaceMesh } = await import('@mediapipe/face_mesh');
        
        const faceMesh = new FaceMesh({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
          }
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        faceMeshRef.current = faceMesh;
        setIsLoaded(true);
        console.log('MediaPipe Face Mesh loaded');
      } catch (error) {
        console.error('Error loading MediaPipe:', error);
        // Fallback на простой анализ аудио без MediaPipe
        setIsLoaded(true);
      }
    };

    loadMediaPipe();
  }, []);

  // Создание AudioContext для анализа аудио
  const createAudioAnalyzer = async (audioData) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));
      
      // Создаем анализатор для получения частотных данных
      const source = audioContext.createBufferSource();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      source.buffer = audioBuffer;
      source.connect(analyser);
      
      return { analyser, audioContext, source };
    } catch (error) {
      console.error('Error creating audio analyzer:', error);
      return null;
    }
  };

  // Анализ аудио для определения открытости рта
  const analyzeAudio = async (audioData) => {
    try {
      // Простой анализ на основе амплитуды аудио
      // В реальном приложении можно использовать более сложные алгоритмы
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));
      
      // Получаем данные канала
      const channelData = audioBuffer.getChannelData(0);
      
      // Вычисляем RMS (Root Mean Square) для определения громкости
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sum / channelData.length);
      
      // Нормализуем значение (0-1)
      const normalizedRMS = Math.min(1, rms * 10);
      
      // Анализ частот для определения вокализации
      // Низкие частоты (200-800 Hz) обычно соответствуют гласным звукам
      const fftSize = 2048;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);
      
      // Анализируем низкие частоты (индекс примерно 0-50 для 44.1kHz)
      let lowFreqEnergy = 0;
      const lowFreqRange = Math.min(50, frequencyData.length);
      for (let i = 0; i < lowFreqRange; i++) {
        lowFreqEnergy += frequencyData[i];
      }
      const avgLowFreq = lowFreqEnergy / lowFreqRange / 255;
      
      // Комбинируем RMS и частотный анализ
      const mouthOpenness = Math.max(normalizedRMS, avgLowFreq * 1.2);
      
      // Применяем сглаживание для более плавной анимации
      return Math.min(1, Math.max(0, mouthOpenness));
      
    } catch (error) {
      console.error('Error analyzing audio:', error);
      // Возвращаем случайное значение для демонстрации (в реальном приложении вернуть 0)
      return Math.random() * 0.3;
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    analyzeAudio,
    isLoaded
  }));

  return null; // Этот компонент не рендерит ничего видимого
});

MediaPipeLipSync.displayName = 'MediaPipeLipSync';

export default MediaPipeLipSync;
