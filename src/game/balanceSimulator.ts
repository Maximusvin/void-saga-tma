import {
  GAME_BALANCE,
  SUMMON_POOL,
  getAscensionShardCost,
  getBaseClickPower,
  getEncounterMaxHealth,
  getEnemiesInStage,
  getDuplicateShardReward,
  getHeroLevelCap,
  getNextHeroPower,
  getPassivePower,
  getStageBandForStage,
  getUpgradeCost,
  isHeroAtLevelCap,
  isBossStage,
  rollSummonTemplate,
} from './balance';
import {
  ZERO_GAME_NUMBER,
  addGameNumbers,
  compareGameNumbers,
  divideGameNumbers,
  formatGameNumber,
  gameNumber,
  multiplyGameNumbers,
  subtractGameNumbers,
  type GameNumber,
  type GameNumberInput,
} from './gameNumber';
import type { Hero, HeroRarity } from './types';

export interface SimulationHeroSeed {
  ascension?: number;
  id: string;
  name: string;
  power: GameNumberInput;
  rarity: HeroRarity;
  shards?: number;
  templateId: string;
}

export type SimulationSummonSource =
  | { kind: 'template-sequence'; values: readonly string[] }
  | { kind: 'rng-sequence'; values: readonly number[] };

export interface BalanceSimulationConfig {
  allowNewHeroesFromSummons: boolean;
  automaticSummons: boolean;
  checkpointStages: readonly number[];
  endStage: number;
  heroes: readonly SimulationHeroSeed[];
  id: string;
  initialGems: number;
  initialGold: GameNumberInput;
  initialSummonPity: number;
  initialSummonsConsumed: number;
  maxUpgradesPerStage: number;
  normalTargetTtkSeconds: number;
  bossTargetTtkSeconds: number;
  sustainedComboMultiplier: number;
  summonSource: SimulationSummonSource;
  tapsPerSecond: number;
}

export interface BalanceSimulationRow {
  ascensionsPurchased: number;
  blockedByGold: boolean;
  blockedByProgression: boolean;
  cumulativeSeconds: GameNumber;
  enemiesInStage: number;
  goldAfter: GameNumber;
  goldBefore: GameNumber;
  gemsAfter: number;
  isBoss: boolean;
  monsterHealth: GameNumber;
  stage: number;
  stageReward: GameNumber;
  summonsPurchased: number;
  tapDps: GameNumber;
  teamPower: GameNumber;
  totalDps: GameNumber;
  totalAscensions: number;
  totalSummons: number;
  totalUpgrades: number;
  targetMissed: boolean;
  ttkSeconds: GameNumber;
  upgradeSpend: GameNumber;
  upgradesPurchased: number;
}

export interface BalanceSimulationSummary {
  blockedStages: number;
  finalGold: GameNumber;
  finalHeroes: Array<{
    ascension: number;
    id: string;
    level: number;
    levelCap: number;
    power: GameNumber;
    shards: number;
  }>;
  finalGems: number;
  finalTeamPower: GameNumber;
  goldBlockedStages: number;
  maximumSummonPity: number;
  pityTriggers: number;
  progressionBlockedStages: number;
  totalSeconds: GameNumber;
  totalAscensions: number;
  totalSummons: number;
  totalUpgrades: number;
  worstBossStage: number;
  worstBossTtkSeconds: GameNumber;
  worstNormalStage: number;
  worstNormalTtkSeconds: GameNumber;
}

export interface BalanceSimulationResult {
  config: BalanceSimulationConfig;
  rows: BalanceSimulationRow[];
  summary: BalanceSimulationSummary;
}

export const BASELINE_CHECKPOINT_STAGES = [
  1,
  5,
  10,
  25,
  50,
  100,
  250,
  500,
  1_000,
  2_500,
  5_000,
  10_000,
] as const;

const RARE_SUMMON_POSITIONS = new Set([3, 6, 9, 13, 16, 19, 23, 26, 29, 33, 36, 39, 43, 46]);
const EPIC_SUMMON_POSITIONS = new Set([10, 20, 30, 40, 45]);

export const DETERMINISTIC_SUMMON_SEQUENCE = Array.from({ length: 50 }, (_, index) => {
  const position = index + 1;
  if (position === 50) {
    return 'void-lord';
  }
  if (EPIC_SUMMON_POSITIONS.has(position)) {
    return 'void-knight';
  }
  if (RARE_SUMMON_POSITIONS.has(position)) {
    return 'void-mage';
  }
  return 'void-grunt';
});

