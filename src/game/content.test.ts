import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  STAGE_BANDS,
  SUMMON_POOL,
  getHeroTemplateById,
  getStageBandForStage,
} from './content';
import {
  getBossAttemptDurationMs,
  getBossPhaseForHealthPercent,
  getEncounterMaxHealth,
  getEnemiesInStage,
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

    const totalDropRate = SUMMON_POOL.reduce((total, hero) => total + hero.dropRate, 0);
    assert.ok(Math.abs(totalDropRate - 1) < RATE_TOTAL_EPSILON);

    for (const hero of SUMMON_POOL) {
      assert.ok(hero.id.length > 0);
      assert.ok(hero.name.length > 0);
      assert.ok(HERO_RARITIES.includes(hero.rarity));
      assert.ok(hero.power > 0);
      assert.ok(hero.dropRate > 0);
      assert.ok(hero.icon.length > 0);
      assert.match(hero.accentColor, /^#[0-9a-f]{6}$/i);
      assert.ok(hero.attackStyle.length > 0);
      assert.ok(hero.combatRole.length > 0);
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
      previousFromStage = stageBand.fromStage;
    }
  });

  it('resolves stages and boss health from content', () => {
    assert.equal(getStageBandForStage(1).id, 'rift-outskirts');
    assert.equal(getStageBandForStage(201).id, 'rift-depths');
    assert.equal(getStageBandForStage(1001).id, 'void-dominion');
    assert.equal(isBossStage(4), false);
    assert.equal(isBossStage(5), true);
    assert.equal(getEnemiesInStage(1), 3);
    assert.equal(getEnemiesInStage(201), 4);
    assert.equal(getEnemiesInStage(1001), 5);
    assert.equal(getMonsterMaxHealth(1), '100');
    assert.equal(getEncounterMaxHealth(1, 1), '115');
    assert.equal(getEncounterMaxHealth(1, 2), '132.25');
    assert.equal(getMonsterMaxHealth(5), '1656');
    assert.equal(getBossAttemptDurationMs(5), 45_000);
    assert.equal(getBossPhaseForHealthPercent(5, 100).id, 'dominion');
    assert.equal(getBossPhaseForHealthPercent(5, 66).id, 'fracture');
    assert.equal(getBossPhaseForHealthPercent(5, 0).id, 'cataclysm');
  });

  it('keeps deterministic summon roll boundaries stable', () => {
    assert.equal(rollSummonTemplate(0).id, 'void-grunt');
    assert.equal(rollSummonTemplate(0.599999).id, 'void-grunt');
    assert.equal(rollSummonTemplate(0.6).id, 'void-mage');
    assert.equal(rollSummonTemplate(0.88).id, 'void-knight');
    assert.equal(rollSummonTemplate(0.98).id, 'void-lord');
    assert.equal(rollSummonTemplate(1).id, 'void-lord');
    assert.equal(rollSummonTemplate(0, 'Legendary').id, 'void-lord');
  });
});
