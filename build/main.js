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
      epms: this.splitList(this.config.epmSNs),
      collectors: this.splitList(this.config.collectorSNs),
      weather: this.splitList(this.config.weatherSNs),
      ammeters: this.splitList(this.config.ammeterSNs),

      // generic request params used by several endpoints
      money: String(this.config.money ?? ""),
      timeZone: this.config.timeZone !== undefined && this.config.timeZone !== "" ? Number(this.config.timeZone) : undefined,
      pageSize: this.config.pageSize !== undefined && this.config.pageSize !== "" ? Number(this.config.pageSize) : 100,
      epmSearchInfo: String(this.config.epmSearchInfo ?? ""),

      enableStationDay: !!this.config.enableStationDay,
      enableStationDetail: !!this.config.enableStationDetail,
      enableStationDetailList: !!this.config.enableStationDetailList,
      enableStationMonth: !!this.config.enableStationMonth,
      enableStationYear: !!this.config.enableStationYear,
      enableStationAll: !!this.config.enableStationAll,
      enableAlarmList: !!this.config.enableAlarmList,

      enableInverterList: !!this.config.enableInverterList,
      enableInverterDay: !!this.config.enableInverterDay,
      enableInverterDetail: !!this.config.enableInverterDetail,
      enableInverterDetailList: !!this.config.enableInverterDetailList,
      enableInverterMonth: !!this.config.enableInverterMonth,
      enableInverterYear: !!this.config.enableInverterYear,

      // master switches (backwards compatible)
      enableEpm: !!this.config.enableEpm,
      enableCollector: !!this.config.enableCollector,
      enableWeather: !!this.config.enableWeather,

      // fine-grained switches (default to master switch)
      enableEpmList: this.config.enableEpmList !== undefined ? !!this.config.enableEpmList : !!this.config.enableEpm,
      enableEpmDetail: this.config.enableEpmDetail !== undefined ? !!this.config.enableEpmDetail : !!this.config.enableEpm,
      enableEpmDay: this.config.enableEpmDay !== undefined ? !!this.config.enableEpmDay : !!this.config.enableEpm,
      enableEpmMonth: this.config.enableEpmMonth !== undefined ? !!this.config.enableEpmMonth : !!this.config.enableEpm,
      enableEpmYear: this.config.enableEpmYear !== undefined ? !!this.config.enableEpmYear : !!this.config.enableEpm,
      enableEpmAll: this.config.enableEpmAll !== undefined ? !!this.config.enableEpmAll : !!this.config.enableEpm,

      enableCollectorList: this.config.enableCollectorList !== undefined ? !!this.config.enableCollectorList : !!this.config.enableCollector,
      enableCollectorDetail: this.config.enableCollectorDetail !== undefined ? !!this.config.enableCollectorDetail : !!this.config.enableCollector,
      enableCollectorSignal: this.config.enableCollectorSignal !== undefined ? !!this.config.enableCollectorSignal : !!this.config.enableCollector,
      enableCollectorDay: this.config.enableCollectorDay !== undefined ? !!this.config.enableCollectorDay : !!this.config.enableCollector,

      enableWeatherList: this.config.enableWeatherList !== undefined ? !!this.config.enableWeatherList : !!this.config.enableWeather,
      enableWeatherDetail: this.config.enableWeatherDetail !== undefined ? !!this.config.enableWeatherDetail : !!this.config.enableWeather,

      enableAmmeterList: !!this.config.enableAmmeterList,
      enableAmmeterDetail: !!this.config.enableAmmeterDetail,

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