export const BASELINE_BALANCE_SIMULATION: BalanceSimulationConfig = {
  allowNewHeroesFromSummons: true,
  automaticSummons: true,
  checkpointStages: BASELINE_CHECKPOINT_STAGES,
  endStage: 10_000,
  heroes: [
    { id: 'void-grunt', name: 'Void Grunt', power: 5, rarity: 'Common', shards: 1, templateId: 'void-grunt' },
    { id: 'void-mage', name: 'Void Mage', power: 10, rarity: 'Rare', templateId: 'void-mage' },
  ],
  id: 'baseline-three-summons',
  initialGems: 0,
  initialGold: GAME_BALANCE.initialGold,
  initialSummonPity: 3,
  initialSummonsConsumed: 3,
  maxUpgradesPerStage: 250,
  normalTargetTtkSeconds: 10,
  bossTargetTtkSeconds: 40,
  sustainedComboMultiplier: 1,
  summonSource: { kind: 'template-sequence', values: DETERMINISTIC_SUMMON_SEQUENCE },
  tapsPerSecond: 4,
};

export const FIVE_COMMON_BALANCE_SIMULATION: BalanceSimulationConfig = {
  ...BASELINE_BALANCE_SIMULATION,
  heroes: [{
    id: 'void-grunt',
    name: 'Void Grunt',
    power: 5,
    rarity: 'Common',
    shards: 2,
    templateId: 'void-grunt',
  }],
  id: 'unlucky-common-start',
};

export const SOLO_COMMON_BALANCE_SIMULATION: BalanceSimulationConfig = {
  ...BASELINE_BALANCE_SIMULATION,
  allowNewHeroesFromSummons: false,
  heroes: [{
    id: 'void-grunt',
    name: 'Void Grunt',
    power: 5,
    rarity: 'Common',
    shards: 2,
    templateId: 'void-grunt',
  }],
  id: 'solo-common',
};

export const ADVERSARIAL_RNG_BALANCE_SIMULATION: BalanceSimulationConfig = {
  ...FIVE_COMMON_BALANCE_SIMULATION,
  id: 'adversarial-rng-pity',
  initialSummonPity: 5,
  summonSource: { kind: 'rng-sequence', values: [0] },
};

export const DEFAULT_BALANCE_SIMULATION_SCENARIOS = [
  BASELINE_BALANCE_SIMULATION,
  FIVE_COMMON_BALANCE_SIMULATION,
  ADVERSARIAL_RNG_BALANCE_SIMULATION,
  SOLO_COMMON_BALANCE_SIMULATION,
] as const;

interface CombatProjection {
  tapDps: GameNumber;
  teamPower: GameNumber;
  totalDps: GameNumber;
  ttkSeconds: GameNumber;
}

interface UpgradeCandidate {
  cost: GameNumber;
  heroIndex: number;
  nextPower: GameNumber;
  roi: GameNumber;
}

const EQUIVALENT_ROI_MULTIPLIER = 1.001;

const normalizePositiveInteger = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }

  return value;
};

const normalizePositiveNumber = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }

  return value;
};

const normalizeNonNegativeInteger = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }

  return value;
};

const createSimulationHeroes = (seeds: readonly SimulationHeroSeed[]): Hero[] => {
  if (seeds.length === 0) {
    throw new RangeError('Balance simulation requires at least one hero');
  }

  return seeds.map(seed => ({
    ascension: seed.ascension ?? 0,
    id: seed.id,
    level: 1,
    name: seed.name,
    power: gameNumber(seed.power),
    rarity: seed.rarity,
    shards: seed.shards ?? 0,
    templateId: seed.templateId,
  }));
};

const projectCombat = (
  heroes: readonly Hero[],
  monsterHealth: GameNumber,
  config: BalanceSimulationConfig,
): CombatProjection => {
  const teamPower = getPassivePower([...heroes]);
  const expectedCritMultiplier = 1 + GAME_BALANCE.critChance * (GAME_BALANCE.critMultiplier - 1);
  const tapDps = multiplyGameNumbers(
    getBaseClickPower([...heroes]),
    config.tapsPerSecond,
    expectedCritMultiplier,
    config.sustainedComboMultiplier,
  );
  const totalDps = addGameNumbers(teamPower, tapDps);

  return {
    tapDps,
    teamPower,
    totalDps,
    ttkSeconds: divideGameNumbers(monsterHealth, totalDps),
  };
};

