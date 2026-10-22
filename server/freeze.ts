// Captures the job advert at the URL once, at first save, as historic evidence.
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export interface FrozenAdvert {
  bytes: Uint8Array;
  ext: "pdf" | "jpg" | "png" | "html";
  contentType: string;
  finalUrl: string;
}

function sniff(b: Uint8Array): "pdf" | "jpg" | "png" | null {
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

export async function freezeUrl(url: string): Promise<FrozenAdvert> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 JobHunterRecord/1.0",
        accept: "text/html,application/xhtml+xml,application/pdf,image/png,image/jpeg,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`the page responded with HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) throw new Error("the advert is larger than 25 MB");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("the page returned no content");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error("the advert is larger than 25 MB");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    if (total === 0) throw new Error("the page returned no content");
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const sniffed = sniff(bytes);
    let ext: FrozenAdvert["ext"];
    if (ct.includes("application/pdf") || sniffed === "pdf") ext = "pdf";
    else if (ct.includes("image/png") || sniffed === "png") ext = "png";
    else if (ct.includes("image/jpeg") || ct.includes("image/jpg") || sniffed === "jpg") ext = "jpg";
    else if (ct.includes("html") || ct.includes("text/") || ct === "") ext = "html";
    else throw new Error(`unsupported content type "${ct}" (expected PDF, JPEG, PNG or a web page)`);

    let out = bytes;
    if (ext === "html") {
      // Snapshot of the page as served, with a provenance header and a <base> so
      // relative links still point to the original site when viewed later.
      const text = new TextDecoder().decode(bytes);
      const stamp = `<!-- Frozen by Job Hunter (Record) on ${new Date().toISOString()} from ${
        res.url.replace(/--/g, "%2D%2D")
      } -->\n`;
      const base = `<base href="${res.url.replace(/"/g, "&quot;")}">`;
      const withBase = /<head[^>]*>/i.test(text)
        ? text.replace(/<head[^>]*>/i, (m) => `${m}${base}`)
        : `${base}${text}`;
      out = new TextEncoder().encode(stamp + withBase);
    }
    return {
      bytes: out,
      ext,
      contentType: ext === "html" ? "text/html" : ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : "png"}`,
      finalUrl: res.url,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("timed out after 20 seconds");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
