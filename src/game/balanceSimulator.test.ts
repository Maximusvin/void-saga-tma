import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  GAME_BALANCE,
  getAscensionShardCost,
  getDuplicateShardReward,
  getHeroLevelCap,
  getNextHeroPower,
  getUpgradeCost,
} from './balance';
import {
  BASELINE_BALANCE_SIMULATION,
  DEFAULT_BALANCE_SIMULATION_SCENARIOS,
  renderBalanceScenarioSummaryCsv,
  renderBalanceSimulationCsv,
  runBalanceSimulation,
} from './balanceSimulator';
import { compareGameNumbers, gameNumber } from './gameNumber';

const scenarioResults = DEFAULT_BALANCE_SIMULATION_SCENARIOS.map(runBalanceSimulation);
const baselineResult = scenarioResults[0];

describe('balance formulas', () => {
  it('scales upgrade cost by level and rarity without truncating hero power', () => {
    assert.equal(getUpgradeCost({ level: 1, rarity: 'Common' }), '100');
    assert.equal(getUpgradeCost({ level: 1, rarity: 'Legendary' }), '1000');
    assert.equal(getUpgradeCost({ level: 10, rarity: 'Common' }), '3844');
    assert.equal(getNextHeroPower({ power: gameNumber(5) }), '7.5');
    assert.equal(GAME_BALANCE.upgradeCostGrowth, GAME_BALANCE.upgradePowerMultiplier);
    assert.equal(getHeroLevelCap({ ascension: 0 }), 50);
    assert.equal(getHeroLevelCap({ ascension: 2 }), 150);
    assert.equal(getAscensionShardCost({ ascension: 99 }), 2);
    assert.equal(getDuplicateShardReward('Common'), 1);
    assert.equal(getDuplicateShardReward('Legendary'), 5);
  });
});

describe('balance simulation', () => {
  it('keeps the baseline within its TTK budget through stage 10,000', () => {
    assert.equal(baselineResult.rows.length, 10_000);
    assert.equal(baselineResult.summary.blockedStages, 0);
    assert.equal(baselineResult.summary.totalSummons, 400);
    assert.equal(baselineResult.summary.totalAscensions, 345);
    assert.equal(baselineResult.summary.totalUpgrades, 17_442);

    for (const row of baselineResult.rows) {
      const target = row.isBoss
        ? BASELINE_BALANCE_SIMULATION.bossTargetTtkSeconds
        : BASELINE_BALANCE_SIMULATION.normalTargetTtkSeconds;
      assert.ok(compareGameNumbers(row.ttkSeconds, target) <= 0, `stage ${row.stage} exceeded TTK target`);
    }

    for (const hero of baselineResult.summary.finalHeroes) {
      assert.ok(hero.level <= hero.levelCap);
    }
  });

  it('is deterministic, recovers an unlucky start, and makes a solo roster non-optimal', () => {
    const repeatedBaseline = runBalanceSimulation();
    const unluckyResult = scenarioResults[1];
    const soloResult = scenarioResults[2];

    assert.deepEqual(baselineResult.summary, repeatedBaseline.summary);
    assert.equal(unluckyResult.summary.blockedStages, 0);
    assert.equal(unluckyResult.summary.finalHeroes.length, 4);
    assert.ok(soloResult.summary.progressionBlockedStages > 0);
    assert.equal(soloResult.rows.find(row => row.targetMissed)?.stage, 2_110);
    assert.ok(compareGameNumbers(
      soloResult.summary.totalSeconds,
      baselineResult.summary.totalSeconds,
    ) > 0);
  });

  it('keeps committed balance tables synchronized with the simulator', () => {
    const baselineCsv = readFileSync(resolve('docs/balance/baseline-progression.csv'), 'utf8');
    const scenarioCsv = readFileSync(resolve('docs/balance/scenario-summary.csv'), 'utf8');

    assert.equal(baselineCsv, renderBalanceSimulationCsv(baselineResult));
    assert.equal(scenarioCsv, renderBalanceScenarioSummaryCsv(scenarioResults));
  });
});
