import {
  GAME_BALANCE,
  getBaseClickPower,
  getMonsterMaxHealth,
  getNextHeroPower,
  getPassivePower,
  getStageBandForStage,
  getUpgradeCost,
  isBossStage,
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
  id: string;
  name: string;
  power: GameNumberInput;
  rarity: HeroRarity;
}

export interface BalanceSimulationConfig {
  checkpointStages: readonly number[];
  endStage: number;
  heroes: readonly SimulationHeroSeed[];
  id: string;
  initialGold: GameNumberInput;
  maxUpgradesPerStage: number;
  normalTargetTtkSeconds: number;
  bossTargetTtkSeconds: number;
  sustainedComboMultiplier: number;
  tapsPerSecond: number;
}

export interface BalanceSimulationRow {
  blockedByGold: boolean;
  cumulativeSeconds: GameNumber;
  goldAfter: GameNumber;
  goldBefore: GameNumber;
  isBoss: boolean;
  monsterHealth: GameNumber;
  stage: number;
  stageReward: GameNumber;
  tapDps: GameNumber;
  teamPower: GameNumber;
  totalDps: GameNumber;
  totalUpgrades: number;
  ttkSeconds: GameNumber;
  upgradeSpend: GameNumber;
  upgradesPurchased: number;
}

export interface BalanceSimulationSummary {
  blockedStages: number;
  finalGold: GameNumber;
  finalHeroes: Array<{
    id: string;
    level: number;
    power: GameNumber;
  }>;
  finalTeamPower: GameNumber;
  totalSeconds: GameNumber;
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

export const BASELINE_BALANCE_SIMULATION: BalanceSimulationConfig = {
  checkpointStages: BASELINE_CHECKPOINT_STAGES,
  endStage: 10_000,
  heroes: [
    { id: 'common-a', name: 'Common A', power: 5, rarity: 'Common' },
    { id: 'common-b', name: 'Common B', power: 5, rarity: 'Common' },
    { id: 'rare', name: 'Rare', power: 10, rarity: 'Rare' },
    { id: 'epic', name: 'Epic', power: 20, rarity: 'Epic' },
    { id: 'legendary', name: 'Legendary', power: 50, rarity: 'Legendary' },
  ],
  id: 'baseline-five-summons',
  initialGold: GAME_BALANCE.initialGold,
  maxUpgradesPerStage: 50,
  normalTargetTtkSeconds: 10,
  bossTargetTtkSeconds: 30,
  sustainedComboMultiplier: 1,
  tapsPerSecond: 4,
};

export const FIVE_COMMON_BALANCE_SIMULATION: BalanceSimulationConfig = {
  ...BASELINE_BALANCE_SIMULATION,
  heroes: Array.from({ length: 5 }, (_, index) => ({
    id: `common-${index + 1}`,
    name: `Common ${index + 1}`,
    power: 5,
    rarity: 'Common' as const,
  })),
  id: 'five-common',
};

export const SOLO_COMMON_BALANCE_SIMULATION: BalanceSimulationConfig = {
  ...BASELINE_BALANCE_SIMULATION,
  heroes: [{ id: 'common', name: 'Common', power: 5, rarity: 'Common' }],
  id: 'solo-common',
};

export const DEFAULT_BALANCE_SIMULATION_SCENARIOS = [
  BASELINE_BALANCE_SIMULATION,
  FIVE_COMMON_BALANCE_SIMULATION,
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

const createSimulationHeroes = (seeds: readonly SimulationHeroSeed[]): Hero[] => {
  if (seeds.length === 0) {
    throw new RangeError('Balance simulation requires at least one hero');
  }

  return seeds.map(seed => ({
    id: seed.id,
    level: 1,
    name: seed.name,
    power: gameNumber(seed.power),
    rarity: seed.rarity,
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

  const heroes = createSimulationHeroes(config.heroes);
  let gold = gameNumber(config.initialGold);
  let cumulativeSeconds = ZERO_GAME_NUMBER;
  let totalUpgrades = 0;
  const rows: BalanceSimulationRow[] = [];

  for (let stage = 1; stage <= endStage; stage += 1) {
    const monsterHealth = getMonsterMaxHealth(stage);
    const goldBefore = gold;
    const targetTtk = isBossStage(stage) ? config.bossTargetTtkSeconds : config.normalTargetTtkSeconds;
    let projection = projectCombat(heroes, monsterHealth, config);
    let upgradesPurchased = 0;
    let upgradeSpend = ZERO_GAME_NUMBER;

    while (
      compareGameNumbers(projection.ttkSeconds, targetTtk) > 0 &&
      upgradesPurchased < maxUpgradesPerStage
    ) {
      const candidate = getBestUpgradeCandidate(heroes, gold);
      if (!candidate) {
        break;
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
      projection = projectCombat(heroes, monsterHealth, config);
    }

    const blockedByGold = compareGameNumbers(projection.ttkSeconds, targetTtk) > 0 &&
      getBestUpgradeCandidate(heroes, gold) === null;
    const stageReward = getStageReward(stage, monsterHealth, projection.tapDps, projection.totalDps);
    gold = addGameNumbers(gold, stageReward);
    cumulativeSeconds = addGameNumbers(cumulativeSeconds, projection.ttkSeconds);

    rows.push({
      blockedByGold,
      cumulativeSeconds,
      goldAfter: gold,
      goldBefore,
      isBoss: isBossStage(stage),
      monsterHealth,
      stage,
      stageReward,
      tapDps: projection.tapDps,
      teamPower: projection.teamPower,
      totalDps: projection.totalDps,
      totalUpgrades,
      ttkSeconds: projection.ttkSeconds,
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
      blockedStages: rows.filter(row => row.blockedByGold).length,
      finalGold: finalRow.goldAfter,
      finalHeroes: heroes
        .map(hero => ({ id: hero.id, level: hero.level, power: hero.power }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      finalTeamPower: finalRow.teamPower,
      totalSeconds: finalRow.cumulativeSeconds,
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
      'blocked_by_gold',
    ].join(','),
  ];

  for (const row of result.rows) {
    if (!selectedStages.has(row.stage)) {
      continue;
    }

    lines.push([
      row.stage,
      row.isBoss,
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
      row.blockedByGold,
    ].map(csvValue).join(','));
  }

  return `${lines.join('\n')}\n`;
};

export const renderBalanceScenarioSummaryCsv = (results: readonly BalanceSimulationResult[]) => {
  const lines = [[
    'scenario',
    'hero_count',
    'blocked_stages',
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
      config.heroes.length,
      summary.blockedStages,
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
    `Total upgrades: ${summary.totalUpgrades}`,
    `Worst normal TTK: ${formatGameNumber(summary.worstNormalTtkSeconds)}s at stage ${summary.worstNormalStage}`,
    `Worst boss TTK: ${formatGameNumber(summary.worstBossTtkSeconds)}s at stage ${summary.worstBossStage}`,
    `Final hero levels: ${summary.finalHeroes.map(hero => `${hero.id}=${hero.level}`).join(', ')}`,
    `Final team power: ${formatGameNumber(summary.finalTeamPower)}`,
    `Final gold: ${formatGameNumber(summary.finalGold)}`,
    `Total modeled combat time: ${formatGameNumber(summary.totalSeconds)}s`,
  ].join('\n');
};
