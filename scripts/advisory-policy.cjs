'use strict';

const requiredText = (value) => typeof value === 'string' && value.trim().length > 0;

function evaluateAdvisories(findings, policy, now = new Date()) {
  const errors = [];
  if (!policy || policy.version !== 1 || !Array.isArray(policy.entries)) return { ok: false, errors: ['malformed advisory policy'] };
  const entries = new Map();
  for (const entry of policy.entries) {
    const valid = requiredText(entry?.advisoryId) && requiredText(entry?.dependencyPath)
      && ['high', 'moderate'].includes(entry?.severity) && requiredText(entry?.owner)
      && requiredText(entry?.justification) && /^\d{4}-\d{2}-\d{2}$/.test(entry?.expiresOn ?? '')
      && !Number.isNaN(Date.parse(`${entry.expiresOn}T23:59:59Z`));
    if (!valid) { errors.push('malformed advisory policy entry'); continue; }
    const key = `${entry.advisoryId}\n${entry.dependencyPath}`;
    if (entries.has(key)) errors.push(`malformed duplicate policy entry ${entry.advisoryId}`);
    entries.set(key, entry);
  }
  for (const finding of findings) {
    if (finding.severity === 'critical') { errors.push(`critical advisory ${finding.advisoryId} at ${finding.dependencyPath}`); continue; }
    if (!['high', 'moderate'].includes(finding.severity)) continue;
    const entry = entries.get(`${finding.advisoryId}\n${finding.dependencyPath}`);
    if (!entry) { errors.push(`unreviewed ${finding.severity} advisory ${finding.advisoryId} at ${finding.dependencyPath}`); continue; }
    if (entry.severity !== finding.severity) errors.push(`malformed severity mismatch for ${finding.advisoryId}`);
    if (Date.parse(`${entry.expiresOn}T23:59:59Z`) < now.getTime()) errors.push(`expired advisory exception ${finding.advisoryId}`);
  }
  return { ok: errors.length === 0, errors };
}

function findingsFromNpmAudit(report) {
  const findings = [];
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (!via || typeof via !== 'object' || !requiredText(via.url)) continue;
      for (const node of vulnerability.nodes ?? []) findings.push({ advisoryId: via.url.split('/').pop(), dependencyPath: `${packageName}>${node}`, severity: via.severity });
    }
  }
  return findings.sort((a, b) => `${a.advisoryId}:${a.dependencyPath}`.localeCompare(`${b.advisoryId}:${b.dependencyPath}`));
}

module.exports = { evaluateAdvisories, findingsFromNpmAudit };
