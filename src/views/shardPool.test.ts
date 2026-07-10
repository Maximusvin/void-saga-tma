import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createShardPool, type ShardContainer } from './shardPool';

interface FakeShard {
  id: number;
}

const createHarness = () => {
  const attached = new Set<FakeShard>();
  const destroyed: FakeShard[] = [];
  let nextId = 0;

  const container: ShardContainer<FakeShard> = {
    addChild: shard => attached.add(shard),
    removeChild: shard => attached.delete(shard),
  };

  const pool = createShardPool<FakeShard>(
    container,
    () => ({ id: nextId++ }),
    shard => destroyed.push(shard),
  );

  return { attached, destroyed, pool };
};

describe('shard pool', () => {
  it('reuses released shards instead of allocating new ones', () => {
    const { pool } = createHarness();

    const first = [pool.acquire(), pool.acquire(), pool.acquire()];
    assert.equal(pool.createdCount(), 3);

    for (const shard of first) {
      pool.release(shard);
    }

    // A whole second burst is served entirely from the free list.
    const second = [pool.acquire(), pool.acquire(), pool.acquire()];
    assert.equal(pool.createdCount(), 3);
    assert.deepEqual(new Set(second), new Set(first));

    // Exceeding the high-water mark is the only thing that allocates.
    pool.acquire();
    assert.equal(pool.createdCount(), 4);
  });

  it('keeps only live shards attached to the container', () => {
    const { attached, pool } = createHarness();

    const shard = pool.acquire();
    assert.ok(attached.has(shard));

    pool.release(shard);
    assert.equal(attached.has(shard), false);

    const reacquired = pool.acquire();
    assert.equal(reacquired, shard);
    assert.ok(attached.has(shard));
  });

  it('destroys parked shards but never the live ones', () => {
    const { destroyed, pool } = createHarness();

    const live = pool.acquire();
    const parked = pool.acquire();
    pool.release(parked);

    pool.destroy();

    assert.deepEqual(destroyed, [parked]);
    assert.equal(destroyed.includes(live), false);
    // The free list is emptied, so a later acquire allocates rather than
    // handing back an already-destroyed shard.
    pool.acquire();
    assert.equal(pool.createdCount(), 3);
  });
});
