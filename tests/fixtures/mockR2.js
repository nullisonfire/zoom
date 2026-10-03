/**
 * In-memory Mock R2 Bucket conforming to Cloudflare R2Bucket API.
 */
class MockR2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    let bodyBuffer;
    if (value instanceof ArrayBuffer) {
      bodyBuffer = Buffer.from(value);
    } else if (Buffer.isBuffer(value)) {
      bodyBuffer = value;
    } else if (typeof value === 'string') {
      bodyBuffer = Buffer.from(value);
    } else {
      bodyBuffer = Buffer.from(String(value));
    }

    const etag = `etag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const obj = {
      key,
      size: bodyBuffer.length,
      etag,
      httpEtag: `"${etag}"`,
      uploaded: new Date(),
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {},
      body: bodyBuffer,
      writeHttpMetadata(headers) {
        if (options.httpMetadata?.contentType) {
          headers.set('content-type', options.httpMetadata.contentType);
        }
        if (options.httpMetadata?.contentDisposition) {
          headers.set('content-disposition', options.httpMetadata.contentDisposition);
        }
        if (options.httpMetadata?.cacheControl) {
          headers.set('cache-control', options.httpMetadata.cacheControl);
        }
      },
    };

    this.objects.set(key, obj);
    return obj;
  }

  async get(key) {
    const obj = this.objects.get(key);
    if (!obj) return null;

    // Return R2ObjectBody clone
    return {
      ...obj,
      body: obj.body,
      async arrayBuffer() {
        return obj.body.buffer.slice(obj.body.byteOffset, obj.body.byteOffset + obj.body.byteLength);
      },
      async text() {
        return obj.body.toString('utf8');
      },
      async json() {
        return JSON.parse(obj.body.toString('utf8'));
      },
    };
  }

  async delete(key) {
    if (Array.isArray(key)) {
      key.forEach((k) => this.objects.delete(k));
    } else {
      this.objects.delete(key);
    }
  }

  async list(options = {}) {
    const prefix = options.prefix || '';
    const objects = [];
    for (const [k, v] of this.objects.entries()) {
      if (k.startsWith(prefix)) {
        objects.push(v);
      }
    }
    return { objects, truncated: false };
  }
}

module.exports = { MockR2Bucket };
