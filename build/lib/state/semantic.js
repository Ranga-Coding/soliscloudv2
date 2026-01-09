"use strict";

function inferSemanticFromIdLeaf(leaf) {
  const k = String(leaf).toLowerCase();

  // power
  if (k.includes("power") || k.endsWith("pwr")) {
    // If name suggests kW explicitly, set kW
    if (k.includes("kw")) return { role: "value.power", unit: "kW" };
    return { role: "value.power", unit: "W" };
  }

  // energy / yield
  if (k.includes("energy") || k.includes("yield") || k.includes("generation") || k.includes("kwh")) {
    return { role: "value.energy", unit: "kWh" };
  }

  // voltage
  if (k.includes("volt") || k === "v" || k.endsWith("_v") || k.endsWith("voltage")) {
    return { role: "value.voltage", unit: "V" };
  }

  // current
  if (k.includes("current") || k === "a" || k.endsWith("_a") || k.includes("amp")) {
    return { role: "value.current", unit: "A" };
  }

  // frequency
  if (k.includes("freq") || k.includes("hz")) {
    return { role: "value.frequency", unit: "Hz" };
  }

  // temperature
  if (k.includes("temp") || k.includes("temperature")) {
    return { role: "value.temperature", unit: "°C" };
  }

  // percent / soc
  if (k.includes("soc") || k.includes("percent") || k.endsWith("pec") || k.endsWith("_pct") || k.endsWith("_percent")) {
    return { role: "value.percent", unit: "%" };
  }

  if (k.includes("status") || k.includes("state") || k.includes("mode") || k.includes("alarm")) {
    return { role: "text" };
  }

  return { role: "value" };
}

module.exports = { inferSemanticFromIdLeaf };
