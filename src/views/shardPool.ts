/**
 * Every tap spawns ten to eighteen burst shards that used to be `new Graphics()`
 * and `.destroy()`d a third of a second later — up to ~180 GPU-backed objects
 * created and torn down per second while tapping, which is pure GC and geometry
 * churn on the exact frames that need to stay smooth.
 *
 * The pool hands the same objects back out instead. The caller bakes the shard
 * geometry once and recolours it per particle with `tint`, so a burst after
 * warm-up allocates nothing. This module stays free of any renderer dependency
 * so its reuse logic can be unit tested without a GPU.
 */

export interface ShardContainer<TShard> {
  addChild(shard: TShard): unknown;
  removeChild(shard: TShard): unknown;
}

export interface ShardPool<TShard> {
  /** Attach a shard to the container, reusing a released one when available. */
  acquire(): TShard;
  /** Detach a shard and return it to the free list without destroying it. */
  release(shard: TShard): void;
  /** Total shards ever created — stays flat once the pool is warm. */
  createdCount(): number;
  /** Destroy the shards still parked in the free list. */
  destroy(): void;
}

export const createShardPool = <TShard>(
  container: ShardContainer<TShard>,
  createShard: () => TShard,
  destroyShard: (shard: TShard) => void,
): ShardPool<TShard> => {
  const free: TShard[] = [];
  let created = 0;

  return {
    acquire() {
      const reused = free.pop();
      if (reused !== undefined) {
        container.addChild(reused);
        return reused;
      }

      created += 1;
      const fresh = createShard();
      container.addChild(fresh);
      return fresh;
    },
    release(shard) {
      container.removeChild(shard);
      free.push(shard);
    },
    createdCount: () => created,
    destroy() {
      for (const shard of free) {
        destroyShard(shard);
      }
      free.length = 0;
    },
  };
};
