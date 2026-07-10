import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDefaultGameRenderProfile, selectGameRenderProfile } from './renderQuality';
import { getAngelShowcaseBudget, getAngelShowcaseFrame } from './angelShowcase';

describe('angel showcase budget', () => {
  it('selects smaller assets and bounded effects for low-end Telegram devices', () => {
    const profile = selectGameRenderProfile({
      userAgent: 'Telegram-Android/11.3.3 (Phone; Android 14; SDK 34; LOW)',
    });
    const budget = getAngelShowcaseBudget(profile, false);

    assert.equal(profile.quality, 'low');
    assert.deepEqual(budget, {
      maxFps: 30,
      particleCount: 5,
      useLowResolutionAssets: true,
    });
  });

  it('caps reduced motion independently from hardware quality', () => {
    const budget = getAngelShowcaseBudget(getDefaultGameRenderProfile(), true);

    assert.deepEqual(budget, {
      maxFps: 24,
      particleCount: 5,
      useLowResolutionAssets: false,
    });
  });
});

describe('angel showcase animation frame', () => {
  it('turns a surge into stronger wing, lift and core motion', () => {
    const idle = getAngelShowcaseFrame(2, 0, false);
    const surge = getAngelShowcaseFrame(2, 1, false);

    assert.ok(surge.bodyLift < idle.bodyLift);
    assert.ok(surge.coreScale > idle.coreScale);
    assert.ok(surge.wingRotation > idle.wingRotation);
    assert.ok(surge.wingScale > idle.wingScale);
    assert.ok(surge.particleSpeed > idle.particleSpeed);
  });

  it('keeps a reduced-motion idle deterministic and finite', () => {
    const frame = getAngelShowcaseFrame(10_000, 0, true);

    assert.equal(frame.bodyLift, 0);
    assert.equal(frame.chestExpansion, 0);
    assert.equal(frame.eyeOpenness, 1);
    assert.equal(frame.hairWind, 0);
    assert.equal(frame.headOffsetX, 0);
    assert.equal(frame.headOffsetY, 0);
    assert.equal(frame.headRotation, 0);
    assert.equal(frame.wingRotation, 0);
    assert.ok(Object.values(frame).every(Number.isFinite));
  });

  it('blinks quickly on an irregular idle timeline without freezing the face', () => {
    const beforeBlink = getAngelShowcaseFrame(1.5, 0, false);
    const closedBlink = getAngelShowcaseFrame(1.63, 0, false);
    const afterBlink = getAngelShowcaseFrame(1.9, 0, false);
    const doubleBlink = getAngelShowcaseFrame(14.63, 0, false);

    assert.equal(beforeBlink.eyeOpenness, 1);
    assert.equal(closedBlink.eyeOpenness, 0);
    assert.equal(afterBlink.eyeOpenness, 1);
    assert.ok(doubleBlink.eyeOpenness < 0.2);
  });

  it('keeps premium idle movement subtle and non-repeating across body layers', () => {
    const first = getAngelShowcaseFrame(3, 0, false);
    const second = getAngelShowcaseFrame(8, 0, false);

    assert.ok(Math.abs(first.headRotation) < 0.016);
    assert.ok(Math.abs(second.headRotation) < 0.016);
    assert.ok(Math.abs(first.headOffsetX) < 3);
    assert.ok(Math.abs(first.hairWind) < 1);
    assert.notEqual(first.headRotation, second.headRotation);
    assert.notEqual(first.hairWind, second.hairWind);
  });
});
