/**
 * Motion values shared by animated controls, so a tab highlight, a segmented
 * toggle and a panel slide feel like one system rather than three guesses.
 *
 * Reduced motion is handled where they are used (`useReducedMotion`) and,
 * app-wide, by AppShell's `MotionConfig reducedMotion="user"`.
 */
export const motionTokens = {
  spring: {
    /** A highlight gliding between tabs: quick, settles without wobble. */
    morph: { type: "spring", stiffness: 520, damping: 42, mass: 0.7 },
    /** Panels and heights: a touch softer. */
    smooth: { type: "spring", stiffness: 380, damping: 38, mass: 0.9 },
  },
  duration: { instant: 0.12, standard: 0.2 },
  ease: {
    enter: [0.2, 0, 0, 1],
    standard: [0.4, 0, 0.2, 1],
  },
} as const;
