import { useEffect, useRef, useCallback } from 'react';

/* global spine */
// spine-webgl은 index.html의 <script src="/spine-webgl.js">로 전역 로드됨

export default function SpineCanvas({ jsonUrl, atlasUrl, animation, scale = 0.4, onAnimationsLoaded, debugOptions = {} }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const debugRef = useRef(debugOptions);
  const needsSlotReset = useRef(false);
  const touchRef = useRef({
    active: false,
    startMouseWorldX: 0,
    startMouseWorldY: 0,
    initBallMoveWorldX: 0,
    initBallMoveWorldY: 0,
    currentMouseWorldX: 0,
    currentMouseWorldY: 0,
  });

  useEffect(() => {
    debugRef.current = debugOptions;
  }, [debugOptions]);

  const dispose = useCallback(() => {
    if (stateRef.current) {
      cancelAnimationFrame(stateRef.current.rafId);
      stateRef.current.renderer?.dispose();
      stateRef.current = null;
    }
  }, []);

  // 애니메이션 전환 (렌더러 재생성 없이)
  useEffect(() => {
    if (!stateRef.current || !animation) return;
    try {
      stateRef.current.animState.setAnimation(0, animation, true);
      stateRef.current.animState.clearTrack(1);
      touchRef.current.active = false;
      needsSlotReset.current = true;
    } catch (e) {
      console.warn('애니메이션 전환 실패:', e);
    }
  }, [animation]);

  // 스크린 좌표 → Spine 월드 좌표 변환
  const screenToWorld = (clientX, clientY) => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return null;
    const { viewW, viewH } = state;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width - 0.5) * viewW,
      y: (0.5 - (clientY - rect.top) / rect.height) * viewH,
    };
  };

  const handlePointerDown = useCallback((e) => {
    const state = stateRef.current;
    if (!state || touchRef.current.active) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const world = screenToWorld(clientX, clientY);
    if (!world) return;

    // 볼 뼈 근처 클릭만 인터랙션 시작
    const ballBone = state.ballMoveBone;
    if (ballBone) {
      const dx = world.x - ballBone.worldX;
      const dy = world.y - ballBone.worldY;
      const hitRadius = state.viewW * 0.13;
      if (dx * dx + dy * dy > hitRadius * hitRadius) return;
    }

    touchRef.current = {
      active: true,
      initialized: false,
      startMouseWorldX: world.x,
      startMouseWorldY: world.y,
      initBallMoveWorldX: 0,
      initBallMoveWorldY: 0,
      currentMouseWorldX: world.x,
      currentMouseWorldY: world.y,
    };
    state.animState.setAnimation(1, 'Touch_Idle', true);
    canvasRef.current.style.cursor = 'grabbing';

    // 마우스 이벤트일 때만 캔버스 밖 업도 감지
    if (!e.touches) {
      window.addEventListener('mouseup', handlePointerUp, { once: true });
    }
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!touchRef.current.active) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const world = screenToWorld(clientX, clientY);
    if (!world) return;
    touchRef.current.currentMouseWorldX = world.x;
    touchRef.current.currentMouseWorldY = world.y;
  }, []);

  const handlePointerUp = useCallback(() => {
    const state = stateRef.current;
    if (!state || !touchRef.current.active) return;
    touchRef.current.active = false;
    // 볼 뼈 즉시 초기화 (Touch_End 중 메시 변형 방지)
    const ballBone = state.ballMoveBone;
    if (ballBone) { ballBone.x = ballBone.data.x; ballBone.y = ballBone.data.y; }
    state.animState.setAnimation(1, 'Touch_End', false);
    canvasRef.current.style.cursor = 'grab';
  }, []);

  // 초기화 (jsonUrl / atlasUrl 변경 시)
  useEffect(() => {
    dispose();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) {
      console.error('WebGL을 지원하지 않는 브라우저입니다.');
      return;
    }

    const renderer = new spine.SceneRenderer(canvas, gl, true);
    const assetManager = new spine.AssetManager(gl, '');
    assetManager.loadTextureAtlas(atlasUrl);
    assetManager.loadJson(jsonUrl);

    let rafId;

    const waitLoad = () => {
      if (!assetManager.isLoadingComplete()) {
        rafId = requestAnimationFrame(waitLoad);
        return;
      }
      if (assetManager.hasErrors()) {
        console.error('에셋 로드 실패:', assetManager.getErrors());
        return;
      }

      // 스켈레톤 생성
      const atlas = assetManager.get(atlasUrl);
      const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
      const skeletonJson = new spine.SkeletonJson(atlasLoader);
      skeletonJson.scale = scale;
      const skeletonData = skeletonJson.readSkeletonData(assetManager.get(jsonUrl));
      const skeleton = new spine.Skeleton(skeletonData);

      // 애니메이션 스테이트
      const animStateData = new spine.AnimationStateData(skeletonData);
      const animState = new spine.AnimationState(animStateData);
      const hasAnim = (name) => skeletonData.animations.some(a => a.name === name);
      const defaultAnim = (animation && hasAnim(animation)) ? animation : skeletonData.animations[0]?.name;
      if (defaultAnim) animState.setAnimation(0, defaultAnim, true);

      onAnimationsLoaded?.(skeletonData.animations.map(a => a.name));

      // 터치 인터랙션 대상 뼈 참조
      const ballMoveBone = skeleton.findBone('Character_Ball_Move');
      const faceCTBone   = skeleton.findBone('Face_CT');

      // getBounds로 자동 피팅
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined);
      const offset = new spine.Vector2();
      const size = new spine.Vector2();
      skeleton.getBounds(offset, size, []);

      skeleton.x = -offset.x - size.x / 2;
      skeleton.y = -offset.y - size.y / 2;

      const padding = 1.15;
      const charAspect = size.x / size.y;
      const canvasAspect = canvas.width / canvas.height;
      let viewW, viewH;
      if (charAspect > canvasAspect) {
        viewW = size.x * padding;
        viewH = viewW / canvasAspect;
      } else {
        viewH = size.y * padding;
        viewW = viewH * canvasAspect;
      }

      stateRef.current = { skeleton, animState, renderer, gl, rafId: null, viewW, viewH, ballMoveBone, faceCTBone };

      let lastTime = performance.now();
      const phys = spine.Physics ? spine.Physics.update : undefined;

      const render = () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Touch_End 완료 또는 애니메이션 전환 시 슬롯 한 번 리셋
        if (needsSlotReset.current) {
          skeleton.setSlotsToSetupPose();
          needsSlotReset.current = false;
        }

        animState.update(delta);
        animState.apply(skeleton);

        // 뼈 오버라이드 (Touch_Idle 재생 중)
        const touch = touchRef.current;
        if (touch.active && (stateRef.current.ballMoveBone || stateRef.current.faceCTBone)) {
          let deltaX = touch.currentMouseWorldX - touch.startMouseWorldX;
          let deltaY = touch.currentMouseWorldY - touch.startMouseWorldY;
          const dragDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const maxDrag = viewW * 0.22;
          if (dragDist > maxDrag) {
            const clampScale = maxDrag / dragDist;
            deltaX *= clampScale;
            deltaY *= clampScale;
          }

          // 1차 updateWorldTransform (부모 체인 계산용)
          skeleton.updateWorldTransform(phys);

          // Touch_Idle 좌표계에서 볼 기준 위치 캡처 (첫 프레임만)
          const ballBone = stateRef.current.ballMoveBone;
          if (!touch.initialized) {
            touch.initialized = true;
            if (ballBone) {
              touch.initBallMoveWorldX = ballBone.worldX;
              touch.initBallMoveWorldY = ballBone.worldY;
            }
          }
          if (ballBone) {
            const targetWX = touch.initBallMoveWorldX + deltaX;
            const targetWY = touch.initBallMoveWorldY + deltaY;
            const local = new spine.Vector2(targetWX, targetWY);
            if (ballBone.parent) ballBone.parent.worldToLocal(local);
            ballBone.x = local.x;
            ballBone.y = local.y;
          }

          // 2차 updateWorldTransform (오버라이드 반영)
          skeleton.updateWorldTransform(phys);
        } else {
          // 드래그 비활성 시 볼 뼈를 setup pose로 유지
          const ballBone = stateRef.current.ballMoveBone;
          if (ballBone) { ballBone.x = ballBone.data.x; ballBone.y = ballBone.data.y; }
          skeleton.updateWorldTransform(phys);
        }

        // Touch_End 재생 완료 시 track 1 클리어 + 슬롯 리셋 예약
        const track1 = animState.getCurrent(1);
        if (track1 && !track1.loop && track1.isComplete()) {
          animState.clearTrack(1);
          needsSlotReset.current = true;
        }

        // 카메라 설정
        renderer.camera.position.x = 0;
        renderer.camera.position.y = 0;
        renderer.camera.viewportWidth = viewW;
        renderer.camera.viewportHeight = viewH;
        renderer.camera.update();

        // 렌더링
        renderer.begin();
        renderer.drawSkeleton(skeleton, true);

        const opts = debugRef.current;
        if (Object.values(opts).some(Boolean)) {
          const dbr = renderer.skeletonDebugRenderer;
          dbr.drawBones             = !!opts.bones;
          dbr.drawRegionAttachments = !!opts.regions;
          dbr.drawMeshHull          = !!opts.meshHull;
          dbr.drawMeshTriangles     = !!opts.meshTriangles;
          dbr.drawBoundingBoxes     = !!opts.boundingBoxes;
          dbr.drawPaths             = !!opts.paths;
          dbr.drawPoints            = !!opts.points;
          dbr.drawClipping          = !!opts.clipping;
          renderer.drawSkeletonDebug(skeleton, true);
        }

        renderer.end();

        rafId = requestAnimationFrame(render);
        stateRef.current.rafId = rafId;
      };

      rafId = requestAnimationFrame(render);
      stateRef.current.rafId = rafId;
    };

    rafId = requestAnimationFrame(waitLoad);
    return () => { cancelAnimationFrame(rafId); dispose(); };
  }, [jsonUrl, atlasUrl, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={800}
      style={{ background: 'transparent', display: 'block', cursor: 'grab' }}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
    />
  );
}
