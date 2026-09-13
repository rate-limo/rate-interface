import { describe, expect, it, vi } from "vitest";
import { createFrameBuffer, type Schedule } from "./frameBuffer";

/** A schedule the test drives by hand, standing in for requestAnimationFrame. */
function manualSchedule() {
  let queued: (() => void) | null = null;
  const schedule: Schedule = (run) => {
    queued = run;
    return () => {
      queued = null;
    };
  };
  return {
    schedule,
    tick() {
      const run = queued;
      queued = null;
      run?.();
    },
    get scheduled() {
      return queued !== null;
    },
  };
}

describe("createFrameBuffer", () => {
  it("delivers a burst as one batch, not one call per item", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(flush, frame.schedule);

    for (let i = 0; i < 20; i++) buffer.push(i);
    expect(flush).not.toHaveBeenCalled();

    frame.tick();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toHaveLength(20);
  });

  it("schedules once per batch rather than once per push", () => {
    const schedule = vi.fn<Schedule>(() => () => {});
    const buffer = createFrameBuffer<number>(() => {}, schedule);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);

    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("preserves arrival order", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<string>(flush, frame.schedule);

    buffer.push("a");
    buffer.push("b");
    buffer.push("c");
    frame.tick();

    expect(flush.mock.calls[0][0]).toEqual(["a", "b", "c"]);
  });

  it("puts items pushed during a flush into the next batch, not the current one", () => {
    const frame = manualSchedule();
    const seen: number[][] = [];
    let reentered = false;

    const buffer = createFrameBuffer<number>((items) => {
      seen.push(items);
      if (!reentered) {
        reentered = true;
        buffer.push(99);
      }
    }, frame.schedule);

    buffer.push(1);
    frame.tick();
    expect(seen).toEqual([[1]]);

    frame.tick();
    expect(seen).toEqual([[1], [99]]);
  });

  it("does not call flush when nothing was queued", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(flush, frame.schedule);

    buffer.flushNow();
    expect(flush).not.toHaveBeenCalled();
  });

  it("flushNow drains immediately and cancels the pending frame", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(flush, frame.schedule);

    buffer.push(1);
    buffer.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(frame.scheduled).toBe(false);

    frame.tick();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancel drops queued items so a closing socket cannot flush after teardown", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(flush, frame.schedule);

    buffer.push(1);
    buffer.cancel();
    expect(buffer.pending).toBe(0);

    frame.tick();
    expect(flush).not.toHaveBeenCalled();
  });

  it("keeps working after a cancel", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(flush, frame.schedule);

    buffer.push(1);
    buffer.cancel();
    buffer.push(2);
    frame.tick();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toEqual([2]);
  });
});

/**
 * A socket does not stop delivering because nothing is draining. These cover the
 * two ways the queue is bounded when the scheduler stalls -- the case that made a
 * backgrounded tab on a busy market accumulate frames indefinitely.
 */
describe("createFrameBuffer — bounded under a stalled scheduler", () => {
  it("force-flushes at maxQueue without waiting for a frame", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(flush, frame.schedule, { maxQueue: 4 });

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    expect(flush).not.toHaveBeenCalled();

    buffer.push(4);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toEqual([1, 2, 3, 4]);
    expect(buffer.pending).toBe(0);
  });

  it("never exceeds maxQueue however long the scheduler stalls", () => {
    const batches: number[][] = [];
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(
      (items) => batches.push(items),
      frame.schedule,
      { maxQueue: 10 },
    );

    // The scheduler is never ticked; only the cap drains anything.
    let high = 0;
    for (let i = 0; i < 250; i++) {
      buffer.push(i);
      high = Math.max(high, buffer.pending);
    }

    expect(high).toBeLessThanOrEqual(10);
    expect(batches).toHaveLength(25);
    expect(batches.flat()).toHaveLength(250);
  });

  it("keeps scheduling normally after a forced flush", () => {
    const flush = vi.fn();
    const frame = manualSchedule();
    const buffer = createFrameBuffer<number>(flush, frame.schedule, { maxQueue: 2 });

    buffer.push(1);
    buffer.push(2); // forced
    buffer.push(3); // back to the scheduled path
    expect(flush).toHaveBeenCalledTimes(1);

    frame.tick();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[1][0]).toEqual([3]);
  });

  it("drains on a timer when requestAnimationFrame never fires (hidden tab)", () => {
    // A hidden tab PAUSES rAF -- it does not remove it, so the `typeof` fallback
    // never triggers. Standing in for that with an rAF that is never called back.
    const realRaf = globalThis.requestAnimationFrame;
    const realCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1) as never;
    globalThis.cancelAnimationFrame = vi.fn() as never;
    vi.useFakeTimers();

    try {
      const flush = vi.fn();
      const buffer = createFrameBuffer<number>(flush); // real defaultSchedule

      buffer.push(1);
      expect(flush).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(flush).toHaveBeenCalledTimes(1);
      expect(flush.mock.calls[0][0]).toEqual([1]);
    } finally {
      vi.useRealTimers();
      globalThis.requestAnimationFrame = realRaf;
      globalThis.cancelAnimationFrame = realCancel;
    }
  });

  it("does not double-flush when the frame wins the race against the timer", () => {
    const realRaf = globalThis.requestAnimationFrame;
    const realCancel = globalThis.cancelAnimationFrame;
    // Collected in an array rather than a `let`: assigning from inside the mock
    // leaves TS narrowing the variable to `never` at the call below.
    const framed: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      framed.push(cb);
      return 1;
    }) as never;
    globalThis.cancelAnimationFrame = vi.fn() as never;
    vi.useFakeTimers();

    try {
      const flush = vi.fn();
      const buffer = createFrameBuffer<number>(flush);

      buffer.push(1);
      framed[0]?.(0); // the frame fires first
      expect(flush).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000); // the losing timer must not flush again
      expect(flush).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      globalThis.requestAnimationFrame = realRaf;
      globalThis.cancelAnimationFrame = realCancel;
    }
  });
});
