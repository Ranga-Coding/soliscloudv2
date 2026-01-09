"use strict";

const crypto = require("node:crypto");
const axios = require("axios");

class SolisCloudClient {
  constructor(opt) {
    this.opt = opt;
    this.http = axios.create({
      baseURL: String(opt.baseUrl || "").replace(/\/+$/, ""),
      timeout: opt.timeoutMs ?? 20000,
      headers: { "Content-Type": "application/json;charset=UTF-8" },
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
      "application/json;charset=UTF-8",
      date,
      canonicalizedResource
    ].join("\n");

    const sign = this.hmacSha1Base64(this.opt.apiSecret, signPayload);
    const authorization = `API ${this.opt.apiId}:${sign}`;

    const res = await this.http.post(canonicalizedResource, jsonBody, {
      headers: {
        "Content-MD5": contentMd5,
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
    return new Date().toUTCString().replace("UTC", "GMT");
  }
}

module.exports = { SolisCloudClient };
