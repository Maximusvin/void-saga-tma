import { getEncounterMaxHealth, isBossStage } from './balance';
import type { GameEvent } from './types';

type MonsterDefeatedEvent = Extract<GameEvent, { type: 'monster_defeated' }>;

export interface EncounterTransition {
  defeatedStage: number;
  enemiesInStage: number;
  enemyIndex: number;
  gemReward: number;
  goldReward: MonsterDefeatedEvent['goldReward'];
  id: number;
  monsterMaxHealth: ReturnType<typeof getEncounterMaxHealth>;
  nextEnemyIndex: number;
  nextStage: number;
  source: 'passive' | 'tap';
  stageCleared: boolean;
  wasBoss: boolean;
}

export const getEncounterTransitionDurationMs = (transition: EncounterTransition) => (
  transition.wasBoss ? 1_100 : 900
);

export const getEncounterTransitionKey = (transition: Pick<EncounterTransition, 'defeatedStage' | 'enemyIndex'>) => (
  `${transition.defeatedStage}:${transition.enemyIndex}`
);

export const createEncounterTransition = (
  events: readonly GameEvent[],
  id: number,
): EncounterTransition | null => {
  const defeatIndex = events.findIndex(event => event.type === 'monster_defeated');
  if (defeatIndex < 0) {
    return null;
  }

  const defeated = events[defeatIndex] as MonsterDefeatedEvent;
  const lethalHit = events
    .slice(0, defeatIndex)
    .reverse()
    .find((event): event is Extract<GameEvent, { type: 'monster_hit' }> => (
      event.type === 'monster_hit' && event.stage === defeated.stage
    ));

  return {
    defeatedStage: defeated.stage,
    enemiesInStage: defeated.enemiesInStage,
    enemyIndex: defeated.enemyIndex,
    gemReward: defeated.gemReward,
    goldReward: defeated.goldReward,
    id,
    monsterMaxHealth: getEncounterMaxHealth(defeated.stage, defeated.enemyIndex),
    nextEnemyIndex: defeated.nextEnemyIndex,
    nextStage: defeated.nextStage,
    source: lethalHit?.source ?? 'tap',
    stageCleared: defeated.stageCleared,
    wasBoss: isBossStage(defeated.stage),
  };
};
