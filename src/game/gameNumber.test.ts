import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMonsterMaxHealth } from './balance';
import {
  addGameNumbers,
  compareGameNumbers,
  formatGameNumber,
  gameNumber,
  multiplyGameNumbers,
  parseGameNumber,
} from './gameNumber';

describe('game number arithmetic', () => {
  it('avoids binary floating-point drift in economy operations', () => {
    assert.equal(addGameNumbers(0.1, 0.2), '0.3');
    assert.equal(addGameNumbers('1002.5', '0.1'), '1002.6');
    assert.equal(multiplyGameNumbers('1e800', '1e200'), '1e+1000');
  });

  it('keeps stage 10,000 health finite and deterministic', () => {
    const health = getMonsterMaxHealth(10_000);

    assert.equal(health, '2.70551056716679295639618e+794');
    assert.equal(compareGameNumbers(health, '1e794') > 0, true);
    assert.doesNotMatch(JSON.stringify({ health }), /Infinity|NaN/);
  });

  it('normalizes legacy numbers and rejects invalid serialized values', () => {
    assert.equal(parseGameNumber(1002.5999999999999), '1002.6');
    assert.equal(parseGameNumber(Number.POSITIVE_INFINITY, gameNumber(7)), '7');
    assert.equal(parseGameNumber('NaN', gameNumber(8)), '8');
    assert.equal(parseGameNumber('-5', gameNumber(9)), '9');
  });
});

describe('game number formatting', () => {
  it('formats compact and scientific values without converting them to Number', () => {
    assert.equal(formatGameNumber('999.4'), '999');
    assert.equal(formatGameNumber('1234'), '1.2K');
    assert.equal(formatGameNumber('9.876e33'), '9.9Dc');
    assert.equal(formatGameNumber('1.2345e794'), '1.23e794');
  });
});
