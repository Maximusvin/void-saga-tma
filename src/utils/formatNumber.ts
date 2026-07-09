const NUMBER_SUFFIXES = [
  { value: 1e33, suffix: 'Dc' },
  { value: 1e30, suffix: 'No' },
  { value: 1e27, suffix: 'Oc' },
  { value: 1e24, suffix: 'Sp' },
  { value: 1e21, suffix: 'Sx' },
  { value: 1e18, suffix: 'Qi' },
  { value: 1e15, suffix: 'Qa' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
] as const;

export const formatNumber = (num: number) => {
  const safeNumber = Number.isFinite(num) ? num : 0;
  const sign = safeNumber < 0 ? '-' : '';
  const absNumber = Math.abs(safeNumber);

  const suffix = NUMBER_SUFFIXES.find((item) => absNumber >= item.value);
  if (suffix) {
    return `${sign}${(absNumber / suffix.value).toFixed(1)}${suffix.suffix}`;
  }

  return `${sign}${Math.floor(absNumber)}`;
};
