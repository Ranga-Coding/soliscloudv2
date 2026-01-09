"use strict";

const crypto = require("node:crypto");
const axios = require("axios");

// Must be EXACTLY identical in signature string and in HTTP header
const CONTENT_TYPE = "application/json;charset=UTF-8";

class SolisCloudClient {
  constructor(opt) {
    this.opt = opt;
    this.http = axios.create({
      baseURL: String(opt.baseUrl || "").replace(/\/+$/, ""),
      timeout: opt.timeoutMs ?? 20000,
      headers: { "Content-Type": CONTENT_TYPE },
      validateStatus: () => true
    });
  }

  async post(path, body = {}) {
    const canonicalizedResource = path.startsWith("/") ? path : `/${path}`;
    const jsonBody = JSON.stringify(body ?? {});
    const contentMd5 = this.computeContentMd5(jsonBody);
    const date = this.gmtNowString();

    const signPayload = [
      "POST",
      contentMd5,
      CONTENT_TYPE,
      date,
      canonicalizedResource
    ].join("\n");

    const sign = this.hmacSha1Base64(this.opt.apiSecret, signPayload);
    const authorization = `API ${this.opt.apiId}:${sign}`;

    const res = await this.http.post(canonicalizedResource, jsonBody, {
      headers: {
        "Content-MD5": contentMd5,
        "Content-Type": CONTENT_TYPE,
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
    // Solis doc format: "EEE, d MMM yyyy HH:mm:ss 'GMT'" (Locale.US, GMT), day without leading zero
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

