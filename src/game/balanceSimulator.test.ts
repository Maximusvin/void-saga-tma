import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  GAME_BALANCE,
  getBaseDuplicateShardReward,
  getAscensionShardCost,
  getDuplicateShardReward,
  getHeroCombatFocus,
  getHeroLevelCap,
  getHeroPassivePower,
  getHeroTapPower,
  getHeroUpgradeQuote,
  getNextHeroPower,
  getStageBandForStage,
  getUpgradeCost,
} from './balance';
import {
  ADVERSARIAL_RNG_BALANCE_SIMULATION,
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
    assert.equal(getUpgradeCost({ level: 1, rarity: 'Legendary' }), '700');
    assert.equal(getUpgradeCost({ level: 10, rarity: 'Common' }), '3844');
    assert.equal(getNextHeroPower({ power: gameNumber(5) }), '7.5');
    assert.equal(GAME_BALANCE.upgradeCostGrowth, GAME_BALANCE.upgradePowerMultiplier);
    assert.equal(getHeroLevelCap({ ascension: 0 }), 50);
    assert.equal(getHeroLevelCap({ ascension: 2 }), 150);
    assert.equal(getAscensionShardCost({ ascension: 99, rarity: 'Common' }), 3);
    assert.equal(getAscensionShardCost({ ascension: 99, rarity: 'Rare' }), 2);
    assert.equal(getAscensionShardCost({ ascension: 99, rarity: 'Legendary' }), 3);
    assert.equal(getDuplicateShardReward('Common'), 2);
    assert.equal(getDuplicateShardReward('Legendary'), 10);
    assert.equal(getBaseDuplicateShardReward('Common'), 1);
    assert.equal(getBaseDuplicateShardReward('Legendary'), 5);
  });

  it('quotes exact partial, capped, and bounded bulk upgrades', () => {
    const common = {
      ascension: 0,
      level: 1,
      power: gameNumber(5),
      rarity: 'Common' as const,
    };
    const tenLevels = getHeroUpgradeQuote(common, 20_000, 10);
    const partial = getHeroUpgradeQuote(common, 1_000, 10);
    const nearCap = getHeroUpgradeQuote({ ...common, level: 48 }, '1e30', 'max');
    const boundedMax = getHeroUpgradeQuote({ ...common, ascension: 1 }, '1e100', 'max');

    assert.deepEqual(tenLevels, {
      goldCost: '11330',
      level: 11,
      levelsGained: 10,
      power: '288.3251953125',
    });
    assert.equal(partial.levelsGained, 4);
    assert.equal(partial.goldCost, '812');
    assert.equal(partial.power, '25.3125');
    assert.equal(nearCap.levelsGained, 2);
    assert.equal(nearCap.level, 50);
    assert.equal(boundedMax.levelsGained, GAME_BALANCE.maxBulkUpgradeLevels);
    assert.equal(boundedMax.level, 51);
  });

  it('keeps late-game MAX quotes finite without converting through Number', () => {
    const quote = getHeroUpgradeQuote({
      ascension: 100,
      level: 4_000,
      power: gameNumber('1e700'),
      rarity: 'Legendary',
    }, '1e800', 'max');

    assert.equal(quote.levelsGained, GAME_BALANCE.maxBulkUpgradeLevels);
    assert.doesNotMatch(JSON.stringify(quote), /Infinity|NaN/);
  });

  it('gives specialist profiles equal four-tap output without flattening their play style', () => {
    const scavenger = {
      power: gameNumber(100),
      templateId: 'rift-scavenger',
    };
    const seraph = {
      power: gameNumber(100),
      templateId: 'seraph-aurelia',
    };

    assert.equal(getHeroTapPower(scavenger), '18');
    assert.equal(getHeroPassivePower(scavenger), '64.8');
    assert.equal(getHeroCombatFocus(scavenger), 'Tap');
    assert.equal(getHeroTapPower(seraph), '4.5');
    assert.equal(getHeroPassivePower(seraph), '124.2');
    assert.equal(getHeroCombatFocus(seraph), 'Idle');
    const expectedCritMultiplier = 1 +
      GAME_BALANCE.critChance * (GAME_BALANCE.critMultiplier - 1);
    assert.equal(
      Number(getHeroPassivePower(scavenger)) +
        Number(getHeroTapPower(scavenger)) * 4 * expectedCritMultiplier,
      Number(getHeroPassivePower(seraph)) +
        Number(getHeroTapPower(seraph)) * 4 * expectedCritMultiplier,
    );
  });
});

