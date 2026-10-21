// 双人播客语音合成：按说话人把对谈稿切成若干段，逐段调用 TTS，按顺序拼接成一个 mp3。
import { execFile } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { TTS } from '../config/models.mjs';
import { record } from './llm.mjs';

/** 合并同一说话人的连续台词，减少调用次数；单段不超过 1500 字。 */
export function toTurns(script) {
  const turns = [];
  for (const seg of script.segments || []) {
    for (const l of seg.lines || []) {
      const text = String(l.text || '').trim();
      if (!text) continue;
      const last = turns.at(-1);
      if (last && last.speaker === l.speaker && [...last.text].length + [...text].length < 1500) last.text += text;
      else turns.push({ speaker: l.speaker === 'B' ? 'B' : 'A', text });
    }
  }
  return turns;
}

// MPEG1/2 Layer III 码率表（kbps）与采样率表
const BITRATES = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

/**
 * 去掉每段音频的 ID3 标签和开头的 Xing/Info 帧。否则多段拼接后，播放器会按第一段的文件头显示总时长。
 * 去掉后整条音频是纯 CBR 帧流，播放器按码率推算时长。
 */
export function stripMp3(buf) {
  let i = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    i = 10 + (((buf[6] & 127) << 21) | ((buf[7] & 127) << 14) | ((buf[8] & 127) << 7) | (buf[9] & 127));
  }
  while (i < buf.length - 4 && !(buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0)) i++;
  const h = buf.readUInt32BE(i);
  const ver = (h >> 19) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const v = ver === 3 ? 1 : ver === 2 ? 2 : 25;
  const kbps = BITRATES[v === 1 ? 1 : 2][(h >> 12) & 15];
  const rate = RATES[v][(h >> 10) & 3];
  const pad = (h >> 9) & 1;
  const frameLen = rate ? Math.floor(((v === 1 ? 144 : 72) * kbps * 1000) / rate) + pad : 0;
  if (frameLen > 0 && /Xing|Info/.test(buf.toString('latin1', i, i + Math.min(frameLen, 200)))) i += frameLen;
  return buf.subarray(i);
}

// 整个进程共用的并发上限：worker 可能同时跑几个播客任务，TokenHub 对并发有限制（约 5 个），超了直接返回 429
let active = 0;
const waiting = [];
async function withSlot(fn) {
  if (active >= TTS.concurrency) await new Promise(r => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

export async function speak(text, voice, book) {
  const key = process.env[TTS.keyEnv];
  if (!key) throw new Error(`缺少环境变量 ${TTS.keyEnv}`);
  let lastErr;
  for (let attempt = 0; attempt < 7; attempt++) {
    const t0 = Date.now();
    try {
      const res = await withSlot(() => fetch(TTS.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: TTS.model,
          text,
          voice_setting: { voice_id: voice, speed: TTS.speed },
          audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 64000, channel: 1 },
          output_format: 'hex',
        }),
      }));
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.data?.audio && j.base_resp?.status_code === 0) {
        const chars = j.extra_info?.usage_characters || [...text].length * 2;
        await record({ task: 'tts', book, alias: 'tts', model: TTS.model, ms: Date.now() - t0, cost: chars / 10000 * TTS.pricePer10k, inputTokens: 0, outputTokens: 0, cachedTokens: 0, chars });
        return { audio: Buffer.from(j.data.audio, 'hex'), ms: j.extra_info?.audio_length || 0, chars };
      }
      lastErr = new Error(`语音合成失败 ${res.status}：${JSON.stringify(j.base_resp || j).slice(0, 200)}`);
      if (res.status < 500 && res.status !== 429 && j.base_resp?.status_code !== 1002) break;
    } catch (e) { lastErr = e; }
    // 1.5s、3s、6s、12s、20s、20s，加一点随机，避免几个请求同时重试又撞上
    await new Promise(r => setTimeout(r, Math.min(20e3, 1500 * 2 ** attempt) + Math.random() * 1000));
  }
  throw lastErr;
}

/**
 * @returns {Promise<{file:string, durationMs:number, chars:number, cost:number, turns:number}>}
 */
