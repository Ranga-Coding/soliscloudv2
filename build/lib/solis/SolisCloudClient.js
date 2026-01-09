"use strict";

const crypto = require("node:crypto");
const axios = require("axios");

// Some SolisCloud gateways are picky about the Content-Type string used in the signature.
// The document contains examples with "application/json" and a standard format with "application/json;charset=UTF-8" fileciteturn1file0.
// We support auto-fallback.
const CT_WITH_CHARSET = "application/json;charset=UTF-8";
const CT_NO_CHARSET = "application/json";

// Deterministic JSON stringify (sorted keys) to reduce signature mismatches if server canonicalizes JSON.
function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(value);
}

class SolisCloudClient {
  constructor(opt) {
    this.opt = opt;
    this.mode = String(opt.contentTypeMode || "auto"); // auto|withCharset|noCharset
    this.debugSigning = !!opt.debugSigning;

    // Axios default content type; may be overridden per request.
    this.http = axios.create({
      baseURL: String(opt.baseUrl || "").replace(/\/+$/, ""),
      timeout: opt.timeoutMs ?? 20000,
      headers: { "Content-Type": CT_WITH_CHARSET },
      validateStatus: () => true
    });
  }

  async post(path, body = {}) {
    // try primary + (optional) fallback
    const tries = this.getContentTypeTries();
    let lastErr;

    for (let i = 0; i < tries.length; i++) {
      const ct = tries[i];
      try {
        return await this.postWithContentType(ct, path, body);
      } catch (e) {
        lastErr = e;
        // only retry on explicit wrong sign
        const msg = String(e?.message || "");
        const isWrongSign = msg.includes("wrong sign") || msg.includes('"wrong sign"');
        if (!isWrongSign || i === tries.length - 1) throw e;
      }
    }
    throw lastErr || new Error("Request failed");
  }

  getContentTypeTries() {
    if (this.mode === "withCharset") return [CT_WITH_CHARSET];
    if (this.mode === "noCharset") return [CT_NO_CHARSET];
    // auto
    return [CT_WITH_CHARSET, CT_NO_CHARSET];
  }

  async postWithContentType(contentType, path, body) {
    const canonicalizedResource = path.startsWith("/") ? path : `/${path}`;
    const jsonBody = stableStringify(body ?? {});
    const contentMd5 = this.computeContentMd5(jsonBody);
    const date = this.gmtNowString();

    const signPayload = [
      "POST",
      contentMd5,
      contentType,
      date,
      canonicalizedResource
    ].join("\n");

    const sign = this.hmacSha1Base64(this.opt.apiSecret, signPayload);
    const authorization = `API ${this.opt.apiId}:${sign}`;

    if (this.debugSigning) {
      // Do NOT log apiSecret; safe to log payload + md5 + date + resource.
      // Note: Sign is derived from secret; logging it may be ok but we keep it out for safety.
      // eslint-disable-next-line no-console
      console.debug(`[soliscloudv2] signing debug ct="${contentType}" md5="${contentMd5}" date="${date}" res="${canonicalizedResource}" payload="${signPayload.replace(/\n/g, "\\n")}"`);
    }

    const res = await this.http.post(canonicalizedResource, jsonBody, {
      headers: {
        "Content-MD5": contentMd5,
        "Content-Type": contentType,
        "Date": date,
        "Authorization": authorization
      }
    });

    if (res.status >= 400) {
      throw new Error(`SolisCloud HTTP ${res.status}: ${typeof res.data === "string" ? res.data : JSON.stringify(res.data)}`);
    }

    const data = res.data;
    if (data && data.success === false) {
      throw new Error(`SolisCloud API error code=${data.code} msg=${data.msg}`);
    }
    return data;
  }

  computeContentMd5(body) {
    const md5 = crypto.createHash("md5").update(body, "utf8").digest();
    return md5.toString("base64");
  }

  hmacSha1Base64(secret, payload) {
    const h = crypto.createHmac("sha1", secret).update(payload, "utf8").digest();
    return h.toString("base64");
  }

  gmtNowString() {
    // Doc format: "EEE, d MMM yyyy HH:mm:ss 'GMT'" (Locale.US, GMT), day without leading zero fileciteturn1file0
    const d = new Date();
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dow = days[d.getUTCDay()];
    const day = String(d.getUTCDate()); // no pad
    const mon = months[d.getUTCMonth()];
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${dow}, ${day} ${mon} ${yyyy} ${hh}:${mm}:${ss} GMT`;
  }
}

module.exports = { SolisCloudClient };

