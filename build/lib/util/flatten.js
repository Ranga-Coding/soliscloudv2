"use strict";

function sanitizeKey(key) {
  return String(key).replace(/[^\w.-]/g, "_");
}

function flattenToKeyValues(input, opts = {}, prefix = "", depth = 0) {
  const maxDepth = opts.maxDepth ?? 12;
  const arrayMode = opts.arrayMode ?? "index";
  const out = {};

  if (depth > maxDepth) {
    out[prefix || "value"] = JSON.stringify(input);
    return out;
  }

  if (input === null || input === undefined) {
    out[prefix || "value"] = input;
    return out;
  }

  if (Array.isArray(input)) {
    if (arrayMode === "json") {
      out[prefix || "value"] = JSON.stringify(input);
      return out;
    }
    input.forEach((v, i) => {
      const childPrefix = prefix ? `${prefix}.${i}` : String(i);
      Object.assign(out, flattenToKeyValues(v, opts, childPrefix, depth + 1));
    });
    return out;
  }

  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) {
      const safeKey = sanitizeKey(k);
      const childPrefix = prefix ? `${prefix}.${safeKey}` : safeKey;
      Object.assign(out, flattenToKeyValues(v, opts, childPrefix, depth + 1));
    }
    return out;
  }

  out[prefix || "value"] = input;
  return out;
}

module.exports = { flattenToKeyValues, sanitizeKey };
