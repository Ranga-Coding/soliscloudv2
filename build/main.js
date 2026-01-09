"use strict";

/*
  ioBroker SolisCloudV2 Adapter (JS runtime build)
*/

const utils = require("@iobroker/adapter-core");
const { SolisCloudClient } = require("./lib/solis/SolisCloudClient");
const { Poller } = require("./lib/scheduler/Poller");

class Soliscloud extends utils.Adapter {
  constructor(options = {}) {
    super({ ...options, name: "soliscloudv2" });

    this.poller = undefined;

    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  async onReady() {
    await this.setObjectNotExistsAsync("info.connection", {
      type: "state",
      common: { name: "Connection", type: "boolean", role: "indicator.connected", read: true, write: false },
      native: {}
    });
    this.setState("info.connection", false, true);

    const apiId = String(this.config.apiId ?? "").trim();
    const apiSecret = String(this.config.apiSecret ?? "").trim();
    const baseUrl = String(this.config.baseUrl ?? "https://www.soliscloud.com:13333").trim();

    const pollIntervalSec = Number(this.config.pollIntervalSec ?? 300);
    const staticIntervalMin = Number(this.config.staticIntervalMin ?? 360);
    const staticJitterSec = Number(this.config.staticJitterSec ?? 15);

    const requestTimeoutMs = Number(this.config.requestTimeoutMs ?? 20000);

    if (!apiId || !apiSecret) {
      this.log.error("Missing apiId/apiSecret in adapter config");
      return;
    }

    const client = new SolisCloudClient({ baseUrl, apiId, apiSecret, timeoutMs: requestTimeoutMs, contentTypeMode: this.config.contentTypeMode, debugSigning: this.config.debugSigning });

    const stations = this.config.stationIds
      ? String(this.config.stationIds).split(",").map(s => s.trim()).filter(Boolean)
      : undefined;

    const inverters = this.config.inverterSNs
      ? String(this.config.inverterSNs).split(",").map(s => s.trim()).filter(Boolean)
      : undefined;

    this.poller = new Poller(this, client, {
      pollIntervalSec,
      staticIntervalMin,
      staticJitterSec,
      arrayMode: this.config.arrayMode ?? "index",
      stations,
      inverters,

      enableStationDay: !!this.config.enableStationDay,
      enableStationDetail: !!this.config.enableStationDetail,
      enableAlarmList: !!this.config.enableAlarmList,

      enableInverterList: !!this.config.enableInverterList,
      enableInverterDay: !!this.config.enableInverterDay,
      enableInverterDetail: !!this.config.enableInverterDetail,

      enableEpm: !!this.config.enableEpm,
      enableCollector: !!this.config.enableCollector,
      enableWeather: !!this.config.enableWeather,

      logRawResponses: !!this.config.logRawResponses
    });

    this.setState("info.connection", true, true);
    this.poller.start();
  }

  onUnload(callback) {
    try {
      if (this.poller) this.poller.stop();
      this.setState("info.connection", false, true);
      callback();
    } catch {
      callback();
    }
  }
}

if (module.parent) {
  module.exports = (options) => new Soliscloud(options);
} else {
  (() => new Soliscloud())();
}
