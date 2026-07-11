interface PixiTickerLike<TFrame> {
  remove(callback: (frame: TFrame) => void): unknown;
}

interface PixiStageLike<TScene> {
  removeChild(scene: TScene): unknown;
}

interface PixiApplicationLike<TScene, TFrame> {
  stage: PixiStageLike<TScene>;
  ticker: PixiTickerLike<TFrame>;
}

interface PixiSceneLike {
  destroy(options: {
    children: true;
    context: true;
    texture: false;
    textureSource: false;
  }): unknown;
}

export const OWNED_PIXI_SCENE_DESTROY_OPTIONS = {
  children: true,
  context: true,
  texture: false,
  textureSource: false,
} as const;

export const cleanupOwnedPixiScene = <TScene extends PixiSceneLike, TFrame>(
  currentApplication: PixiApplicationLike<TScene, TFrame> | null,
  application: PixiApplicationLike<TScene, TFrame>,
  scene: TScene,
  animateScene: (frame: TFrame) => void,
  prepareForDestroy?: () => void,
) => {
  if (currentApplication !== application) {
    return false;
  }

  application.ticker.remove(animateScene);
  application.stage.removeChild(scene);
  prepareForDestroy?.();
  scene.destroy(OWNED_PIXI_SCENE_DESTROY_OPTIONS);
  return true;
};