const getBestUpgradeCandidate = (heroes: readonly Hero[], gold: GameNumber): UpgradeCandidate | null => {
  let bestCandidate: UpgradeCandidate | null = null;

  heroes.forEach((hero, heroIndex) => {
    if (isHeroAtLevelCap(hero)) {
      return;
    }

    const cost = getUpgradeCost(hero);
    if (compareGameNumbers(gold, cost) < 0) {
      return;
    }

    const nextPower = getNextHeroPower(hero);
    const powerGain = subtractGameNumbers(nextPower, hero.power);
    const roi = divideGameNumbers(powerGain, cost);
    const isBetterRoi = !bestCandidate || compareGameNumbers(
      roi,
      multiplyGameNumbers(bestCandidate.roi, EQUIVALENT_ROI_MULTIPLIER),
    ) > 0;
    const tiedCandidate = bestCandidate ? heroes[bestCandidate.heroIndex] : null;
    const hasEquivalentRoi = bestCandidate && compareGameNumbers(
      multiplyGameNumbers(roi, EQUIVALENT_ROI_MULTIPLIER),
      bestCandidate.roi,
    ) >= 0;
    const isStableTieBreak = bestCandidate && tiedCandidate && hasEquivalentRoi && (
      hero.level < tiedCandidate.level ||
      (hero.level === tiedCandidate.level && hero.id.localeCompare(tiedCandidate.id) < 0)
    );

    if (isBetterRoi || isStableTieBreak) {
      bestCandidate = { cost, heroIndex, nextPower, roi };
    }
  });

  return bestCandidate;
};

const getReadyAscensionHeroIndex = (heroes: readonly Hero[]) => {
  let candidateIndex: number | null = null;

  heroes.forEach((hero, heroIndex) => {
    if (!isHeroAtLevelCap(hero) || hero.shards < getAscensionShardCost(hero)) {
      return;
    }

    const currentCandidate = candidateIndex === null ? null : heroes[candidateIndex];
    if (
      !currentCandidate ||
      hero.ascension < currentCandidate.ascension ||
      (hero.ascension === currentCandidate.ascension && hero.id.localeCompare(currentCandidate.id) < 0)
    ) {
      candidateIndex = heroIndex;
    }
  });

  return candidateIndex;
};

const applySimulationSummon = (
  heroes: Hero[],
  templateId: string,
  allowNewHeroes: boolean,
) => {
  const template = SUMMON_POOL.find(entry => entry.id === templateId);
  if (!template) {
    throw new RangeError(`No summon template configured for ${templateId}`);
  }

  const existingIndex = heroes.findIndex(hero => hero.templateId === template.id);
  if (existingIndex >= 0) {
    const hero = heroes[existingIndex];
    heroes[existingIndex] = {
      ...hero,
      shards: hero.shards + getDuplicateShardReward(hero.rarity),
    };
    return;
  }

  if (!allowNewHeroes) {
    return;
  }

  heroes.push({
    ascension: 0,
    id: template.id,
    level: 1,
    name: template.name,
    power: gameNumber(template.power),
    rarity: template.rarity,
    shards: 0,
    templateId: template.id,
  });
};

const resolveSimulationSummon = (
  source: SimulationSummonSource,
  sequenceIndex: number,
  summonPity: number,
) => {
  const pityTriggered = summonPity >= GAME_BALANCE.legendaryPityPulls - 1;
  if (pityTriggered) {
    return {
      pityTriggered,
      template: rollSummonTemplate(0, 'Legendary'),
    };
  }

  if (source.kind === 'rng-sequence') {
    return {
      pityTriggered,
      template: rollSummonTemplate(source.values[sequenceIndex]),
    };
  }

  const templateId = source.values[sequenceIndex];
  const template = SUMMON_POOL.find(entry => entry.id === templateId);
  if (!template) {
    throw new RangeError(`No summon template configured for ${templateId}`);
  }

  return { pityTriggered, template };
};

const getStageReward = (
  stage: number,
  monsterHealth: GameNumber,
  tapDps: GameNumber,
  totalDps: GameNumber,
) => {
  const stageBand = getStageBandForStage(stage);
  const killReward = multiplyGameNumbers(
    monsterHealth,
    isBossStage(stage) ? stageBand.boss.goldMultiplier : GAME_BALANCE.killGoldMultiplier,
  );
  const tapDamageShare = divideGameNumbers(tapDps, totalDps);
  const tapGold = multiplyGameNumbers(monsterHealth, tapDamageShare, GAME_BALANCE.clickGoldMultiplier);

  return addGameNumbers(killReward, tapGold);
};

