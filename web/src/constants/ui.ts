export const SOCKET_RECONNECT_MS = 1000;
/** Pause before moving to the next question after picking an option. */
export const ANSWER_ADVANCE_MS = 250;
/** Pause between narrated slides. */
export const SLIDE_ADVANCE_MS = 700;
export const LOADING_LOG_LINES = 4;
export const REVIEWER_SUGGESTIONS = { whileTyping: 5, idle: 3 };
/** After this long without Claude reacting to a hand-off, suggest checking the terminal. */
export const HANDOFF_STALL_MS = 25_000;
