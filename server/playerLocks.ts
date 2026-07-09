const playerQueues = new Map<string, Promise<unknown>>();

export const runPlayerMutation = async <TResult>(
  playerId: string,
  mutation: () => Promise<TResult> | TResult,
) => {
  const previousQueue = playerQueues.get(playerId) ?? Promise.resolve();

  const nextQueue = previousQueue
    .catch(() => undefined)
    .then(mutation);

  playerQueues.set(playerId, nextQueue);

  try {
    return await nextQueue;
  } finally {
    if (playerQueues.get(playerId) === nextQueue) {
      playerQueues.delete(playerId);
    }
  }
};
