/**
 * Serializes knowledge write requests per repository connection.
 *
 * Every create/adopt operation for the same connection must run after the
 * previous one settles, including failures. The tail promise never rejects so a
 * failed operation cannot poison the next request on the same connection.
 */
export class KnowledgeWriteQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue<T>(connectionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(connectionId) ?? Promise.resolve();
    const operation = previous.then(task, task);
    const tail = operation.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(connectionId, tail);
    void tail.then(() => {
      if (this.tails.get(connectionId) === tail) {
        this.tails.delete(connectionId);
      }
    });
    return operation;
  }
}
