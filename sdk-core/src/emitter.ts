type Listener<A extends unknown[]> = (...args: A) => void;

/** Minimal typed event emitter that works in browsers and React Native. */
export class Emitter<E extends Record<string, unknown[]>> {
  private readonly listeners: { [K in keyof E]?: Set<Listener<E[K]>> } = {};

  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    (this.listeners[event] ??= new Set()).add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof E>(event: K, listener: Listener<E[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  protected emit<K extends keyof E>(event: K, ...args: E[K]): void {
    for (const listener of this.listeners[event] ?? []) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`listener for "${String(event)}" threw`, error);
      }
    }
  }
}
