import Decimal from 'decimal.js-light';

declare const gameNumberBrand: unique symbol;

export type GameNumber = string & { readonly [gameNumberBrand]: true };
export type GameNumberInput = GameNumber | number | string;

export const GAME_NUMBER_PRECISION = 24;
const GAME_NUMBER_CALCULATION_PRECISION = GAME_NUMBER_PRECISION + 8;
const LEGACY_NUMBER_PRECISION = 15;

const GameDecimal = Decimal.clone({
  precision: GAME_NUMBER_CALCULATION_PRECISION,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 21,
});

const toDecimal = (value: GameNumberInput) => new GameDecimal(value);

const toCanonicalString = (value: Decimal) => {
  if (value.isNegative()) {
    throw new RangeError('Game numbers must be finite and non-negative');
  }

  return value.toSignificantDigits(GAME_NUMBER_PRECISION).toString() as GameNumber;
};

export const gameNumber = (value: GameNumberInput): GameNumber => {
  return toCanonicalString(toDecimal(value));
};

export const ZERO_GAME_NUMBER = gameNumber(0);
export const ONE_GAME_NUMBER = gameNumber(1);

export const tryParseGameNumber = (value: unknown): GameNumber | null => {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') {
    return null;
  }

  try {
    return gameNumber(typeof value === 'number' ? value.toPrecision(LEGACY_NUMBER_PRECISION) : value);
  } catch {
    return null;
  }
};

export const parseGameNumber = (value: unknown, fallback = ZERO_GAME_NUMBER): GameNumber => {
  return tryParseGameNumber(value) ?? fallback;
};

export const addGameNumbers = (...values: readonly GameNumberInput[]): GameNumber => {
  return toCanonicalString(values.reduce<Decimal>((total, value) => total.plus(value), new GameDecimal(0)));
};

export const subtractGameNumbers = (left: GameNumberInput, right: GameNumberInput): GameNumber => {
  const result = toDecimal(left).minus(right);
  return toCanonicalString(result.isNegative() ? new GameDecimal(0) : result);
};

export const multiplyGameNumbers = (...values: readonly GameNumberInput[]): GameNumber => {
  return toCanonicalString(values.reduce<Decimal>((total, value) => total.times(value), new GameDecimal(1)));
};

export const divideGameNumbers = (dividend: GameNumberInput, divisor: GameNumberInput): GameNumber => {
  if (compareGameNumbers(divisor, 0) === 0) {
    throw new RangeError('Game number divisor must be positive');
  }

  return toCanonicalString(toDecimal(dividend).div(divisor));
};

export const powGameNumber = (base: GameNumberInput, exponent: number): GameNumber => {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError('Game number exponents must be non-negative safe integers');
  }

  return toCanonicalString(toDecimal(base).pow(exponent));
};

export const floorGameNumber = (value: GameNumberInput): GameNumber => {
  return toCanonicalString(toDecimal(value).toDecimalPlaces(0, Decimal.ROUND_FLOOR));
};

export const ceilGameNumber = (value: GameNumberInput): GameNumber => {
  return toCanonicalString(toDecimal(value).toDecimalPlaces(0, Decimal.ROUND_CEIL));
};

export const compareGameNumbers = (left: GameNumberInput, right: GameNumberInput) => {
  return toDecimal(left).comparedTo(right);
};

export const isPositiveGameNumber = (value: GameNumberInput) => compareGameNumbers(value, 0) > 0;

export const minGameNumbers = (left: GameNumberInput, right: GameNumberInput): GameNumber => {
  return compareGameNumbers(left, right) <= 0 ? gameNumber(left) : gameNumber(right);
};

export const gameNumberToClampedNumber = (value: GameNumberInput, maximum: number) => {
  if (!Number.isFinite(maximum) || maximum < 0) {
    throw new RangeError('Game number clamp must be finite and non-negative');
  }

  const decimal = toDecimal(value);
  return (decimal.greaterThan(maximum) ? new GameDecimal(maximum) : decimal).toNumber();
};

export const gameNumberToPercent = (value: GameNumberInput, maximum: GameNumberInput) => {
  const maximumDecimal = toDecimal(maximum);
  if (!maximumDecimal.isPositive()) {
    return 0;
  }

  const percentage = toDecimal(value).div(maximumDecimal).times(100);
  if (percentage.isNegative()) {
    return 0;
  }

  return (percentage.greaterThan(100) ? new GameDecimal(100) : percentage).toNumber();
};

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'] as const;

const trimDecimalZeros = (value: string) => value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

export const formatGameNumber = (value: GameNumberInput) => {
  const decimal = toDecimal(value);
  if (decimal.isNegative()) {
    return '0';
  }
  if (decimal.isZero()) {
    return '0';
  }
  if (decimal.lessThan(1000)) {
    const decimalPlaces = decimal.lessThan(10) && !decimal.isInteger() ? 1 : 0;
    return trimDecimalZeros(decimal.toDecimalPlaces(decimalPlaces).toFixed(decimalPlaces));
  }

  const suffixIndex = Math.floor(decimal.exponent() / 3);
  if (suffixIndex < SUFFIXES.length) {
    const scaled = decimal.div(new GameDecimal(1000).pow(suffixIndex));
    return `${scaled.toDecimalPlaces(1).toFixed(1)}${SUFFIXES[suffixIndex]}`;
  }

  return decimal.toExponential(2).replace('e+', 'e');
};
