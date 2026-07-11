export const PROGRESSION_MILESTONE_STAGES = [
  5,
  10,
  25,
  50,
  100,
  150,
  250,
  500,
  1_000,
  2_500,
  5_000,
  10_000,
] as const;

const normalizeStage = (stage: number) => (
  Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1
);

export const getCrossedProgressionMilestones = (previousStage: number, currentStage: number) => {
  const normalizedPreviousStage = normalizeStage(previousStage);
  const normalizedCurrentStage = normalizeStage(currentStage);
  if (normalizedCurrentStage <= normalizedPreviousStage) {
    return [];
  }

  return PROGRESSION_MILESTONE_STAGES.filter(stage => (
    stage > normalizedPreviousStage && stage <= normalizedCurrentStage
  ));
};
