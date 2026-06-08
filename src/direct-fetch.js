import https from "node:https";
import dns from "node:dns/promises";

async function resolveRealIP(hostname) {
  try {
    const resolver = new dns.Resolver();
    resolver.setServers(['223.5.5.5', '8.8.8.8']);
    const addresses = await resolver.resolve4(hostname);
    return addresses[0];
  } catch {
    return null;
  }
}

export function createDirectFetch(localAddress) {
  return async (url, options = {}) => {
    const { method = 'GET', headers = {}, body } = options;
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    let targetIP = hostname;
    if (localAddress) {
      const realIP = await resolveRealIP(hostname);
      if (realIP) targetIP = realIP;
      if (process.env.WIKI_DEBUG) {
        console.error(`[direct-fetch] ${hostname} -> ${targetIP} via localAddress=${localAddress}`);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const cleanHeaders = {};
        if (headers instanceof Headers) {
          headers.forEach((value, key) => { cleanHeaders[key] = value; });
        } else {
          Object.assign(cleanHeaders, headers);
        }
        const hasHeader = (name) =>
          Object.keys(cleanHeaders).some(k => k.toLowerCase() === name);
        if (!hasHeader('host')) cleanHeaders['Host'] = hostname;
        if (body && !hasHeader('content-length')) {
          cleanHeaders['Content-Length'] = Buffer.byteLength(body);
        }

        if (process.env.WIKI_DEBUG) {
          const bodyInfo = body == null
            ? 'null'
            : typeof body === 'string'
              ? `string(${Buffer.byteLength(body)}): ${body.slice(0, 300)}`
              : `${body.constructor?.name || typeof body}`;
          console.error(`[direct-fetch] ${method} ${parsedUrl.pathname}${parsedUrl.search}`);
          console.error(`[direct-fetch] headers:`, cleanHeaders);
          console.error(`[direct-fetch] body: ${bodyInfo}`);
        }

        const reqOptions = {
          hostname: targetIP,
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers: cleanHeaders,
          family: 4,
          timeout: 300000,
          servername: hostname,
          ...(localAddress ? { localAddress } : {})
        };

        const req = https.request(reqOptions, (res) => {
          if (process.env.WIKI_DEBUG) {
            console.error(`[direct-fetch] response ${res.statusCode} from ${targetIP}`);
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            const str = buf.toString();
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage || '',
              headers: new Headers(res.headers),
              text: () => Promise.resolve(str),
              json: () => Promise.resolve(JSON.parse(str)),
              arrayBuffer: () => Promise.resolve(new Uint8Array(buf).buffer),
              body: new ReadableStream({
                start(controller) {
                  controller.enqueue(buf);
                  controller.close();
                }
              })
            });
          });
        });

        req.on("socket", (socket) => {
          if (process.env.WIKI_DEBUG) {
            socket.on("connect", () => console.error(`[direct-fetch] TCP connected to ${targetIP}`));
            socket.on("secureConnect", () => console.error(`[direct-fetch] TLS handshake done`));
          }
        });
        req.on("error", (err) => {
          if (process.env.WIKI_DEBUG) console.error(`[direct-fetch] error: ${err.message}`);
          reject(err);
        });
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timed out (300s)"));
        });

        if (body) req.write(body);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  };
}
