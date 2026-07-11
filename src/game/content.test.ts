import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  ENEMY_TRAITS,
  HERO_RARITIES,
  STAGE_BANDS,
  SUMMON_POOL,
  SUMMON_RARITY_RATES,
  getHeroTemplateById,
  getStageBandForStage,
} from './content';
import {
  GAME_BALANCE,
  getBossAttemptDurationMs,
  getBossPhaseForHealthPercent,
  getEncounterCombatRule,
  getEncounterMaxHealth,
  getEnemyTraitForEncounter,
  getEnemiesInStage,
  getSummonRarityRates,
  getMonsterMaxHealth,
  isBossStage,
  rollSummonTemplate,
} from './balance';

const RATE_TOTAL_EPSILON = 0.000001;

describe('game content invariants', () => {
  it('has a stable content version', () => {
    assert.equal(GAME_CONTENT.version, GAME_CONTENT_VERSION);
    assert.match(GAME_CONTENT.version, /^void-saga-content-\d{3}$/);
  });

  it('keeps summon pool ids unique and drop rates normalized', () => {
    const ids = new Set(SUMMON_POOL.map(hero => hero.id));
    assert.equal(ids.size, SUMMON_POOL.length);

    const totalRarityRate = Object.values(SUMMON_RARITY_RATES)
      .reduce((total, rate) => total + rate, 0);
    assert.ok(Math.abs(totalRarityRate - 1) < RATE_TOTAL_EPSILON);
    assert.equal(SUMMON_RARITY_RATES.Legendary, 0.008);
    assert.deepEqual(GAME_CONTENT.enemyTraits, ENEMY_TRAITS);

    for (const rarity of HERO_RARITIES) {
      const rarityTemplates = SUMMON_POOL.filter(hero => hero.rarity === rarity);
      assert.equal(
        rarityTemplates.length,
        2,
        `${rarity} must have two live templates`,
      );
      assert.equal(
        new Set(rarityTemplates.map(hero => hero.summonWeight)).size,
        1,
        `${rarity} standard templates must keep equal weights for pool-scaled shards`,
      );
    }

    for (const hero of SUMMON_POOL) {
      assert.ok(hero.id.length > 0);
      assert.ok(hero.name.length > 0);
      assert.ok(HERO_RARITIES.includes(hero.rarity));
      assert.ok(hero.power > 0);
      assert.ok(hero.summonWeight > 0);
      assert.ok(hero.icon.length > 0);
      assert.match(hero.accentColor, /^#[0-9a-f]{6}$/i);
      assert.ok(hero.attackStyle.length > 0);
      assert.ok(hero.combatRole.length > 0);
      assert.ok(hero.combatProfile.passivePowerMultiplier > 0);
      assert.ok(hero.combatProfile.tapPowerMultiplier > 0);
      const expectedCritMultiplier = 1 +
        GAME_BALANCE.critChance * (GAME_BALANCE.critMultiplier - 1);
      const fourTapPowerFactor = hero.combatProfile.passivePowerMultiplier +
        hero.combatProfile.tapPowerMultiplier * GAME_BALANCE.clickHeroPowerMultiplier *
        4 * expectedCritMultiplier;
      assert.ok(Math.abs(fourTapPowerFactor - 1.44) < RATE_TOTAL_EPSILON);
      assert.match(hero.portrait, /^\/assets\/heroes\/[a-z-]+\.webp$/);
      assert.ok(['still', 'aura', 'embers', 'mythic'].includes(hero.portraitMotion));
      if (hero.showcase) {
        assert.match(hero.showcase.id, /^[a-z0-9-]+$/);
        assert.match(hero.showcase.bodyAsset, /^\/assets\/heroes\/showcase\/[a-z-]+\.webp$/);
        assert.match(hero.showcase.bodyAssetLow, /^\/assets\/heroes\/showcase\/[a-z-]+-low\.webp$/);
        assert.match(hero.showcase.leftWingAsset, /^\/assets\/heroes\/showcase\/[a-z-]+\.webp$/);
        assert.match(hero.showcase.leftWingAssetLow, /^\/assets\/heroes\/showcase\/[a-z-]+-low\.webp$/);
        assert.match(hero.showcase.rightWingAsset, /^\/assets\/heroes\/showcase\/[a-z-]+\.webp$/);
        assert.match(hero.showcase.rightWingAssetLow, /^\/assets\/heroes\/showcase\/[a-z-]+-low\.webp$/);
      }
    }

    assert.equal(new Set(SUMMON_POOL.map(hero => hero.accentColor)).size, SUMMON_POOL.length);
    assert.equal(getHeroTemplateById('void-lord')?.attackStyle, 'nova');
    assert.equal(SUMMON_POOL.filter(hero => hero.showcase).length, 1);
    assert.equal(getHeroTemplateById('unknown'), null);
  });

  it('keeps stage bands ordered and boss rules playable', () => {
    assert.ok(STAGE_BANDS.length > 0);
    assert.equal(STAGE_BANDS[0].fromStage, 1);

    let previousFromStage = 0;
    for (const stageBand of STAGE_BANDS) {
      assert.ok(stageBand.fromStage > previousFromStage);
      assert.ok(stageBand.baseMonsterHealth > 0);
      assert.ok(stageBand.monsterHealthGrowth >= 1);
      assert.ok(stageBand.normalEnemiesPerStage >= 2);
      assert.ok(stageBand.normalEnemyHealthGrowth >= 1);
      assert.ok(stageBand.normalEnemyTraitIds.length > 0);
      assert.ok(stageBand.normalEnemyTraitIds.every(traitId => (
        ENEMY_TRAITS.some(trait => trait.id === traitId)
      )));
      assert.ok(stageBand.monsterEmojis.length > 0);
      assert.ok(stageBand.boss.everyStages > 1);
      assert.ok(stageBand.boss.attemptSeconds >= 30);
      assert.ok(stageBand.boss.healthMultiplier > 1);
      assert.ok(stageBand.boss.goldMultiplier >= 1);
      assert.ok(stageBand.boss.gemReward >= 0);
      assert.ok(stageBand.boss.emoji.length > 0);
      assert.ok(stageBand.boss.phases.length >= 2);
      assert.equal(stageBand.boss.phases.at(-1)?.minimumHealthPercent, 0);
      for (let index = 1; index < stageBand.boss.phases.length; index += 1) {
        assert.ok(
          stageBand.boss.phases[index - 1].minimumHealthPercent >
          stageBand.boss.phases[index].minimumHealthPercent,
        );
      }
      for (const phase of stageBand.boss.phases) {
        assert.ok(phase.hint.length > 0);
        assert.ok(phase.tapDamageMultiplier > 0);
        assert.ok(phase.passiveDamageMultiplier > 0);
      }
      previousFromStage = stageBand.fromStage;
    }
  });

  it('cycles readable enemy traits and resolves boss vulnerabilities from health', () => {
    assert.equal(new Set(ENEMY_TRAITS.map(trait => trait.id)).size, ENEMY_TRAITS.length);
    assert.equal(
      ENEMY_TRAITS.reduce((total, trait) => total + trait.tapDamageMultiplier, 0) / ENEMY_TRAITS.length,
      1,
    );
    assert.equal(
      ENEMY_TRAITS.reduce((total, trait) => total + trait.passiveDamageMultiplier, 0) / ENEMY_TRAITS.length,
      1,
    );
    assert.equal(getEnemyTraitForEncounter(1, 0).id, 'unbound');
    assert.equal(getEnemyTraitForEncounter(7, 0).id, 'carapace');
    assert.equal(getEnemyTraitForEncounter(7, 1).id, 'phaseborn');
    assert.equal(getEnemyTraitForEncounter(7, 2).id, 'unbound');
    assert.equal(getEncounterCombatRule(5, 0, 100).id, 'dominion');
    assert.equal(getEncounterCombatRule(5, 0, 60).id, 'fracture');
    assert.equal(getEncounterCombatRule(5, 0, 20).id, 'cataclysm');
  });

  it('resolves stages and boss health from content', () => {
    assert.equal(getStageBandForStage(1).id, 'rift-outskirts');
    assert.equal(getStageBandForStage(201).id, 'rift-depths');
    assert.equal(getStageBandForStage(1001).id, 'void-dominion');
    assert.equal(isBossStage(4), false);
    assert.equal(isBossStage(5), true);
    assert.equal(getEnemiesInStage(1), 4);
    assert.equal(getEnemiesInStage(201), 5);
    assert.equal(getEnemiesInStage(1001), 6);
    assert.equal(getMonsterMaxHealth(1), '100');
    assert.equal(getEncounterMaxHealth(1, 1), '118');
    assert.equal(getEncounterMaxHealth(1, 2), '139.24');
    assert.equal(getEncounterMaxHealth(1, 3), '164.3032');
    assert.equal(getMonsterMaxHealth(5), '2070');
    assert.equal(getBossAttemptDurationMs(5), 60_000);
    assert.equal(getBossPhaseForHealthPercent(5, 100).id, 'dominion');
    assert.equal(getBossPhaseForHealthPercent(5, 66).id, 'fracture');
    assert.equal(getBossPhaseForHealthPercent(5, 0).id, 'cataclysm');
  });

  it('keeps deterministic summon roll boundaries stable', () => {
    assert.equal(rollSummonTemplate(0, 0).id, 'void-grunt');
    assert.equal(rollSummonTemplate(0.649999, 0.999999).id, 'rift-scavenger');
    assert.equal(rollSummonTemplate(0.65, 0).id, 'void-mage');
    assert.equal(rollSummonTemplate(0.911999, 0.999999).id, 'storm-ranger');
    assert.equal(rollSummonTemplate(0.912, 0).id, 'void-knight');
    assert.equal(rollSummonTemplate(0.991999, 0.999999).id, 'ember-oracle');
    assert.equal(rollSummonTemplate(0.992, 0).id, 'void-lord');
    assert.equal(rollSummonTemplate(1, 0.999999).id, 'seraph-aurelia');
    assert.equal(rollSummonTemplate(0, 0, 0, 'Legendary').id, 'void-lord');
    assert.equal(rollSummonTemplate(0, 1, 0, 'Legendary').id, 'seraph-aurelia');
  });

  it('raises only the Legendary chance during soft pity and guarantees pull 80', () => {
    const baseRates = getSummonRarityRates(0);
    const softPityRates = getSummonRarityRates(60);
    const hardPityRates = getSummonRarityRates(79);

    assert.deepEqual(baseRates, SUMMON_RARITY_RATES);
    assert.equal(softPityRates.Legendary, 0.038);
    assert.ok(softPityRates.Common < baseRates.Common);
    assert.ok(Math.abs(Object.values(softPityRates).reduce((sum, rate) => sum + rate, 0) - 1) < RATE_TOTAL_EPSILON);
    assert.deepEqual(hardPityRates, { Common: 0, Rare: 0, Epic: 0, Legendary: 1 });
    assert.equal(rollSummonTemplate(0.97, 0, 60).rarity, 'Legendary');
  });
});
