// The size readout. The server measures (UTF-8 bytes) and names the limit; this shows both the way
// the compiler's messages do (src/limits.ts): decimal kilobytes, and exact bytes where it matters.

/** @typedef {import("../protocol.ts").SizeInfo} SizeInfo */

/** @param {number} bytes */
export const formatKB = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;
/** @param {number} bytes */
export const formatBytes = (bytes) => `${bytes.toLocaleString("en-US")} bytes`;

// the meter runs past the limit (to 120 KB at Gmail's 102 KB) so the part over it shows
const SCALE = 120 / 102;
const NEAR = 0.88;

/**
 * @param {SizeInfo} size
 * @param {boolean} stale the last good build's, while the current one fails
 */
export const sizeView = ({ bytes, limit }, stale) => {
  const level = bytes > limit ? "bad" : bytes >= limit * NEAR ? "warn" : "";
  const text = formatKB(bytes);
  return {
    level: stale ? "" : level,
    text,
    max: `of ${formatKB(limit)}`,
    meter: Math.min(100, (bytes / (limit * SCALE)) * 100),
    label: `${text} of the ${formatKB(limit)} Gmail clipping limit`,
    note: stale ? "Last good build" : level === "bad" ? "Clipped by Gmail" : level === "warn" ? "Near Gmail limit" : "",
    title:
      level === "bad"
        ? `Gmail clips messages over ${formatBytes(limit)}; this one is ${formatBytes(bytes)}`
        : `${formatBytes(bytes)} compiled (Gmail clips messages over ${formatBytes(limit)})`,
  };
};
