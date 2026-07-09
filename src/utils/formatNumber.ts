import { formatGameNumber, type GameNumber } from '../game/gameNumber';

export const formatNumber = (value: GameNumber | number) => formatGameNumber(value);
