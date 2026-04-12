import { useEffect, useRef, useCallback } from 'react';

/* global spine */
// spine-webgl은 index.html의 <script src="/spine-webgl.js">로 전역 로드됨

export default function SpineCanvas({ jsonUrl, atlasUrl, animation, scale = 0.4, onAnimationsLoaded, debugOptions = {} }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const debugRef = useRef(debugOptions);
  const dragRef = useRef({
    active: false,
    bone: null,
    targetWorldX: 0,
    targetWorldY: 0,
    lastDragWorldX: 0,
    lastDragWorldY: 0,
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
    } catch (e) {
      console.warn('애니메이션 전환 실패:', e);
    }
  }, [animation]);

  // 포인터 좌표 → Spine 월드 좌표 변환
  const screenToWorld = useCallback((clientX, clientY) => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return null;
    const { viewW, viewH } = state;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width - 0.5) * viewW,
      y: (0.5 - (clientY - rect.top) / rect.height) * viewH,
    };
  }, []);

  const getClientPos = (e) =>
    e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

  const handlePointerDown = useCallback((e) => {
    const state = stateRef.current;
    if (!state) return;
    const { x: cx, y: cy } = getClientPos(e);
    const world = screenToWorld(cx, cy);
    if (!world) return;

    const { skeleton, viewW } = state;
    const threshold = (viewW * 0.12) ** 2;
    let closest = null;
    let minDist = threshold;

    for (const bone of skeleton.bones) {
      if (bone.data.name === 'root') continue;
      const dx = bone.worldX - world.x;
      const dy = bone.worldY - world.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDist) {
        minDist = d2;
        closest = bone;
      }
    }

    if (closest) {
      dragRef.current = {
        active: true,
        bone: closest,
        targetWorldX: closest.worldX,
        targetWorldY: closest.worldY,
        lastDragWorldX: closest.worldX,
        lastDragWorldY: closest.worldY,
      };
      canvasRef.current.style.cursor = 'grabbing';
    }
  }, [screenToWorld]);

  const handlePointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag.active || !drag.bone) return;
    if (e.cancelable) e.preventDefault();
    const { x: cx, y: cy } = getClientPos(e);
    const world = screenToWorld(cx, cy);
    if (!world) return;
    drag.targetWorldX = world.x;
    drag.targetWorldY = world.y;
  }, [screenToWorld]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      canvasRef.current.style.cursor = 'grab';
    }
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
      const defaultAnim = animation || skeletonData.animations[0]?.name;
      if (defaultAnim) animState.setAnimation(0, defaultAnim, true);

      onAnimationsLoaded?.(skeletonData.animations.map(a => a.name));

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

      stateRef.current = { skeleton, animState, renderer, gl, rafId: null, viewW, viewH };

      let lastTime = performance.now();
      const phys = spine.Physics ? spine.Physics.update : undefined;

      const render = () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 애니메이션 업데이트 (1차 월드 트랜스폼)
        animState.update(delta);
        animState.apply(skeleton);
        skeleton.updateWorldTransform(phys);

        // 드래그 오버라이드: 애니메이션 적용 후 뼈 위치를 강제로 변경
        const drag = dragRef.current;
        if (drag.bone) {
          const animWX = drag.bone.worldX;
          const animWY = drag.bone.worldY;
          let targetWX, targetWY, needSecondPass = false;

          if (drag.active) {
            // 드래그 중: 마우스 위치로 이동
            targetWX = drag.targetWorldX;
            targetWY = drag.targetWorldY;
            drag.lastDragWorldX = targetWX;
            drag.lastDragWorldY = targetWY;
            needSecondPass = true;
          } else {
            // 드래그 종료: 애니메이션 위치로 스프링 복귀
            drag.lastDragWorldX += (animWX - drag.lastDragWorldX) * 0.2;
            drag.lastDragWorldY += (animWY - drag.lastDragWorldY) * 0.2;
            const dx = drag.lastDragWorldX - animWX;
            const dy = drag.lastDragWorldY - animWY;
            if (dx * dx + dy * dy < 1) {
              dragRef.current = { active: false, bone: null };
            } else {
              targetWX = drag.lastDragWorldX;
              targetWY = drag.lastDragWorldY;
              needSecondPass = true;
            }
          }

          if (needSecondPass) {
            // 월드 좌표 → 부모 로컬 좌표 변환 후 뼈에 적용
            const local = new spine.Vector2(targetWX, targetWY);
            if (drag.bone.parent) drag.bone.parent.worldToLocal(local);
            drag.bone.x = local.x;
            drag.bone.y = local.y;
            skeleton.updateWorldTransform(phys); // 2차 월드 트랜스폼
          }
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
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
    />
  );
}
