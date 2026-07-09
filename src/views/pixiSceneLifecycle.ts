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
  destroy(options: { children: true }): unknown;
}

export const cleanupOwnedPixiScene = <TScene extends PixiSceneLike, TFrame>(
  currentApplication: PixiApplicationLike<TScene, TFrame> | null,
  application: PixiApplicationLike<TScene, TFrame>,
  scene: TScene,
  animateScene: (frame: TFrame) => void,
) => {
  if (currentApplication !== application) {
    return false;
  }

  application.ticker.remove(animateScene);
  application.stage.removeChild(scene);
  scene.destroy({ children: true });
  return true;
};
