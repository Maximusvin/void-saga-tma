import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  STAGE_BANDS,
  SUMMON_POOL,
  getStageBandForStage,
} from './content';
import {
  getBossAttemptDurationMs,
  getBossPhaseForHealthPercent,
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
    }
  });

  it('keeps stage bands ordered and boss rules playable', () => {
    assert.ok(STAGE_BANDS.length > 0);
    assert.equal(STAGE_BANDS[0].fromStage, 1);

    let previousFromStage = 0;
    for (const stageBand of STAGE_BANDS) {
      assert.ok(stageBand.fromStage > previousFromStage);
      assert.ok(stageBand.baseMonsterHealth > 0);
      assert.ok(stageBand.monsterHealthGrowth >= 1);
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
    assert.equal(isBossStage(4), false);
    assert.equal(isBossStage(5), true);
    assert.equal(getMonsterMaxHealth(1), '100');
    assert.equal(getMonsterMaxHealth(5), '1035');
    assert.equal(getBossAttemptDurationMs(5), 35_000);
    assert.equal(getBossPhaseForHealthPercent(5, 100).id, 'dominion');
    assert.equal(getBossPhaseForHealthPercent(5, 66).id, 'fracture');
    assert.equal(getBossPhaseForHealthPercent(5, 0).id, 'cataclysm');
  });

  it('keeps deterministic summon roll boundaries stable', () => {
    assert.equal(rollSummonTemplate(0).id, 'void-grunt');
    assert.equal(rollSummonTemplate(0.399999).id, 'void-grunt');
    assert.equal(rollSummonTemplate(0.4).id, 'void-mage');
    assert.equal(rollSummonTemplate(0.7).id, 'void-knight');
    assert.equal(rollSummonTemplate(0.9).id, 'void-lord');
    assert.equal(rollSummonTemplate(1).id, 'void-lord');
  });
});
