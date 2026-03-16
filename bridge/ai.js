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
 * Trigger a BOQ assessment via the existing parse-boq Netlify function.
 *
 * @param {string} boqContent - Raw BOQ text content
 * @param {Object} options - { projectId, format }
 * @returns {Object} AI classification results
 */
async function triggerBOQAssessment(boqContent, options = {}) {
  const baseUrl = config.env === 'development'
    ? 'http://localhost:8888'
    : process.env.APP_URL || 'https://carboniq.online';

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
  const baseUrl = config.env === 'development'
    ? 'http://localhost:8888'
    : process.env.APP_URL || 'https://carboniq.online';

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