describe('balance simulation', () => {
  it('keeps the baseline within its TTK budget through stage 10,000', () => {
    assert.equal(baselineResult.rows.length, 10_000);
    assert.equal(baselineResult.summary.blockedStages, 0);
    assert.equal(baselineResult.summary.totalSummons, 400);
    assert.equal(baselineResult.summary.totalAscensions, 458);
    assert.equal(baselineResult.summary.totalUpgrades, 23_291);

    for (const row of baselineResult.rows) {
      const target = row.isBoss
        ? BASELINE_BALANCE_SIMULATION.bossTargetTtkSeconds
        : BASELINE_BALANCE_SIMULATION.normalTargetTtkSeconds * row.enemiesInStage;
      assert.ok(compareGameNumbers(row.ttkSeconds, target) <= 0, `stage ${row.stage} exceeded TTK target`);
      if (row.isBoss) {
        const attemptSeconds = getStageBandForStage(row.stage).boss.attemptSeconds;
        assert.ok(
          compareGameNumbers(row.ttkSeconds, attemptSeconds) <= 0,
          `boss stage ${row.stage} cannot be cleared before enrage`,
        );
      }
    }

    assert.ok(compareGameNumbers(baselineResult.rows[149].cumulativeSeconds, 5_400) >= 0);
    assert.ok(compareGameNumbers(baselineResult.rows[149].cumulativeSeconds, 5_800) <= 0);
    assert.ok(compareGameNumbers(baselineResult.summary.totalSeconds, 420_000) >= 0);
    assert.ok(compareGameNumbers(baselineResult.summary.totalSeconds, 450_000) <= 0);

    for (const hero of baselineResult.summary.finalHeroes) {
      assert.ok(hero.level <= hero.levelCap);
    }
  });

  it('is deterministic, recovers an unlucky start, and makes a solo roster non-optimal', () => {
    const repeatedBaseline = runBalanceSimulation();
    const unluckyResult = scenarioResults[1];
    const adversarialResult = scenarioResults[2];
    const soloResult = scenarioResults[3];

    assert.deepEqual(baselineResult.summary, repeatedBaseline.summary);
    assert.equal(unluckyResult.summary.blockedStages, 0);
    assert.equal(unluckyResult.summary.finalHeroes.length, 8);
    assert.equal(adversarialResult.config, ADVERSARIAL_RNG_BALANCE_SIMULATION);
    assert.equal(adversarialResult.summary.blockedStages, 0);
    assert.equal(adversarialResult.summary.pityTriggers, 5);
    assert.equal(
      adversarialResult.summary.maximumSummonPity,
      GAME_BALANCE.legendaryPityPulls - 1,
    );
    assert.deepEqual(
      adversarialResult.summary.finalHeroes.map(hero => hero.id),
      ['void-grunt', 'void-lord'],
    );
    assert.ok(soloResult.summary.progressionBlockedStages > 0);
    assert.equal(soloResult.rows.find(row => row.targetMissed)?.stage, 330);
    assert.ok(compareGameNumbers(
      soloResult.summary.totalSeconds,
      baselineResult.summary.totalSeconds,
    ) > 0);
  });

  it('rejects invalid adversarial RNG sequences instead of silently normalizing them', () => {
    assert.throws(
      () => runBalanceSimulation({
        ...ADVERSARIAL_RNG_BALANCE_SIMULATION,
        summonRollSequence: [{ rarity: 1, template: 0 }],
      }),
      /summonRollSequence values/,
    );
  });

  it('keeps committed balance tables synchronized with the simulator', () => {
    const baselineCsv = readFileSync(resolve('docs/balance/baseline-progression.csv'), 'utf8');
    const scenarioCsv = readFileSync(resolve('docs/balance/scenario-summary.csv'), 'utf8');

    assert.equal(baselineCsv, renderBalanceSimulationCsv(baselineResult));
    assert.equal(scenarioCsv, renderBalanceScenarioSummaryCsv(scenarioResults));
  });
});
