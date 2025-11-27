import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import MediaPipeLipSync from './MediaPipeLipSync';

const FaceCharacter3D = forwardRef(({ isSpeaking, audioLevel }, ref) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const characterRef = useRef(null);
  const lipSyncRef = useRef(null);
  const animationFrameRef = useRef(null);
  // Use refs for animation loop to avoid stale closures and re-renders
  const mouthOpennessRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Инициализация Three.js сцены
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Сцена
    const scene = new THREE.Scene();
    scene.background = null; // Transparent for flag background
    sceneRef.current = scene;

    // Камера
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0.2, 4);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Рендерер
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Освещение
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(3, 5, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-3, 2, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 0, -5);
    scene.add(rimLight);

    // Создание 3D персонажа (реалистичная девочка)
    const character = new THREE.Group();
    
    // Голова - эллипсоид для более реалистичной формы
    const headGeometry = new THREE.SphereGeometry(0.9, 64, 64);
    // Деформируем сферу для более реалистичной формы лица
    const headPositions = headGeometry.attributes.position;
    for (let i = 0; i < headPositions.count; i++) {
      const x = headPositions.getX(i);
      const y = headPositions.getY(i);
      const z = headPositions.getZ(i);
      // Деформация для более овального лица
      const scaleX = 1.0;
      const scaleY = 1.1;
      const scaleZ = 0.95;
      headPositions.setX(i, x * scaleX);
      headPositions.setY(i, y * scaleY);
      headPositions.setZ(i, z * scaleZ);
    }
    headGeometry.attributes.position.needsUpdate = true;
    headGeometry.computeVertexNormals();

    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.6,
      metalness: 0.0,
      flatShading: false
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.castShadow = true;
    head.receiveShadow = true;
    character.add(head);

    // Волосы - более детализированные
    const hairGroup = new THREE.Group();
    
    // Основная масса волос
    const hairMainGeometry = new THREE.SphereGeometry(1.05, 32, 32);
    const hairMainMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a2c1a,
      roughness: 0.9,
      metalness: 0.0
    });
    const hairMain = new THREE.Mesh(hairMainGeometry, hairMainMaterial);
    hairMain.scale.set(1, 0.7, 1);
    hairMain.position.y = 0.4;
    hairMain.castShadow = true;
    hairGroup.add(hairMain);

    // Пряди волос
    for (let i = 0; i < 8; i++) {
      const strandGeometry = new THREE.CylinderGeometry(0.03, 0.05, 0.4, 8);
      const strand = new THREE.Mesh(strandGeometry, hairMainMaterial);
      const angle = (i / 8) * Math.PI * 2;
      strand.position.set(
        Math.cos(angle) * 0.9,
        0.6 + Math.sin(i) * 0.1,
        Math.sin(angle) * 0.9
      );
      strand.rotation.z = Math.sin(i) * 0.3;
      strand.rotation.x = Math.cos(i) * 0.2;
      hairGroup.add(strand);
    }
    character.add(hairGroup);

    // Глаза - более реалистичные
    const eyeGroup = new THREE.Group();

    // Левый глаз
    const leftEyeGeometry = new THREE.SphereGeometry(0.12, 32, 32);
    const eyeWhiteMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3
    });
    const leftEyeWhite = new THREE.Mesh(leftEyeGeometry, eyeWhiteMaterial);
    leftEyeWhite.position.set(-0.28, 0.15, 0.82);
    eyeGroup.add(leftEyeWhite);

    // Радужка левого глаза
    const irisGeometry = new THREE.SphereGeometry(0.08, 32, 32);
    const irisMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a7c59,
      roughness: 0.5
    });
    const leftIris = new THREE.Mesh(irisGeometry, irisMaterial);
    leftIris.position.set(-0.28, 0.15, 0.88);
    eyeGroup.add(leftIris);

    // Зрачок левого глаза
    const pupilGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-0.28, 0.15, 0.92);
    eyeGroup.add(leftPupil);

    // Блик на левом глазу
    const highlightGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.5
    });
    const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    leftHighlight.position.set(-0.3, 0.18, 0.93);
    eyeGroup.add(leftHighlight);

    // Правый глаз
    const rightEyeWhite = new THREE.Mesh(leftEyeGeometry, eyeWhiteMaterial);
    rightEyeWhite.position.set(0.28, 0.15, 0.82);
    eyeGroup.add(rightEyeWhite);

    const rightIris = new THREE.Mesh(irisGeometry, irisMaterial);
    rightIris.position.set(0.28, 0.15, 0.88);
    eyeGroup.add(rightIris);

    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(0.28, 0.15, 0.92);
    eyeGroup.add(rightPupil);

    const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    rightHighlight.position.set(0.3, 0.18, 0.93);
    eyeGroup.add(rightHighlight);

    // Веки
    const eyelidGeometry = new THREE.SphereGeometry(0.13, 32, 32);
    const eyelidMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.6
    });
    const leftEyelid = new THREE.Mesh(eyelidGeometry, eyelidMaterial);
    leftEyelid.position.set(-0.28, 0.15, 0.85);
    leftEyelid.scale.set(1, 0.3, 1);
    eyeGroup.add(leftEyelid);

    const rightEyelid = new THREE.Mesh(eyelidGeometry, eyelidMaterial);
    rightEyelid.position.set(0.28, 0.15, 0.85);
    rightEyelid.scale.set(1, 0.3, 1);
    eyeGroup.add(rightEyelid);

    character.add(eyeGroup);

    // Брови - более изогнутые
    const eyebrowGeometry = new THREE.TorusGeometry(0.2, 0.03, 8, 16);
    const eyebrowMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      roughness: 0.8
    });
    const leftEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
    leftEyebrow.position.set(-0.28, 0.35, 0.88);
    leftEyebrow.rotation.z = -0.3;
    leftEyebrow.rotation.x = 0.2;
    character.add(leftEyebrow);

    const rightEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
    rightEyebrow.position.set(0.28, 0.35, 0.88);
    rightEyebrow.rotation.z = 0.3;
    rightEyebrow.rotation.x = 0.2;
    character.add(rightEyebrow);

    // Нос - более реалистичный
    const noseGeometry = new THREE.ConeGeometry(0.06, 0.15, 8);
    const noseMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8c4a0,
      roughness: 0.7
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.set(0, 0.05, 0.92);
    nose.rotation.x = Math.PI;
    character.add(nose);

    // Ноздри
    const nostrilGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const nostrilMaterial = new THREE.MeshStandardMaterial({ color: 0xd4a574 });
    const leftNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial);
    leftNostril.position.set(-0.04, -0.02, 0.95);
    character.add(leftNostril);

    const rightNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial);
    rightNostril.position.set(0.04, -0.02, 0.95);
    character.add(rightNostril);

    // Рот - с морфингом для липсинга
    const mouthGroup = new THREE.Group();
    const mouthBaseGeometry = new THREE.TorusGeometry(0.15, 0.05, 16, 32);
    const mouthMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b0000,
      roughness: 0.5
    });
    const mouth = new THREE.Mesh(mouthBaseGeometry, mouthMaterial);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.set(0, -0.25, 0.9);
    mouthGroup.add(mouth);

    // Внутренняя часть рта
    const mouthInnerGeometry = new THREE.SphereGeometry(0.12, 16, 16);
    const mouthInnerMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a0000,
      roughness: 0.8
    });
    const mouthInner = new THREE.Mesh(mouthInnerGeometry, mouthInnerMaterial);
    mouthInner.position.set(0, -0.25, 0.9);
    mouthInner.scale.set(1, 0.3, 1);
    mouthGroup.add(mouthInner);

    character.add(mouthGroup);

    // Щеки
    const cheekGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const cheekMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.6,
      transparent: true,
      opacity: 0.8
    });
    const leftCheek = new THREE.Mesh(cheekGeometry, cheekMaterial);
    leftCheek.position.set(-0.4, -0.1, 0.85);
    leftCheek.scale.set(1.2, 0.8, 0.5);
    character.add(leftCheek);

    const rightCheek = new THREE.Mesh(cheekGeometry, cheekMaterial);
    rightCheek.position.set(0.4, -0.1, 0.85);
    rightCheek.scale.set(1.2, 0.8, 0.5);
    character.add(rightCheek);

    // Шея
    const neckGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.5, 16);
    const neckMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.6
    });
    const neck = new THREE.Mesh(neckGeometry, neckMaterial);
    neck.position.y = -0.7;
    neck.castShadow = true;
    character.add(neck);

    characterRef.current = {
      group: character,
      mouth,
      mouthInner,
      leftPupil,
      rightPupil,
      leftEyeWhite,
      rightEyeWhite,
      leftEyelid,
      rightEyelid,
      head
    };

    scene.add(character);

    // Анимация
    let blinkTimer = 0;
    let lastBlink = 0;
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const time = Date.now() * 0.001;

      // Плавное покачивание головы
      character.rotation.y = Math.sin(time * 0.3) * 0.1;
      character.rotation.x = Math.sin(time * 0.2) * 0.05;

      // Моргание
      blinkTimer += 0.016;
      if (blinkTimer - lastBlink > 3 + Math.random() * 2) {
        lastBlink = blinkTimer;
        const blinkDuration = 0.15;
        let blinkProgress = 0;
        const blink = () => {
          blinkProgress += 0.05;
          if (blinkProgress < blinkDuration) {
            const scale = Math.sin((blinkProgress / blinkDuration) * Math.PI);
            if (characterRef.current.leftEyelid) {
              characterRef.current.leftEyelid.scale.y = scale;
              characterRef.current.rightEyelid.scale.y = scale;
            }
            requestAnimationFrame(blink);
          } else {
            if (characterRef.current.leftEyelid) {
              characterRef.current.leftEyelid.scale.y = 0.3;
              characterRef.current.rightEyelid.scale.y = 0.3;
            }
          }
        };
        blink();
      }

      // Движение зрачков при разговоре
      if (isSpeakingRef.current && characterRef.current.leftPupil) {
        const offsetX = Math.sin(time * 2) * 0.03;
        const offsetY = Math.cos(time * 1.5) * 0.02;
        characterRef.current.leftPupil.position.x = -0.28 + offsetX;
        characterRef.current.leftPupil.position.y = 0.15 + offsetY;
        characterRef.current.rightPupil.position.x = 0.28 + offsetX;
        characterRef.current.rightPupil.position.y = 0.15 + offsetY;
      }

      // Липсинг - анимация рта
      const currentMouthOpenness = mouthOpennessRef.current;
      if (characterRef.current.mouth && characterRef.current.mouthInner) {
        const scale = 0.4 + currentMouthOpenness * 0.8;
        const height = 0.2 + currentMouthOpenness * 0.4;
        characterRef.current.mouth.scale.set(scale, scale, 1);
        characterRef.current.mouthInner.scale.set(scale * 0.8, height, scale * 0.8);
        characterRef.current.mouth.position.y = -0.25 - currentMouthOpenness * 0.15;
        characterRef.current.mouthInner.position.y = -0.25 - currentMouthOpenness * 0.15;
      }

      // Анимация щек при разговоре
      if (isSpeakingRef.current && currentMouthOpenness > 0.3) {
        const cheekScale = 1.2 + Math.sin(time * 5) * 0.1;
        leftCheek.scale.set(cheekScale, 0.8, 0.5);
        rightCheek.scale.set(cheekScale, 0.8, 0.5);
      }

      renderer.render(scene, camera);
    };

    animate();
    setIsInitialized(true);

    // Обработка изменения размера
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // Initialize once, use refs for mutable state

  // Обновляем ref при изменении isSpeaking
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Обработка аудио данных для липсинга
  const onAudioData = async (audioData, mimeType) => {
    if (lipSyncRef.current) {
      const openness = await lipSyncRef.current.analyzeAudio(audioData);
      mouthOpennessRef.current = openness;
    }
  };

  // Метод для прямой установки уровня аудио
  const setAudioLevel = (level) => {
    mouthOpennessRef.current = level;
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    onAudioData,
    setAudioLevel
  }));

  return (
    <div className="face-character-container">
      <div ref={mountRef} className="face-character-canvas" />
      <MediaPipeLipSync ref={lipSyncRef} />
    </div>
  );
});

FaceCharacter3D.displayName = 'FaceCharacter3D';

export default FaceCharacter3D;