const getWorstRow = (rows: readonly BalanceSimulationRow[], boss: boolean) => {
  return rows
    .filter(row => row.isBoss === boss)
    .reduce((worst, row) => (
      !worst || compareGameNumbers(row.ttkSeconds, worst.ttkSeconds) > 0 ? row : worst
    ), null as BalanceSimulationRow | null);
};

export const runBalanceSimulation = (
  config: BalanceSimulationConfig = BASELINE_BALANCE_SIMULATION,
): BalanceSimulationResult => {
  const endStage = normalizePositiveInteger(config.endStage, 'endStage');
  const maxUpgradesPerStage = normalizePositiveInteger(config.maxUpgradesPerStage, 'maxUpgradesPerStage');
  normalizePositiveNumber(config.normalTargetTtkSeconds, 'normalTargetTtkSeconds');
  normalizePositiveNumber(config.bossTargetTtkSeconds, 'bossTargetTtkSeconds');
  normalizePositiveNumber(config.tapsPerSecond, 'tapsPerSecond');
  normalizePositiveNumber(config.sustainedComboMultiplier, 'sustainedComboMultiplier');
  normalizeNonNegativeInteger(config.initialGems, 'initialGems');
  normalizeNonNegativeInteger(config.initialSummonPity, 'initialSummonPity');
  normalizeNonNegativeInteger(config.initialSummonsConsumed, 'initialSummonsConsumed');
  if (config.initialSummonPity >= GAME_BALANCE.legendaryPityPulls) {
    throw new RangeError('initialSummonPity must be lower than the hard pity threshold');
  }
  if (config.summonSource.values.length === 0) {
    throw new RangeError('summonSource must contain at least one value');
  }
  if (
    config.summonSource.kind === 'rng-sequence' &&
    config.summonSource.values.some(value => !Number.isFinite(value) || value < 0 || value >= 1)
  ) {
    throw new RangeError('rng-sequence values must be finite numbers from 0 inclusive to 1 exclusive');
  }

  const heroes = createSimulationHeroes(config.heroes);
  let gold = gameNumber(config.initialGold);
  let gems = config.initialGems;
  let cumulativeSeconds = ZERO_GAME_NUMBER;
  let maximumSummonPity = config.initialSummonPity;
  let pityTriggers = 0;
  let summonPity = config.initialSummonPity;
  let totalAscensions = 0;
  let totalSummons = 0;
  let totalUpgrades = 0;
  const rows: BalanceSimulationRow[] = [];

  for (let stage = 1; stage <= endStage; stage += 1) {
    const enemiesInStage = getEnemiesInStage(stage);
    const goldBefore = gold;
    const targetTtkPerEncounter = isBossStage(stage)
      ? config.bossTargetTtkSeconds
      : config.normalTargetTtkSeconds;
    let projection = projectCombat(heroes, getEncounterMaxHealth(stage, 0), config);
    let ascensionsPurchased = 0;
    let blockedByGold = false;
    let blockedByProgression = false;
    let monsterHealth = ZERO_GAME_NUMBER;
    let stageReward = ZERO_GAME_NUMBER;
    let stageTtkSeconds = ZERO_GAME_NUMBER;
    let targetMissed = false;
    let upgradesPurchased = 0;
    let upgradeSpend = ZERO_GAME_NUMBER;

    for (let enemyIndex = 0; enemyIndex < enemiesInStage; enemyIndex += 1) {
      const encounterHealth = getEncounterMaxHealth(stage, enemyIndex);
      monsterHealth = addGameNumbers(monsterHealth, encounterHealth);
      projection = projectCombat(heroes, encounterHealth, config);

      while (
        compareGameNumbers(projection.ttkSeconds, targetTtkPerEncounter) > 0 &&
        upgradesPurchased < maxUpgradesPerStage
      ) {
        const candidate = getBestUpgradeCandidate(heroes, gold);
        if (!candidate) {
          const ascensionHeroIndex = getReadyAscensionHeroIndex(heroes);
          if (ascensionHeroIndex === null) {
            break;
          }

          const hero = heroes[ascensionHeroIndex];
          heroes[ascensionHeroIndex] = {
            ...hero,
            ascension: hero.ascension + 1,
            shards: hero.shards - getAscensionShardCost(hero),
          };
          ascensionsPurchased += 1;
          totalAscensions += 1;
          continue;
        }

        const hero = heroes[candidate.heroIndex];
        heroes[candidate.heroIndex] = {
          ...hero,
          level: hero.level + 1,
          power: candidate.nextPower,
        };
        gold = subtractGameNumbers(gold, candidate.cost);
        upgradeSpend = addGameNumbers(upgradeSpend, candidate.cost);
        upgradesPurchased += 1;
        totalUpgrades += 1;
        projection = projectCombat(heroes, encounterHealth, config);
      }

      const encounterTargetMissed = compareGameNumbers(
        projection.ttkSeconds,
        targetTtkPerEncounter,
      ) > 0;
      const hasUncappedHero = heroes.some(hero => !isHeroAtLevelCap(hero));
      const hasAffordableUpgrade = getBestUpgradeCandidate(heroes, gold) !== null;
      const hasReadyAscension = getReadyAscensionHeroIndex(heroes) !== null;
      targetMissed ||= encounterTargetMissed;
      blockedByGold ||= encounterTargetMissed && hasUncappedHero && !hasAffordableUpgrade;
      blockedByProgression ||= encounterTargetMissed && !hasUncappedHero && !hasReadyAscension;

      const encounterReward = getStageReward(
        stage,
        encounterHealth,
        projection.tapDps,
        projection.totalDps,
      );
      stageReward = addGameNumbers(stageReward, encounterReward);
      gold = addGameNumbers(gold, encounterReward);
      stageTtkSeconds = addGameNumbers(stageTtkSeconds, projection.ttkSeconds);
      cumulativeSeconds = addGameNumbers(cumulativeSeconds, projection.ttkSeconds);
    }

    if (isBossStage(stage)) {
      gems += getStageBandForStage(stage).boss.gemReward;
    }

    let summonsPurchased = 0;
    while (config.automaticSummons && gems >= GAME_BALANCE.summonCostGems) {
      const sequenceIndex = (
        config.initialSummonsConsumed + totalSummons
      ) % config.summonSource.values.length;
      const summon = resolveSimulationSummon(config.summonSource, sequenceIndex, summonPity);
      applySimulationSummon(
        heroes,
        summon.template.id,
        config.allowNewHeroesFromSummons,
      );
      if (summon.pityTriggered) {
        pityTriggers += 1;
      }
      summonPity = summon.template.rarity === 'Legendary' ? 0 : summonPity + 1;
      maximumSummonPity = Math.max(maximumSummonPity, summonPity);
      gems -= GAME_BALANCE.summonCostGems;
      summonsPurchased += 1;
      totalSummons += 1;
    }

    rows.push({
      ascensionsPurchased,
      blockedByGold,
      blockedByProgression,
      cumulativeSeconds,
      enemiesInStage,
      gemsAfter: gems,
      goldAfter: gold,
      goldBefore,
      isBoss: isBossStage(stage),
      monsterHealth,
      stage,
      stageReward,
      summonsPurchased,
      tapDps: projection.tapDps,
      teamPower: projection.teamPower,
      totalDps: projection.totalDps,
      totalAscensions,
      totalSummons,
      totalUpgrades,
      targetMissed,
      ttkSeconds: stageTtkSeconds,
      upgradeSpend,
      upgradesPurchased,
    });
  }

  const worstNormal = getWorstRow(rows, false);
  const worstBoss = getWorstRow(rows, true);
  const finalRow = rows[rows.length - 1];

  return {
    config,
    rows,
    summary: {
      blockedStages: rows.filter(row => row.targetMissed).length,
      finalGold: finalRow.goldAfter,
      finalHeroes: heroes
        .map(hero => ({
          ascension: hero.ascension,
          id: hero.id,
          level: hero.level,
          levelCap: getHeroLevelCap(hero),
          power: hero.power,
          shards: hero.shards,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      finalGems: finalRow.gemsAfter,
      finalTeamPower: finalRow.teamPower,
      goldBlockedStages: rows.filter(row => row.blockedByGold).length,
      maximumSummonPity,
      pityTriggers,
      progressionBlockedStages: rows.filter(row => row.blockedByProgression).length,
      totalSeconds: finalRow.cumulativeSeconds,
      totalAscensions,
      totalSummons,
      totalUpgrades,
      worstBossStage: worstBoss?.stage ?? 0,
      worstBossTtkSeconds: worstBoss?.ttkSeconds ?? ZERO_GAME_NUMBER,
      worstNormalStage: worstNormal?.stage ?? 0,
      worstNormalTtkSeconds: worstNormal?.ttkSeconds ?? ZERO_GAME_NUMBER,
    },
  };
};

const csvValue = (value: string | number | boolean) => String(value);

export const renderBalanceSimulationCsv = (
  result: BalanceSimulationResult,
  stages: readonly number[] = result.config.checkpointStages,
) => {
  const selectedStages = new Set(stages);
  const lines = [
    [
      'stage',
      'boss',
      'enemies_in_stage',
      'monster_health',
      'team_power',
      'total_dps',
      'ttk_seconds',
      'upgrades',
      'total_upgrades',
      'gold_before',
      'upgrade_spend',
      'stage_reward',
      'gold_after',
      'gems_after',
      'summons',
      'total_summons',
      'ascensions',
      'total_ascensions',
      'blocked_by_gold',
      'blocked_by_progression',
      'target_missed',
    ].join(','),
  ];

  for (const row of result.rows) {
    if (!selectedStages.has(row.stage)) {
      continue;
    }

    lines.push([
      row.stage,
      row.isBoss,
      row.enemiesInStage,
      row.monsterHealth,
      row.teamPower,
      row.totalDps,
      row.ttkSeconds,
      row.upgradesPurchased,
      row.totalUpgrades,
      row.goldBefore,
      row.upgradeSpend,
      row.stageReward,
      row.goldAfter,
      row.gemsAfter,
      row.summonsPurchased,
      row.totalSummons,
      row.ascensionsPurchased,
      row.totalAscensions,
      row.blockedByGold,
      row.blockedByProgression,
      row.targetMissed,
    ].map(csvValue).join(','));
  }

  return `${lines.join('\n')}\n`;
};

export const renderBalanceScenarioSummaryCsv = (results: readonly BalanceSimulationResult[]) => {
  const lines = [[
    'scenario',
    'hero_count',
    'blocked_stages',
    'gold_blocked_stages',
    'progression_blocked_stages',
    'total_summons',
    'pity_triggers',
    'maximum_summon_pity',
    'total_ascensions',
    'total_upgrades',
    'total_seconds',
    'final_team_power',
    'final_gold',
    'worst_normal_stage',
    'worst_normal_ttk_seconds',
    'worst_boss_stage',
    'worst_boss_ttk_seconds',
  ].join(',')];

  for (const { config, summary } of results) {
    lines.push([
      config.id,
      summary.finalHeroes.length,
      summary.blockedStages,
      summary.goldBlockedStages,
      summary.progressionBlockedStages,
      summary.totalSummons,
      summary.pityTriggers,
      summary.maximumSummonPity,
      summary.totalAscensions,
      summary.totalUpgrades,
      summary.totalSeconds,
      summary.finalTeamPower,
      summary.finalGold,
      summary.worstNormalStage,
      summary.worstNormalTtkSeconds,
      summary.worstBossStage,
      summary.worstBossTtkSeconds,
    ].map(csvValue).join(','));
  }

  return `${lines.join('\n')}\n`;
};

export const formatBalanceSimulationSummary = (result: BalanceSimulationResult) => {
  const { summary } = result;
  return [
    `Scenario: ${result.config.id}`,
    `Stages: 1-${result.config.endStage}`,
    `Blocked stages: ${summary.blockedStages}`,
    `Gold-blocked stages: ${summary.goldBlockedStages}`,
    `Progression-blocked stages: ${summary.progressionBlockedStages}`,
    `Total summons: ${summary.totalSummons}`,
    `Hard pity triggers: ${summary.pityTriggers}`,
    `Maximum summon pity: ${summary.maximumSummonPity}`,
    `Total ascensions: ${summary.totalAscensions}`,
    `Total upgrades: ${summary.totalUpgrades}`,
    `Worst normal TTK: ${formatGameNumber(summary.worstNormalTtkSeconds)}s at stage ${summary.worstNormalStage}`,
    `Worst boss TTK: ${formatGameNumber(summary.worstBossTtkSeconds)}s at stage ${summary.worstBossStage}`,
    `Final heroes: ${summary.finalHeroes.map(hero => (
      `${hero.id}=L${hero.level}/A${hero.ascension} (${hero.shards} shards)`
    )).join(', ')}`,
    `Final team power: ${formatGameNumber(summary.finalTeamPower)}`,
    `Final gold: ${formatGameNumber(summary.finalGold)}`,
    `Total modeled combat time: ${formatGameNumber(summary.totalSeconds)}s`,
  ].join('\n');
};
