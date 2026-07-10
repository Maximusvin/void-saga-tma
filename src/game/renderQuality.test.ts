import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTelegramAndroidPerformanceClass,
  selectGameRenderProfile,
} from './renderQuality';

const telegramUserAgent = (performanceClass: 'LOW' | 'AVERAGE' | 'HIGH') => (
  `Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Mobile `
  + `Telegram-Android/11.3.3 (Google Pixel 6a; Android 14; SDK 34; ${performanceClass})`
);

describe('game render quality', () => {
  it('parses Telegram Android performance classes', () => {
    assert.equal(getTelegramAndroidPerformanceClass(telegramUserAgent('LOW')), 'LOW');
    assert.equal(getTelegramAndroidPerformanceClass(telegramUserAgent('AVERAGE')), 'AVERAGE');
    assert.equal(getTelegramAndroidPerformanceClass(telegramUserAgent('HIGH')), 'HIGH');
    assert.equal(getTelegramAndroidPerformanceClass('Mozilla/5.0 iPhone'), undefined);
  });

  it('uses the Telegram class before generic browser hardware hints', () => {
    const lowProfile = selectGameRenderProfile({
      deviceMemory: 8,
      hardwareConcurrency: 8,
      userAgent: telegramUserAgent('LOW'),
    });
    const highProfile = selectGameRenderProfile({
      deviceMemory: 2,
      hardwareConcurrency: 2,
      userAgent: telegramUserAgent('HIGH'),
    });

    assert.equal(lowProfile.quality, 'low');
    assert.equal(lowProfile.maxFps, 30);
    assert.equal(highProfile.quality, 'high');
    assert.equal(highProfile.maxFps, 60);
  });

  it('falls back conservatively when Telegram hardware data is unavailable', () => {
    assert.equal(selectGameRenderProfile({ userAgent: '', hardwareConcurrency: 2 }).quality, 'low');
    const balancedProfile = selectGameRenderProfile({ userAgent: '', deviceMemory: 4 });
    assert.equal(balancedProfile.quality, 'balanced');
    assert.equal(balancedProfile.maxFps, 45);
    assert.equal(selectGameRenderProfile({ userAgent: '', deviceMemory: 8, hardwareConcurrency: 8 }).quality, 'high');
  });
});
