// Thin wrappers over the dev server's JSON API, typed by its contract (../protocol.ts).
// Every call resolves to { ok, status, body }; a failure's body carries { error } when the server said why.

/** @typedef {import("../protocol.ts").Routes} Routes */
/** @typedef {import("../protocol.ts").RouteKey} RouteKey */
/** @typedef {import("../protocol.ts").RenderRequest} RenderRequest */
/** @typedef {import("../protocol.ts").ErrorBody} ErrorBody */
/** @typedef {{ ok: false, status: number, body: Partial<ErrorBody> }} Failure */
/** @template {RouteKey} K @typedef {{ ok: true, status: number, body: Routes[K]["response"] } | Failure} Reply */

/**
 * @template {RouteKey} K
 * @param {K} route
 * @param {Routes[K]["query"]} query
 * @param {Routes[K]["body"]} body
 * @returns {Promise<Reply<K>>}
 */
const call = async (route, query, body) => {
  const space = route.indexOf(" ");
  const qs = new URLSearchParams(query).toString();
  const path = route.slice(space + 1) + (qs ? `?${qs}` : "");
  /** @type {Response} */
  let res;
  try {
    res = await fetch(path, {
      method: route.slice(0, space),
      ...(body !== undefined && {
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    });
  } catch (e) {
    return { ok: false, status: 0, body: { error: { message: `server unreachable (${/** @type {Error} */ (e).message})` } } };
  }
  /** @type {unknown} */
  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: res.status, body: { error: { message: `${res.status} ${res.statusText}` } } };
  }
  // the server's own answers: shaped by the same contract
  return res.ok
    ? { ok: true, status: res.status, body: /** @type {Routes[K]["response"]} */ (json) }
    : { ok: false, status: res.status, body: /** @type {Partial<ErrorBody>} */ (json ?? {}) };
};

export const listEmails = () => call("GET /__tddr/api/emails", {}, undefined);
export const render = (/** @type {RenderRequest} */ req) => call("POST /__tddr/api/render", {}, req);
export const getData = (/** @type {string} */ email, /** @type {string} */ set) => call("GET /__tddr/api/data", { email, set }, undefined);
/** @param {string} email @param {string} set @param {string} text */
export const putData = (email, set, text) => call("PUT /__tddr/api/data", { email, set }, text);
/** @param {string} email @param {string} name @param {string} text */
export const newData = (email, name, text) => call("POST /__tddr/api/data", { email }, { name, text });

export const errorMessage = (/** @type {Failure} */ r) => r.body.error?.message ?? `request failed (${r.status})`;
