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
    this.cache = { stationIds: [], inverterSNs: [], epmSNs: [], collectorSNs: [], weatherSNs: [], ammeterSNs: [] };
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
    this.cache = { stationIds: [], inverterSNs: [], epmSNs: [], collectorSNs: [], weatherSNs: [], ammeterSNs: [] };
  }

  async pollRealtime() {
    const today = this.localDateYYYYMMDD();
    const tz = Number(this.cfg.timeZone ?? 0) || undefined;
    const money = this.cfg.money || "";

    const stationIds = await this.getCachedList("cache.stationIds");
    const inverterSNs = await this.getCachedList("cache.inverterSNs");
    const epmSNs = await this.getCachedList("cache.epmSNs");
    const collectorSNs = await this.getCachedList("cache.collectorSNs");

    const stations = stationIds.filter(id => (this.cfg.stations?.length ? this.cfg.stations.includes(id) : true));
    const inverters = inverterSNs.filter(sn => (this.cfg.inverters?.length ? this.cfg.inverters.includes(sn) : true));
    const epms = epmSNs.filter(sn => (this.cfg.epms?.length ? this.cfg.epms.includes(sn) : true));
    const collectors = collectorSNs.filter(sn => (this.cfg.collectors?.length ? this.cfg.collectors.includes(sn) : true));

    if (this.cfg.enableStationDay) {
      for (const stationId of stations) {
        const stationDay = await this.client.post(Endpoints.stationDay, { id: stationId, money, time: today, timeZone: tz });
        await this.store(`stations.${stationId}.day.${today}`, stationDay);
      }
    }

    if (this.cfg.enableInverterDay) {
      for (const sn of inverters) {
        const invDay = await this.client.post(Endpoints.inverterDay, { sn, money, time: today, timeZone: tz });
        await this.store(`inverters.${sn}.day.${today}`, invDay);
      }
    }

    if (this.cfg.enableEpmDay) {
      const searchinfo = this.cfg.epmSearchInfo || "u_ac1,u_ac2,u_ac3,i_ac1,i_ac2,i_ac3,p_ac1,p_ac2,p_ac3,power_factor,fac_meter,p_load,e_total_inverter,e_total_load,e_total_buy,e_total_sell";
      for (const sn of epms) {
        const res = await this.client.post(Endpoints.epmDay, { sn, searchinfo, time: today, timeZone: tz });
        await this.store(`epm.${sn}.day.${today}`, res);
      }
    }

    if (this.cfg.enableCollectorDay) {
      for (const sn of collectors) {
        const res = await this.client.post(Endpoints.collectorDay, { sn, time: today, timeZone: tz });
        await this.store(`collectors.${sn}.day.${today}`, res);
      }
    }

    if (this.cfg.enableAlarmList) {
      const alarms = await this.fetchAllPages(Endpoints.alarmList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "alarms.list");
      await this.store("alarms.list", alarms);
    }
  }

  async pollStatic() {
    // --- Stations (lists) ---
    const stationList = await this.fetchAllPages(Endpoints.userStationList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.stationList");
    const stationIds = this.extractStationIds(stationList);
    this.cache.stationIds = stationIds;
    await this.setCachedList("cache.stationIds", stationIds);

    const stations = stationIds.filter(id => (this.cfg.stations?.length ? this.cfg.stations.includes(id) : true));

    // Optional: batch station details
    if (this.cfg.enableStationDetailList) {
      const stationDetailList = await this.fetchAllPages(Endpoints.stationDetailList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.stationDetailList");
      await this.store("meta.stationDetailList", stationDetailList);
    }

    if (this.cfg.enableStationDetail) {
      for (const stationId of stations) {
        const stationDetail = await this.client.post(Endpoints.stationDetail, { id: stationId });
        await this.store(`stations.${stationId}.detail`, stationDetail);
      }
    }

    // --- Station charts (month/year/all) ---
    const tz = Number(this.cfg.timeZone ?? 0) || undefined;
    const money = this.cfg.money || "";
    const now = new Date();
    const month = this.formatMonth(now);
    const year = String(now.getFullYear());

    if (this.cfg.enableStationMonth) {
      for (const stationId of stations) {
        const res = await this.client.post(Endpoints.stationMonth, { id: stationId, money, month, timeZone: tz });
        await this.store(`stations.${stationId}.month.${month}`, res);
      }
    }
    if (this.cfg.enableStationYear) {
      for (const stationId of stations) {
        const res = await this.client.post(Endpoints.stationYear, { id: stationId, money, year, timeZone: tz });
        await this.store(`stations.${stationId}.year.${year}`, res);
      }
    }
    if (this.cfg.enableStationAll) {
      for (const stationId of stations) {
        const res = await this.client.post(Endpoints.stationAll, { id: stationId, money, timeZone: tz });
        await this.store(`stations.${stationId}.all`, res);
      }
    }

    // --- Inverters ---
    if (this.cfg.enableInverterList) {
      const inverterList = await this.fetchAllPages(Endpoints.inverterList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.inverterList");
      const inverterSNs = this.extractInverterSNs(inverterList);
      this.cache.inverterSNs = inverterSNs;
      await this.setCachedList("cache.inverterSNs", inverterSNs);

      const inverters = inverterSNs.filter(sn => (this.cfg.inverters?.length ? this.cfg.inverters.includes(sn) : true));

      if (this.cfg.enableInverterDetail) {
        for (const sn of inverters) {
          const invDetail = await this.client.post(Endpoints.inverterDetail, { sn });
          await this.store(`inverters.${sn}.detail`, invDetail);
        }
      }

      if (this.cfg.enableInverterDetailList) {
        const invDetailList = await this.fetchAllPages(Endpoints.inverterDetailList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.inverterDetailList");
        await this.store("meta.inverterDetailList", invDetailList);
      }

      if (this.cfg.enableInverterMonth) {
        for (const sn of inverters) {
          const res = await this.client.post(Endpoints.inverterMonth, { sn, id: "", money, month, timeZone: tz });
          await this.store(`inverters.${sn}.month.${month}`, res);
        }
      }
      if (this.cfg.enableInverterYear) {
        for (const sn of inverters) {
          const res = await this.client.post(Endpoints.inverterYear, { sn, id: "", money, year, timeZone: tz });
          await this.store(`inverters.${sn}.year.${year}`, res);
        }
      }
    }

    // --- Collectors ---
    if (this.cfg.enableCollectorList) {
      const collectorList = await this.fetchAllPages(Endpoints.collectorList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.collectorList");
      const collectorSNs = this.extractCollectorSNs(collectorList);
      this.cache.collectorSNs = collectorSNs;
      await this.setCachedList("cache.collectorSNs", collectorSNs);

      const collectors = collectorSNs.filter(sn => (this.cfg.collectors?.length ? this.cfg.collectors.includes(sn) : true));

      if (this.cfg.enableCollectorDetail) {
        for (const sn of collectors) {
          const res = await this.client.post(Endpoints.collectorDetail, { sn });
          await this.store(`collectors.${sn}.detail`, res);
        }
      }

      if (this.cfg.enableCollectorSignal) {
        for (const sn of collectors) {
          const res = await this.client.post(Endpoints.collectorSignal, { sn });
          await this.store(`collectors.${sn}.signal`, res);
        }
      }
    }

    // --- EPM ---
    if (this.cfg.enableEpmList) {
      const epmList = await this.fetchAllPages(Endpoints.epmList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.epmList");
      const epmSNs = this.extractEpmSNs(epmList);
      this.cache.epmSNs = epmSNs;
      await this.setCachedList("cache.epmSNs", epmSNs);

      const epms = epmSNs.filter(sn => (this.cfg.epms?.length ? this.cfg.epms.includes(sn) : true));

      if (this.cfg.enableEpmDetail) {
        for (const sn of epms) {
          const res = await this.client.post(Endpoints.epmDetail, { sn });
          await this.store(`epm.${sn}.detail`, res);
        }
      }
      if (this.cfg.enableEpmMonth) {
        for (const sn of epms) {
          const res = await this.client.post(Endpoints.epmMonth, { sn, month });
          await this.store(`epm.${sn}.month.${month}`, res);
        }
      }
      if (this.cfg.enableEpmYear) {
        for (const sn of epms) {
          const res = await this.client.post(Endpoints.epmYear, { sn, year });
          await this.store(`epm.${sn}.year.${year}`, res);
        }
      }
      if (this.cfg.enableEpmAll) {
        for (const sn of epms) {
          const res = await this.client.post(Endpoints.epmAll, { sn });
          await this.store(`epm.${sn}.all`, res);
        }
      }
    }

    // --- Weather ---
    if (this.cfg.enableWeatherList) {
      const weatherList = await this.fetchAllPages(Endpoints.weatherList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.weatherList");
      const weatherSNs = this.extractWeatherSNs(weatherList);
      this.cache.weatherSNs = weatherSNs;
      await this.setCachedList("cache.weatherSNs", weatherSNs);

      if (this.cfg.enableWeatherDetail) {
        const items = weatherSNs.filter(sn => (this.cfg.weather?.length ? this.cfg.weather.includes(sn) : true));
        for (const sn of items) {
          const res = await this.client.post(Endpoints.weatherDetail, { sn });
          await this.store(`weather.${sn}.detail`, res);
        }
      }
    }

    // --- Ammeters ---
    if (this.cfg.enableAmmeterList) {
      const ammeterList = await this.fetchAllPages(Endpoints.ammeterList, { pageNo: 1, pageSize: this.cfg.pageSize ?? 100 }, "meta.ammeterList");
      const ammeterSNs = this.extractAmmeterSNs(ammeterList);
      this.cache.ammeterSNs = ammeterSNs;
      await this.setCachedList("cache.ammeterSNs", ammeterSNs);

      if (this.cfg.enableAmmeterDetail) {
        const items = ammeterSNs.filter(sn => (this.cfg.ammeters?.length ? this.cfg.ammeters.includes(sn) : true));
        for (const sn of items) {
          const res = await this.client.post(Endpoints.ammeterDetail, { sn });
          await this.store(`ammeters.${sn}.detail`, res);
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
  formatMonth(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  async fetchAllPages(endpoint, body, storePrefix) {
    // Generic pager for endpoints returning { data: { page: { records, pages, current } } }
    // or { data: { records, pages, current } }.
    const pageSize = Number(body.pageSize ?? 100) || 100;
    let pageNo = Number(body.pageNo ?? 1) || 1;
    const allResponses = [];
    let combined = null;

    for (let guard = 0; guard < 50; guard++) {
      const res = await this.client.post(endpoint, { ...body, pageNo, pageSize });
      allResponses.push(res);

      // Extract records/pages
      const page = res?.data?.page ?? res?.data;
      const records = page?.records;
      const pages = Number(page?.pages ?? 1) || 1;

      if (!combined) {
        combined = res;
      } else {
        // Merge only known list shapes to keep memory reasonable
        if (combined?.data?.page?.records && Array.isArray(records)) {
          combined.data.page.records = combined.data.page.records.concat(records);
          combined.data.page.pages = 1;
          combined.data.page.total = combined.data.page.records.length;
        } else if (combined?.data?.records && Array.isArray(records)) {
          combined.data.records = combined.data.records.concat(records);
          combined.data.pages = 1;
          combined.data.total = combined.data.records.length;
        }
      }

      if (storePrefix && pageNo === 1) {
        // Store first page response immediately for debugging
        await this.store(storePrefix, res);
      }

      if (!Array.isArray(records) || pageNo >= pages) break;
      pageNo++;
    }

    return combined ?? (allResponses[0] ?? null);
  }

  extractCollectorSNs(payload) {
    const records = payload?.data?.page?.records ?? payload?.data?.records ?? [];
    return Array.isArray(records) ? records.map(r => String(r?.sn ?? "")).filter(Boolean) : [];
  }

  extractEpmSNs(payload) {
    const records = payload?.data?.page?.records ?? payload?.data?.records ?? [];
    return Array.isArray(records) ? records.map(r => String(r?.sn ?? "")).filter(Boolean) : [];
  }

  extractWeatherSNs(payload) {
    const records = payload?.data?.page?.records ?? payload?.data?.records ?? [];
    return Array.isArray(records) ? records.map(r => String(r?.sn ?? "")).filter(Boolean) : [];
  }

  extractAmmeterSNs(payload) {
    const records = payload?.data?.page?.records ?? payload?.data?.records ?? [];
    return Array.isArray(records) ? records.map(r => String(r?.sn ?? "")).filter(Boolean) : [];
  }

}

function safeJson(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

module.exports = { Poller };
