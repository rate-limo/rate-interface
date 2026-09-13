/**
 * Collects items arriving one-per-socket-frame and hands them to `flush` in a
 * single batch on the next animation frame.
 *
 * Why this exists: the account stream delivers one event per WebSocket message,
 * and each one used to run its own `queryClient.setQueryData` + four `setState`
 * calls straight out of the socket handler. Socket messages arrive in separate
 * task ticks, so React gave each one its own render pass — a market order that
 * swept twenty levels produced twenty renders of the orders table. Emitting the
 * whole batch inside one callback lets React's automatic batching collapse them
 * into a single render, without changing the eventBus contract that six
 * handlers across three hooks depend on.
 *
 * `schedule` is injectable so tests can drive the flush synchronously;
 * `requestAnimationFrame` is unavailable during SSR and in the vitest
 * environment, hence the setTimeout fallback rather than a bare reference.
 *
 * Two things bound the queue, because a socket does not stop delivering just
 * because nothing is draining:
 *
 *  - **A hidden tab pauses `requestAnimationFrame` entirely.** The fallback below
 *    only covers rAF being *undefined*, not being *paused*, so a backgrounded tab
 *    on a busy market queued frames for the whole hidden duration and flushed the
 *    lot in one synchronous callback on return. `defaultSchedule` now races rAF
 *    against a timer: browsers clamp `setTimeout` in a hidden tab (to ~1 s) but do
 *    not stop it, so the queue keeps draining while the tab is away.
 *  - **`maxQueue` is the hard bound.** Whatever the scheduler does, a queue that
 *    reaches it flushes synchronously. That caps memory rather than trusting any
 *    timer to keep up with a burst.
 */

export type Schedule = (run: () => void) => () => void;

export interface FrameBufferOptions {
  /**
   * Force a synchronous flush once this many items are queued.
   *
   * Sized well above a legitimate burst -- `maxMatches` is 20 by default and
   * `setMaxMatches` has no upper bound, so a few hundred leaves generous room --
   * and low enough that an undrained queue cannot grow without limit. Reaching it
   * is not an error; it is the backstop doing its job.
   */
  maxQueue?: number;
}

export interface FrameBuffer<T> {
  /** Queue an item. Schedules a flush if one is not already pending. */
  push: (item: T) => void;
  /** Flush immediately, cancelling any pending scheduled flush. */
  flushNow: () => void;
  /** Drop everything queued and cancel the pending flush. */
  cancel: () => void;
  /** Number of items currently queued. Exposed for tests and diagnostics. */
  readonly pending: number;
}

/**
 * How long to wait before draining without a frame. Only ever reached when rAF
 * does not fire -- in a visible tab the frame wins this race every time and the
 * timer is cancelled unused.
 */
const UNFRAMED_FLUSH_MS = 250;

const DEFAULT_MAX_QUEUE = 500;

const defaultSchedule: Schedule = (run) => {
  if (typeof requestAnimationFrame === "function") {
    // Whichever fires first wins; `done` keeps the loser from flushing twice.
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      run();
    };
    const frame = requestAnimationFrame(fire);
    const timer = setTimeout(fire, UNFRAMED_FLUSH_MS);
    return () => {
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }
  const id = setTimeout(run, 0);
  return () => clearTimeout(id);
};

export function createFrameBuffer<T>(
  flush: (items: T[]) => void,
  schedule: Schedule = defaultSchedule,
  options?: FrameBufferOptions,
): FrameBuffer<T> {
  const maxQueue = options?.maxQueue ?? DEFAULT_MAX_QUEUE;
  let queue: T[] = [];
  let cancelScheduled: (() => void) | null = null;

  const run = () => {
    cancelScheduled = null;
    if (queue.length === 0) return;
    // Swap before flushing: a handler that pushes during flush (an event
    // triggering another event) must land in the NEXT batch, not mutate the
    // array being iterated.
    const batch = queue;
    queue = [];
    flush(batch);
  };

  return {
    push(item: T) {
      queue.push(item);
      // Checked before scheduling: at the cap the batch goes out now, so there is
      // nothing left to schedule for. `run` swaps the queue before flushing, so a
      // handler that pushes from inside this flush lands in the next batch and
      // cannot recurse back through the cap.
      if (queue.length >= maxQueue) {
        cancelScheduled?.();
        cancelScheduled = null;
        run();
        return;
      }
      if (!cancelScheduled) cancelScheduled = schedule(run);
    },
    flushNow() {
      cancelScheduled?.();
      run();
    },
    cancel() {
      cancelScheduled?.();
      cancelScheduled = null;
      queue = [];
    },
    get pending() {
      return queue.length;
    },
  };
}
