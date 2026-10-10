// Requests where only the newest answer counts. A render of the email just left, or the data set
// picked a moment ago, can come back after the one asked for since; it must not overwrite it.

/** @typedef {{ readonly current: boolean }} Ticket */

// Hands out tickets; taking one makes every earlier one stale.
export const createGate = () => {
  let seq = 0;
  return {
    /** @returns {Ticket} */
    begin() {
      const id = ++seq;
      return {
        get current() {
          return id === seq;
        },
      };
    },
  };
};

// `done` gets the answer of the newest run only; cancel() drops the one in flight (what it was for
// has changed and a new run follows). `busy(true)` once a run has taken `slowMs`, so a quick reload
// flashes nothing; `busy(false)` when the newest answer lands.
/**
 * @template Req, Res
 * @param {{
 *   send: (req: Req) => Promise<Res>,
 *   done: (res: Res, ms: number) => void,
 *   busy?: (on: boolean) => void,
 *   slowMs?: number,
 *   now?: () => number,
 * }} o
 */
export const createLatest = ({ send, done, busy = () => {}, slowMs = 300, now = () => performance.now() }) => {
  const gate = createGate();
  return {
    /** @param {Req} req */
    async run(req) {
      const ticket = gate.begin();
      const started = now();
      const slow = setTimeout(() => busy(true), slowMs);
      const res = await send(req);
      clearTimeout(slow);
      if (!ticket.current) return; // a newer one is on its way
      busy(false);
      done(res, now() - started);
    },
    cancel() {
      gate.begin();
    },
  };
};
