// lib/fast/fetchRegShoFtp.ts
// Node-only FTP pull of the Nasdaq Trader Reg SHO file. HTTPS is Imperva-blocked
// from datacenters; ftp.nasdaqtrader.com still serves the daily list.

import { Socket } from 'node:net';
import {
  candidateRegShoTradeDates,
  parseRegShoFile,
} from './fetchRegSho';
import type { RegShoListing } from './types';

const FTP_HOST = 'ftp.nasdaqtrader.com';
const FTP_PATH = '/SymbolDirectory/regsho';

function compactYmd(ymd: string): string {
  return ymd.replaceAll('-', '');
}

class ControlChannel {
  private buf = '';
  constructor(private socket: Socket) {}

  async line(): Promise<string> {
    while (true) {
      const idx = this.buf.indexOf('\n');
      if (idx !== -1) {
        const line = this.buf.slice(0, idx).replace(/\r$/, '');
        this.buf = this.buf.slice(idx + 1);
        return line;
      }
      const chunk = await new Promise<Buffer>((resolve, reject) => {
        const onData = (c: Buffer) => {
          this.socket.off('error', onErr);
          resolve(c);
        };
        const onErr = (err: Error) => {
          this.socket.off('data', onData);
          reject(err);
        };
        this.socket.once('data', onData);
        this.socket.once('error', onErr);
      });
      this.buf += chunk.toString('utf8');
    }
  }

  async reply(): Promise<{ code: number; text: string }> {
    let first = await this.line();
    const code = Number(first.slice(0, 3));
    let text = first;
    if (first.charAt(3) === '-') {
      const end = `${first.slice(0, 3)} `;
      while (!first.startsWith(end)) {
        first = await this.line();
        text += `\n${first}`;
      }
    }
    return { code, text };
  }

  write(cmd: string) {
    this.socket.write(cmd);
  }
}

function parsePasv(reply: string): { host: string; port: number } {
  const epsv = reply.match(/\|(\d+)\|/);
  if (epsv) {
    return { host: FTP_HOST, port: Number(epsv[1]) };
  }
  const m = reply.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
  if (!m) throw new Error(`regsho ftp pasv ${reply}`);
  return {
    host: FTP_HOST,
    port: Number(m[5]) * 256 + Number(m[6]),
  };
}

function readUntilEnd(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.on('data', (c) => chunks.push(c));
    socket.on('error', reject);
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function ftpRetrieve(remotePath: string, timeoutMs: number): Promise<string> {
  const ctrl = new Socket();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.destroy();
  }, timeoutMs);
  try {
    await new Promise<void>((resolve, reject) => {
      ctrl.once('error', reject);
      ctrl.connect(21, FTP_HOST, resolve);
    });
    const ctrlChan = new ControlChannel(ctrl);
    const hello = await ctrlChan.reply();
    if (hello.code !== 220) throw new Error(`regsho ftp hello ${hello.code}`);

    ctrlChan.write('USER anonymous\r\n');
    const user = await ctrlChan.reply();
    if (user.code !== 331 && user.code !== 230) throw new Error(`regsho ftp user ${user.code}`);
    if (user.code === 331) {
      ctrlChan.write('PASS anonymous@\r\n');
      const pass = await ctrlChan.reply();
      if (pass.code !== 230 && pass.code !== 202) throw new Error(`regsho ftp pass ${pass.code}`);
    }

    ctrlChan.write('TYPE I\r\n');
    await ctrlChan.reply();
    ctrlChan.write('PASV\r\n');
    const pasv = await ctrlChan.reply();
    if (pasv.code !== 227 && pasv.code !== 229) throw new Error(`regsho ftp pasv ${pasv.code}`);
    const { host, port } = parsePasv(pasv.text);

    const data = new Socket();
    data.on('error', () => {});
    const dataBody = readUntilEnd(data);
    await new Promise<void>((resolve, reject) => {
      data.once('error', reject);
      data.connect(port, host, resolve);
    });

    ctrlChan.write(`RETR ${remotePath}\r\n`);
    const retr = await ctrlChan.reply();
    if (retr.code !== 150 && retr.code !== 125) {
      data.destroy();
      throw new Error(`regsho ftp retr ${retr.code}`);
    }
    const body = await dataBody;
    const done = await ctrlChan.reply();
    if (done.code !== 226 && done.code !== 250) {
      throw new Error(`regsho ftp done ${done.code}`);
    }
    ctrlChan.write('QUIT\r\n');
    return body;
  } catch (err) {
    if (timedOut) throw new Error('regsho ftp timeout');
    throw err;
  } finally {
    clearTimeout(timer);
    ctrl.destroy();
  }
}

export async function fetchRegShoFromFtp(): Promise<Map<string, RegShoListing>> {
  const dates = candidateRegShoTradeDates().slice(0, 4);
  // Newest HTTPS session files often hang on FTP; prefer the prior date first.
  const ordered = dates.length > 1 ? [dates[1], dates[0], ...dates.slice(2)] : dates;
  let lastErr: Error | null = null;
  for (const ymd of ordered) {
    const remotePath = `${FTP_PATH}/nasdaqth${compactYmd(ymd)}.txt`;
    try {
      const text = await ftpRetrieve(remotePath, 7000);
      return parseRegShoFile(text, ymd);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error('regsho ftp unavailable');
}
