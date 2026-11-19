// Gerador de ZIP mínimo (método "store", sem compressão), sem dependências externas.
// Suporta nomes UTF-8 (flag 0x0800) e ZIP64 não é necessário para os volumes esperados (< 4 GB).
(function (g) {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const d = date || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: time & 0xffff, day: day & 0xffff };
  }

  class ZipWriter {
    constructor() {
      this.parts = [];
      this.central = [];
      this.offset = 0;
      this.count = 0;
      this.enc = new TextEncoder();
      this.when = dosDateTime(new Date());
    }

    /** Adiciona um arquivo. `content` pode ser string ou Uint8Array. */
    add(path, content) {
      const name = this.enc.encode(path);
      const data = typeof content === 'string' ? this.enc.encode(content) : content;
      const crc = crc32(data);
      const size = data.length;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true); // versão necessária
      local.setUint16(6, 0x0800, true); // nomes em UTF-8
      local.setUint16(8, 0, true); // método: store
      local.setUint16(10, this.when.time, true);
      local.setUint16(12, this.when.day, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, this.when.time, true);
      cen.setUint16(14, this.when.day, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, size, true);
      cen.setUint32(24, size, true);
      cen.setUint16(28, name.length, true);
      cen.setUint16(30, 0, true);
      cen.setUint16(32, 0, true);
      cen.setUint16(34, 0, true);
      cen.setUint16(36, 0, true);
      cen.setUint32(38, 0, true);
      cen.setUint32(42, this.offset, true);

      this.parts.push(new Uint8Array(local.buffer), name, data);
      this.central.push(new Uint8Array(cen.buffer), name);
      this.offset += 30 + name.length + size;
      this.count++;
    }

    /** Retorna as partes binárias finais (para Blob ou concatenação). */
    finishParts() {
      const cdSize = this.central.reduce((a, p) => a + p.length, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(4, 0, true);
      end.setUint16(6, 0, true);
      end.setUint16(8, this.count, true);
      end.setUint16(10, this.count, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, this.offset, true);
      end.setUint16(20, 0, true);
      return [...this.parts, ...this.central, new Uint8Array(end.buffer)];
    }

    toBlob() {
      return new Blob(this.finishParts(), { type: 'application/zip' });
    }

    toUint8Array() {
      const parts = this.finishParts();
      const total = parts.reduce((a, p) => a + p.length, 0);
      const out = new Uint8Array(total);
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    }
  }

  g.WAX.zip = { ZipWriter, crc32 };
})(globalThis);
