"use strict";

const { Endpoints } = require("../solis/endpoints");
const { flattenToKeyValues } = require("../util/flatten");
const { StateWriter } = require("../state/StateWriter");

class Poller {
  constructor(adapter, client, cfg) {
    this.adapter = adapter;
    this.client = client;
    this.cfg = cfg;
    this.writer = new StateWriter(adapter);
    this.realtimeTimer = undefined;
    this.staticTimer = undefined;
  }

  start() {
    const runRealtime = async () => {
      try {
        await this.pollRealtime();
      } catch (e) {
        this.adapter.log.warn(`Realtime poll failed: ${e?.message ?? e}`);
      } finally {
        const sec = Math.max(30, Number(this.cfg.pollIntervalSec || 300));
        this.realtimeTimer = this.adapter.setTimeout(runRealtime, sec * 1000);
      }
    };

    const runStatic = async () => {
      try {
        await this.pollStatic();
      } catch (e) {
        this.adapter.log.warn(`Static poll failed: ${e?.message ?? e}`);
      } finally {
        const min = Math.max(10, Number(this.cfg.staticIntervalMin || 360));
        const jitter = Number(this.cfg.staticJitterSec || 0);
        const delayMs = min * 60000 + (jitter ? Math.floor(Math.random() * jitter * 1000) : 0);
        this.staticTimer = this.adapter.setTimeout(runStatic, delayMs);
      }
    };

    void runRealtime();
    void runStatic();
  }

  stop() {
    if (this.realtimeTimer) this.adapter.clearTimeout(this.realtimeTimer);
    if (this.staticTimer) this.adapter.clearTimeout(this.staticTimer);
    this.realtimeTimer = undefined;
    this.staticTimer = undefined;
  }

  async pollRealtime() {
    const today = this.localDateYYYYMMDD();

    const stationIds = await this.getCachedList("cache.stationIds");
    const inverterSNs = await this.getCachedList("cache.inverterSNs");

    const stations = stationIds.filter(id => (this.cfg.stations?.length ? this.cfg.stations.includes(id) : true));
    const inverters = inverterSNs.filter(sn => (this.cfg.inverters?.length ? this.cfg.inverters.includes(sn) : true));

    if (this.cfg.enableStationDay) {
      for (const stationId of stations) {
        const stationDay = await this.client.post(Endpoints.stationDay, { stationId, date: today });
        await this.store(`stations.${stationId}.stationDay`, stationDay);
      }
    }

    if (this.cfg.enableInverterDay) {
      for (const sn of inverters) {
        const invDay = await this.client.post(Endpoints.inverterDay, { sn, date: today });
        await this.store(`inverters.${sn}.inverterDay`, invDay);
      }
    }

    if (this.cfg.enableAlarmList) {
      const alarms = await this.client.post(Endpoints.alarmList, { pageNo: 1, pageSize: 100 });
      await this.store("alarms.list", alarms);
    }
  }

  async pollStatic() {
    const stationList = await this.client.post(Endpoints.userStationList, { pageNo: 1, pageSize: 100 });
    await this.store("meta.stationList", stationList);

    const stationIds = this.extractStationIds(stationList);
    await this.setCachedList("cache.stationIds", stationIds);

    const stations = stationIds.filter(id => (this.cfg.stations?.length ? this.cfg.stations.includes(id) : true));

    if (this.cfg.enableStationDetail) {
      for (const stationId of stations) {
        const stationDetail = await this.client.post(Endpoints.stationDetail, { id: stationId });
        await this.store(`stations.${stationId}.detail`, stationDetail);
      }
    }

    if (this.cfg.enableInverterList) {
      const inverterList = await this.client.post(Endpoints.inverterList, { pageNo: 1, pageSize: 200 });
      await this.store("meta.inverterList", inverterList);

      const inverterSNs = this.extractInverterSNs(inverterList);
      await this.setCachedList("cache.inverterSNs", inverterSNs);

      const inverters = inverterSNs.filter(sn => (this.cfg.inverters?.length ? this.cfg.inverters.includes(sn) : true));

      if (this.cfg.enableInverterDetail) {
        for (const sn of inverters) {
          const invDetail = await this.client.post(Endpoints.inverterDetail, { sn });
          await this.store(`inverters.${sn}.detail`, invDetail);
        }
      }
    }
  }

  async store(prefix, payload) {
    if (this.cfg.logRawResponses) {
      this.adapter.log.debug(`${prefix}: ${safeJson(payload)}`);
    }
    const flat = flattenToKeyValues(payload, { arrayMode: this.cfg.arrayMode ?? "index" });
    await this.writer.writeFlat(prefix, flat);
  }

  extractStationIds(stationListPayload) {
    const records = stationListPayload?.data?.page?.records ?? stationListPayload?.data?.records ?? [];
    return (Array.isArray(records) ? records : [])
      .map(r => String(r.id ?? r.stationId ?? ""))
      .filter(x => x && x !== "undefined");
  }

  extractInverterSNs(inverterListPayload) {
    const records = inverterListPayload?.data?.page?.records ?? inverterListPayload?.data?.records ?? [];
    return (Array.isArray(records) ? records : [])
      .map(r => String(r.sn ?? r.serialNum ?? ""))
      .filter(x => x && x !== "undefined");
  }

  localDateYYYYMMDD() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  async setCachedList(id, list) {
    await this.adapter.setObjectNotExistsAsync(id, {
      type: "state",
      common: { name: id, type: "string", role: "json", read: true, write: false },
      native: {}
    });
    await this.adapter.setStateAsync(id, { val: JSON.stringify(list), ack: true });
  }

  async getCachedList(id) {
    const s = await this.adapter.getStateAsync(id);
    if (!s?.val) return [];
    try {
      const parsed = JSON.parse(String(s.val));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}

function safeJson(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

module.exports = { Poller };
