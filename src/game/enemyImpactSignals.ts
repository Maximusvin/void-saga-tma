export interface EnemyImpactSignal {
  id: number;
  normalizedX: number;
  normalizedY: number;
  source: 'passive' | 'tap';
}

export interface EnemyCritSignal {
  id: number;
  impactId: number;
}
