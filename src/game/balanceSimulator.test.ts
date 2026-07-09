import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { GAME_BALANCE, getNextHeroPower, getUpgradeCost } from './balance';
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
  });
});

describe('balance simulation', () => {
  it('keeps the baseline within its TTK budget through stage 10,000', () => {
    assert.equal(baselineResult.rows.length, 10_000);
    assert.equal(baselineResult.summary.blockedStages, 0);
    assert.equal(baselineResult.summary.totalUpgrades, 22_457);

    for (const row of baselineResult.rows) {
      const target = row.isBoss
        ? BASELINE_BALANCE_SIMULATION.bossTargetTtkSeconds
        : BASELINE_BALANCE_SIMULATION.normalTargetTtkSeconds;
      assert.ok(compareGameNumbers(row.ttkSeconds, target) <= 0, `stage ${row.stage} exceeded TTK target`);
    }

    const levels = baselineResult.summary.finalHeroes.map(hero => hero.level);
    assert.ok(Math.max(...levels) - Math.min(...levels) <= 1);
  });

  it('is deterministic and exposes the current solo-roster progression gap', () => {
    const repeatedBaseline = runBalanceSimulation();

    assert.deepEqual(baselineResult.summary, repeatedBaseline.summary);
    assert.equal(scenarioResults.every(result => result.summary.blockedStages === 0), true);
    assert.ok(compareGameNumbers(
      scenarioResults[2].summary.totalSeconds,
      baselineResult.summary.totalSeconds,
    ) < 0);
  });

  it('keeps committed balance tables synchronized with the simulator', () => {
    const baselineCsv = readFileSync(resolve('docs/balance/baseline-progression.csv'), 'utf8');
    const scenarioCsv = readFileSync(resolve('docs/balance/scenario-summary.csv'), 'utf8');

    assert.equal(baselineCsv, renderBalanceSimulationCsv(baselineResult));
    assert.equal(scenarioCsv, renderBalanceScenarioSummaryCsv(scenarioResults));
  });
});
