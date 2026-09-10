// @ts-check
/**
 * The API under test, and the credential to reach it.
 *
 * 25 suites each declared `const auth = req => req.set('x-api-key', KEY)` and
 * 45 required `../src/server` directly, so a change to how a request is
 * authenticated was a 45-file edit — which is the cost that stops such a
 * change being made. One place now.
 *
 * `tests/setup.js` has already put a default `UI_API_KEY` on the environment
 * before this loads, so a suite needs neither line. A suite that wants its own
 * key sets `process.env.UI_API_KEY` before requiring this.
 */

'use strict';

const request = require('supertest');

const app = require('../../src/server');

/** The dashboard key this run is using. */
const KEY = () => process.env.UI_API_KEY;

/**
 * A supertest agent against the app.
 * @returns {any}
 */
const api = () => request(app);

/**
 * Present the dashboard key on a request.
 * @template T
 * @param {T} req
 * @returns {T}
 */
const auth = req => /** @type {any} */ (req).set('x-api-key', KEY());

/**
 * Present the key and name the person the integration is acting for.
 * @template T
 * @param {T} req
 * @param {string} actor
 * @returns {T}
 */
const asActor = (req, actor) => /** @type {any} */ (auth(req)).set('x-actor', actor);

module.exports = { app, api, auth, asActor, KEY, request };