export async function synthesizePodcast(script, outFile, { book = '', author = '', id = '', onProgress } = {}) {
  const turns = toTurns(script);
  if (!turns.length) throw new Error('播客稿为空');
  const parts = new Array(turns.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(TTS.concurrency, turns.length) }, async () => {
    while (next < turns.length) {
      const i = next++;
      parts[i] = await speak(turns[i].text, turns[i].speaker === 'B' ? TTS.voiceB : TTS.voiceA, book);
      onProgress?.(++done, turns.length);
    }
  }));
  await mkdir(dirname(outFile), { recursive: true });
  // 先写临时文件再转码替换，重新配音时旧音频在成功前一直可听
  const raw = `${outFile}.raw.mp3`;
  await writeFile(raw, Buffer.concat(parts.map(p => stripMp3(p.audio))));
  await compressMp3(raw, outFile, { title: book, author, id });
  const chars = parts.reduce((n, p) => n + p.chars, 0);
  return { file: outFile, durationMs: parts.reduce((n, p) => n + p.ms, 0), chars, cost: chars / 10000 * TTS.pricePer10k, turns: turns.length };
}

/**
 * 用 ffmpeg 转成单声道 CBR（默认 64kbps，语音足够清晰，文件约为 128kbps 的一半），并写入准确的时长信息。
 * 同时做响度标准化：语音合成出来只有约 -32 LUFS，手机外放偏小，统一到播客常用的 -16 LUFS。
 * 没有 ffmpeg 或转码失败时直接用原文件。PODCAST_BITRATE=0 关闭转码，PODCAST_LUFS=0 关闭响度标准化。
 */
export async function compressMp3(src, dst, tags = {}) {
  const kbps = process.env.PODCAST_BITRATE ?? '64';
  const tmp = `${dst}.tmp.mp3`;
  if (kbps !== '0') {
    try {
      const af = await loudnormFilter(src);
      await promisify(execFile)('ffmpeg', ['-y', '-v', 'error', '-i', src, ...(af ? ['-af', af] : []), '-ac', '1', '-ar', '32000', '-b:a', `${kbps}k`, '-map_metadata', '-1', ...aigcTags(tags), tmp], { timeout: 300000 });
      await rename(tmp, dst);
      if (src !== dst) await rm(src, { force: true });
      return true;
    } catch (e) {
      await rm(tmp, { force: true });
      console.warn(`播客转码失败，使用原始音频：${e.message.slice(0, 120)}`);
    }
  }
  if (src !== dst) await rename(src, dst);
  return false;
}

/**
 * 两遍法响度标准化的第二遍参数：先测出整条音频的响度，再按测量值做线性增益（不压缩动态，听感和原来一样只是变响）。
 * 增益会让峰值超过上限时，loudnorm 会自动改用动态模式。测量失败时返回 null，不做标准化。
 */
export async function loudnormFilter(src) {
  const target = Number(process.env.PODCAST_LUFS ?? -16);
  if (!target) return null;
  const base = `loudnorm=I=${target}:TP=-1.5:LRA=11`;
  try {
    const { stderr } = await promisify(execFile)('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', `${base}:print_format=json`, '-f', 'null', '-'], { timeout: 300000, maxBuffer: 16 << 20 });
    const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{')));
    return `${base}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  } catch (e) {
    console.warn(`响度测量失败，不做标准化：${e.message.slice(0, 120)}`);
    return null;
  }
}

/**
 * AI 生成内容的隐式标识（《人工智能生成合成内容标识办法》）：写进 MP3 的 ID3 标签。
 * AIGC 字段参照 GB 45438-2025 的元数据格式；节目开头的口播是显式标识。
 * @param {{title?:string, author?:string, id?:string}} t
 */
export function aigcTags({ title = '', author = '', id = '' } = {}) {
  const aigc = { Label: '1', ContentProducer: process.env.AIGC_PRODUCER || new URL(process.env.SITE_URL || 'https://readwise.waywise.tech').host, ProduceID: id || title };
  return ['-id3v2_version', '3',
    '-metadata', `title=${title ? `《${title}》双人播客` : '双人播客'}`,
    '-metadata', `artist=${author ? `ReadWise · ${author}` : 'ReadWise'}`,
    '-metadata', 'album=ReadWise',
    '-metadata', 'comment=本节目由 AI 生成，内容可能有误，不能替代阅读原书',
    '-metadata', `AIGC=${JSON.stringify(aigc)}`];
}

/** 给已有的播客文件补写标识，不重新编码 */
export async function tagMp3(file, tags) {
  const tmp = `${file}.tag.mp3`;
  try {
    await promisify(execFile)('ffmpeg', ['-y', '-v', 'error', '-i', file, '-map', '0:a', '-c', 'copy', '-map_metadata', '-1', ...aigcTags(tags), tmp], { timeout: 120000 });
    await rename(tmp, file);
    return true;
  } catch (e) {
    await rm(tmp, { force: true });
    console.warn(`写入播客标识失败：${e.message.slice(0, 120)}`);
    return false;
  }
}
