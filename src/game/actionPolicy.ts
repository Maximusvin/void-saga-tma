import { GAME_BALANCE, getBaseClickPower, getComboMultiplier, getPassivePower } from './balance';
import type { GameAction, GameSnapshot } from './types';

const MAX_COMBO_HITS = Math.ceil(GAME_BALANCE.comboMaxBonus / GAME_BALANCE.comboBonusPerHit);

const getMaximumTapDamage = (snapshot: GameSnapshot) => {
  return getBaseClickPower(snapshot.heroes) * getComboMultiplier(MAX_COMBO_HITS) * GAME_BALANCE.critMultiplier;
};

export const getServerActionRejection = (snapshot: GameSnapshot, action: GameAction) => {
  if (action.type !== 'deal_damage') {
    return null;
  }

  if (action.amount <= 0) {
    return 'damage_must_be_positive';
  }

  if (action.source === 'skill') {
    return 'skill_not_available';
  }

  const maximumDamage = action.source === 'tap' ? getMaximumTapDamage(snapshot) : getPassivePower(snapshot.heroes);

  return action.amount <= maximumDamage ? null : 'damage_exceeds_allowed_power';
};
