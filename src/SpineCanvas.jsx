import { useEffect, useRef, useCallback } from 'react';

/* global spine */
// spine-webgl은 index.html의 <script src="/spine-webgl.js">로 전역 로드됨

export default function SpineCanvas({ jsonUrl, atlasUrl, animation, scale = 0.4, onAnimationsLoaded }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null); // { skeleton, animState, renderer, gl, rafId }

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

      // 애니메이션 목록 콜백
      const animNames = skeletonData.animations.map(a => a.name);
      onAnimationsLoaded?.(animNames);

      // 캐릭터 위치: 화면 중앙 하단
      skeleton.x = canvas.width / 2;
      skeleton.y = canvas.height * 0.05;

      stateRef.current = { skeleton, animState, renderer, gl, rafId: null };

      let lastTime = performance.now();

      const render = () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        // 캔버스 클리어
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 애니메이션 업데이트
        animState.update(delta);
        animState.apply(skeleton);
        skeleton.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined);

        // 카메라 설정
        renderer.camera.position.x = canvas.width / 2;
        renderer.camera.position.y = canvas.height / 2;
        renderer.camera.viewportWidth = canvas.width;
        renderer.camera.viewportHeight = canvas.height;
        renderer.camera.update();

        // 렌더링
        renderer.begin();
        renderer.drawSkeleton(skeleton, true);
        renderer.end();

        rafId = requestAnimationFrame(render);
        stateRef.current.rafId = rafId;
      };

      rafId = requestAnimationFrame(render);
      stateRef.current.rafId = rafId;
    };

    rafId = requestAnimationFrame(waitLoad);

    return () => {
      cancelAnimationFrame(rafId);
      dispose();
    };
  }, [jsonUrl, atlasUrl, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={800}
      style={{ background: 'transparent', display: 'block' }}
    />
  );
}
