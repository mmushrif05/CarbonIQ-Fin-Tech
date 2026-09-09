/**
 * CarbonIQ FinTech — AI Service Bridge
 *
 * Triggers AI-powered BOQ assessment by calling the existing
 * parse-boq.js Netlify function internally.
 *
 * This bridge does NOT duplicate AI logic — it calls the existing
 * function over HTTP, preserving the ECCS 6-step hierarchy,
 * A1-A3 → ICE priority chain, and all classification rules.
 */

const config = require('../config');

/**
 * Where the CarbonIQ core platform's Netlify functions live.
 *
 * These two calls reach the CORE engine (parse-boq, carbon-advisor), which is
 * a different deployment from this API. The default used to be a hard-coded
 * production hostname; when that deployment moved, the calls failed against a
 * host that no longer answers, and the error named the timeout rather than the
 * cause. There is now no default: an unset CORE_APP_URL is refused with the
 * variable to set, in the same spirit as the AI-availability check.
 */
function coreAppUrl() {
  if (config.env === 'development') return 'http://localhost:8888';

  const url = process.env.CORE_APP_URL || process.env.APP_URL;
  if (!url) {
    const err = new Error(
      'The CarbonIQ core platform URL is not configured, so the core engine cannot be reached. '
      + 'Set CORE_APP_URL to the deployment hosting the parse-boq and carbon-advisor functions.');
    err.statusCode = 503;
    err.code = 'CORE_APP_URL_NOT_SET';
    throw err;
  }
  return url.replace(/\/+$/, '');
}

/**
 * Trigger a BOQ assessment via the existing parse-boq Netlify function.
 *
 * @param {string} boqContent - Raw BOQ text content
 * @param {Object} options - { projectId, format }
 * @returns {Object} AI classification results
 */
async function triggerBOQAssessment(boqContent, options = {}) {
  const baseUrl = coreAppUrl();

  const response = await fetch(`${baseUrl}/.netlify/functions/parse-boq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boqText: boqContent,
      projectId: options.projectId,
      format: options.format || 'structured'
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BOQ assessment failed: ${response.status} — ${error}`);
  }

  return response.json();
}

/**
 * Trigger Carbon Advisor analysis for a project.
 *
 * @param {string} projectId
 * @param {Object} projectData - { entries, tenderItems, reductionTarget }
 * @returns {Object} AI-powered reduction recommendations
 */
async function triggerCarbonAdvisor(projectId, projectData) {
  const baseUrl = coreAppUrl();

  const response = await fetch(`${baseUrl}/.netlify/functions/carbon-advisor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, ...projectData }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Carbon advisor failed: ${response.status} — ${error}`);
  }

  return response.json();
}

module.exports = {
  triggerBOQAssessment,
  triggerCarbonAdvisor
};
