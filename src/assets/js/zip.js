/* Serein · 极简 zip 读写
 *
 * 只服务自己的备份格式：manifest.json 用 deflate 压缩，图片按原样存储（store）。
 * 不追求通用解压器，但会校验签名、CRC 和尺寸，损坏时抛错而不是写坏数据。
 */

import { t } from './i18n.js';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    value = CRC_TABLE[(value ^ bytes[i]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function concat(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function dosDateTime(date = new Date()) {
  return {
    time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31),
    date: (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31),
  };
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {{name: string, data: Uint8Array, store?: boolean}[]} entries
 * @returns {Promise<Blob>}
 */
export async function createZip(entries) {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = entry.data;
    let method = 0;
    let data = raw;
    if (!entry.store) {
      const compressed = await deflateRaw(raw);
      // 压缩反而更大时退回 store，避免小文件越压越大
      if (compressed && compressed.length < raw.length) {
        method = 8;
        data = compressed;
      }
    }
    const crc = crc32(raw);

    const local = concat([
      new Uint8Array(u32(LOCAL_SIG)),
      new Uint8Array(u16(20)),
      new Uint8Array(u16(UTF8_FLAG)),
      new Uint8Array(u16(method)),
      new Uint8Array(u16(time)),
      new Uint8Array(u16(date)),
      new Uint8Array(u32(crc)),
      new Uint8Array(u32(data.length)),
      new Uint8Array(u32(raw.length)),
      new Uint8Array(u16(name.length)),
      new Uint8Array(u16(0)),
      name,
      data,
    ]);

    centralParts.push(
      concat([
        new Uint8Array(u32(CENTRAL_SIG)),
        new Uint8Array(u16(20)),
        new Uint8Array(u16(20)),
        new Uint8Array(u16(UTF8_FLAG)),
        new Uint8Array(u16(method)),
        new Uint8Array(u16(time)),
        new Uint8Array(u16(date)),
        new Uint8Array(u32(crc)),
        new Uint8Array(u32(data.length)),
        new Uint8Array(u32(raw.length)),
        new Uint8Array(u16(name.length)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u16(0)),
        new Uint8Array(u32(0)),
        new Uint8Array(u32(offset)),
        name,
      ])
    );

    localParts.push(local);
    offset += local.length;
  }

  const central = concat(centralParts);
  const eocd = concat([
    new Uint8Array(u32(EOCD_SIG)),
    new Uint8Array(u16(0)),
    new Uint8Array(u16(0)),
    new Uint8Array(u16(entries.length)),
    new Uint8Array(u16(entries.length)),
    new Uint8Array(u32(central.length)),
    new Uint8Array(u32(offset)),
    new Uint8Array(u16(0)),
  ]);

  return new Blob([concat([...localParts, central, eocd])], { type: 'application/zip' });
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEocd(view) {
  const min = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIG) return offset;
  }
  return -1;
}

/**
 * @param {Blob|ArrayBuffer|Uint8Array} source
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function readZip(source) {
  const bytes =
    source instanceof Uint8Array
      ? source
      : new Uint8Array(source instanceof Blob ? await source.arrayBuffer() : source);
  if (bytes.length < 22) throw new Error(t('文件太短，不是有效的备份'));
  const view = viewOf(bytes);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error(t('找不到 zip 目录，文件可能已损坏'));

  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (centralOffset >= bytes.length) throw new Error(t('zip 目录偏移越界'));

  const decoder = new TextDecoder();
  const out = new Map();
  let cursor = centralOffset;

  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length) throw new Error(t('zip 目录被截断'));
    if (view.getUint32(cursor, true) !== CENTRAL_SIG) throw new Error(t('zip 目录签名错误'));
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compSize = view.getUint32(cursor + 20, true);
    const rawSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
    cursor += 46 + nameLen + extraLen + commentLen;

    if (localOffset + 30 > bytes.length) throw new Error(t('条目 {name} 的本地头越界', { name }));
    if (view.getUint32(localOffset, true) !== LOCAL_SIG) throw new Error(t('条目 {name} 的本地头签名错误', { name }));
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > bytes.length) throw new Error(t('条目 {name} 的数据越界', { name }));

    const raw = bytes.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(t('条目 {name} 使用了不支持的压缩方式 {method}', { name, method }));

    if (data.length !== rawSize) throw new Error(t('条目 {name} 的解压尺寸不符', { name }));
    if (crc !== crc32(data)) throw new Error(t('条目 {name} 的校验和不符', { name }));
    out.set(name, data);
  }

  return out;
}
