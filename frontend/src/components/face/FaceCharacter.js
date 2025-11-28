import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const FaceCharacter = forwardRef(({ isSpeaking, audioLevel }, ref) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const vrmRef = useRef(null);
  const animationFrameRef = useRef(null);
  const controlsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
  
  // Lip sync state
  const currentAudioLevelRef = useRef(0);
  const smoothedMouthValueRef = useRef(0);
  
  // Blink animation state
  const blinkStateRef = useRef({
    isBlinking: false,
    blinkValue: 0,
    nextBlinkTime: 0,
    blinkDuration: 150,
    blinkStartTime: 0
  });
  
  // Idle animation state (enhanced)
  const idleStateRef = useRef({
    time: 0,
    breathPhase: 0,
    lookAroundPhase: 0,
    microMovementPhase: 0
  });

  // Инициализация Three.js сцены
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Создаем сцену
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x212121);
    sceneRef.current = scene;

    // Создаем камеру
    const camera = new THREE.PerspectiveCamera(
      22,
      container.clientWidth / container.clientHeight,
      0.1,
      20
    );
    camera.position.set(0.0, 1.45, 1.0);
    cameraRef.current = camera;

    // Создаем рендерер
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    if (renderer.outputColorSpace !== undefined && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Добавляем освещение
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Добавляем OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.0, 1.45, 0.0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 1.5;
    controls.maxPolarAngle = Math.PI / 2;
    controls.enableRotate = false; // фиксируем ракурс
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.update();
    controlsRef.current = controls;

    // Загружаем VRM модель
    const loader = new GLTFLoader();
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    const modelUrl = 'https://raw.githubusercontent.com/vrm-c/vrm-specification/master/samples/VRM1_Constraint_Twist/vrm/VRM1_Constraint_Twist_Sample.vrm';
    
    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        
        if (!vrm) {
          setError('Failed to load VRM data');
          setIsLoading(false);
          return;
        }

        vrmRef.current = vrm;

        // Удаляем ненужные данные
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        // Добавляем модель в сцену
        scene.add(vrm.scene);

        // Позиционируем модель
        vrm.scene.position.set(0, 0, 0);

        // Пока оставляем руки как есть - T-pose
        // TODO: найти VRM модель с опущенными руками

        // Логируем доступные выражения лица
        if (vrm.expressionManager) {
          console.log('Available expressions:', vrm.expressionManager.expressions?.map(e => e.expressionName) || 'none');
        }

        setIsLoading(false);
        setLoadingProgress(100);
        console.log('VRM model loaded successfully');
      },
      (progress) => {
        const percent = progress.total > 0 ? Math.round(100 * progress.loaded / progress.total) : 0;
        setLoadingProgress(percent);
        console.log('Loading model...', percent, '%');
      },
      (error) => {
        console.error('Error loading VRM:', error);
        setError('Failed to load VRM model: ' + error.message);
        setIsLoading(false);
      }
    );

    // Обработчик изменения размера окна
    const handleResize = () => {
      if (!container || !camera || !renderer) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Анимационный цикл
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const currentTime = performance.now();
      const deltaTime = clock.getDelta();

      // Обновляем VRM
      if (vrmRef.current) {
        vrmRef.current.update(deltaTime);

        // ====== LIP SYNC ANIMATION ======
        const targetValue = currentAudioLevelRef.current;
        const smoothingUp = 0.5;
        const smoothingDown = 0.2;
        
        const smoothing = targetValue > smoothedMouthValueRef.current ? smoothingUp : smoothingDown;
        smoothedMouthValueRef.current += (targetValue - smoothedMouthValueRef.current) * smoothing;
        
        const mouthValue = smoothedMouthValueRef.current;
        
        if (vrmRef.current.expressionManager) {
          vrmRef.current.expressionManager.setValue('aa', mouthValue);
          const oValue = mouthValue * 0.3;
          vrmRef.current.expressionManager.setValue('oh', oValue);
        }

        // ====== BLINK ANIMATION ======
        const blinkState = blinkStateRef.current;
        
        if (!blinkState.isBlinking && currentTime >= blinkState.nextBlinkTime) {
          blinkState.isBlinking = true;
          blinkState.blinkStartTime = currentTime;
        }
        
        if (blinkState.isBlinking) {
          const blinkProgress = (currentTime - blinkState.blinkStartTime) / blinkState.blinkDuration;
          
          if (blinkProgress >= 1) {
            blinkState.isBlinking = false;
            blinkState.blinkValue = 0;
            blinkState.nextBlinkTime = currentTime + 2000 + Math.random() * 3000;
          } else {
            blinkState.blinkValue = Math.sin(blinkProgress * Math.PI);
          }
          
          if (vrmRef.current.expressionManager) {
            vrmRef.current.expressionManager.setValue('blink', blinkState.blinkValue);
          }
        }

        // ====== ENHANCED IDLE ANIMATION ======
        const idleState = idleStateRef.current;
        idleState.time += deltaTime;
        idleState.breathPhase += deltaTime * 0.8;
        idleState.lookAroundPhase += deltaTime * 0.15;
        idleState.microMovementPhase += deltaTime * 2.5;
        
        if (vrmRef.current.humanoid) {
          const head = vrmRef.current.humanoid.getNormalizedBoneNode('head');
          const neck = vrmRef.current.humanoid.getNormalizedBoneNode('neck');
          const spine = vrmRef.current.humanoid.getNormalizedBoneNode('spine');
          const chest = vrmRef.current.humanoid.getNormalizedBoneNode('chest');
          
          // Дыхание - грудь поднимается/опускается
          const breathAmount = Math.sin(idleState.breathPhase) * 0.015;
          if (chest) {
            chest.rotation.x = breathAmount;
          }
          if (spine) {
            spine.rotation.x = breathAmount * 0.5;
          }
          
          // Медленное "осматривание" - голова и шея
          const lookX = Math.sin(idleState.lookAroundPhase) * 0.08;
          const lookY = Math.sin(idleState.lookAroundPhase * 0.7 + 1) * 0.12;
          const lookZ = Math.sin(idleState.lookAroundPhase * 0.5) * 0.03;
          
          if (head) {
            head.rotation.x = lookX + Math.sin(idleState.microMovementPhase) * 0.01;
            head.rotation.y = lookY + Math.cos(idleState.microMovementPhase * 0.8) * 0.015;
            head.rotation.z = lookZ;
          }
          
          if (neck) {
            neck.rotation.x = lookX * 0.3;
            neck.rotation.y = lookY * 0.4;
          }
          
          // Небольшое покачивание плечами при дыхании
          const shoulderMovement = Math.sin(idleState.breathPhase * 1.1) * 0.01;
        }
      }

      // Обновляем контроллы
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      // Рендерим сцену
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();

    // Устанавливаем начальное время для моргания
    blinkStateRef.current.nextBlinkTime = performance.now() + 1000 + Math.random() * 2000;

    // Глобальные функции для отладки
    window.updateMouth = (value) => {
      const clampedValue = Math.max(0.0, Math.min(1.0, value));
      currentAudioLevelRef.current = clampedValue;
    };

    window.testSpeaking = () => {
      let frame = 0;
      const totalFrames = 180;
      
      const animateSpeaking = () => {
        if (frame < totalFrames) {
          const base = 0.3 + Math.random() * 0.4;
          const variation = Math.sin(frame * 0.3) * 0.2;
          currentAudioLevelRef.current = Math.max(0, Math.min(1, base + variation));
          frame++;
          requestAnimationFrame(animateSpeaking);
        } else {
          currentAudioLevelRef.current = 0;
        }
      };
      
      console.log('Test speaking started');
      animateSpeaking();
    };

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
      }

      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
      }

      delete window.updateMouth;
      delete window.testSpeaking;
    };
  }, []);

  // Метод для установки уровня аудио
  const setAudioLevel = (level) => {
    currentAudioLevelRef.current = level;
  };

  // Legacy метод
  const onAudioData = (audioData, mimeType) => {};

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    onAudioData,
    setAudioLevel
  }));

  return (
    <div className="face-character-container">
      <div 
        ref={containerRef} 
        className="face-character-canvas"
        style={{ width: '100%', height: '100%' }}
      />
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p className="loading-text">Загрузка 3D модели...</p>
            <div className="loading-progress-bar">
              <div 
                className="loading-progress-fill" 
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="loading-percent">{loadingProgress}%</p>
          </div>
        </div>
      )}
      {error && (
        <div className="error-overlay">
          <p>Ошибка загрузки: {error}</p>
        </div>
      )}
    </div>
  );
});

FaceCharacter.displayName = 'FaceCharacter';

export default FaceCharacter;
