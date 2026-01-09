"use strict";

const { inferSemanticFromIdLeaf } = require("./semantic");

class StateWriter {
  constructor(adapter) {
    this.adapter = adapter;
  }

  async writeFlat(prefix, flat) {
    for (const [k, v] of Object.entries(flat)) {
      const id = `${prefix}.${k}`.replace(/\.+/g, ".");
      await this.ensureStateObject(id, v);
      await this.adapter.setStateAsync(id, { val: this.toStateValue(v), ack: true });
    }
  }

  async ensureStateObject(id, v) {
    const existing = await this.adapter.getObjectAsync(id);
    if (existing) return;

    const leaf = id.split(".").slice(-1)[0];
    const semantic = inferSemanticFromIdLeaf(leaf);
    const commonType = this.inferType(v);
    const typeForIoBroker = commonType === "mixed" ? "string" : commonType;

    await this.adapter.setObjectNotExistsAsync(id, {
      type: "state",
      common: {
        name: leaf,
        type: typeForIoBroker,
        role: semantic.role || "value",
        unit: semantic.unit,
        read: true,
        write: false
      },
      native: {}
    });
  }

  inferType(v) {
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "string") return "string";
    return "mixed";
  }

  toStateValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
}

module.exports = { StateWriter };
