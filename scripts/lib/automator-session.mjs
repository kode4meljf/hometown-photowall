import WebSocket from 'ws';
import automator from 'miniprogram-automator';

const PROJECT = '/Users/kode4meljf/.qclaw/workspace/hometown-photowall/miniprogram';
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const WS_PORTS = [24956, 9420, 13656];

export async function probeWsPort(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const t = setTimeout(() => { ws.terminate(); resolve(false); }, timeoutMs);
    ws.on('open', () => { clearTimeout(t); ws.close(); resolve(true); });
    ws.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

export async function findWsEndpoint() {
  for (const port of WS_PORTS) {
    if (await probeWsPort(port)) return `ws://127.0.0.1:${port}`;
  }
  return null;
}

export async function connectOrLaunch(options = {}) {
  const { preferLaunch = false, timeout = 180000 } = options;
  if (!preferLaunch) {
    const ws = await findWsEndpoint();
    if (ws) {
      const mp = await automator.connect({ wsEndpoint: ws });
      return { mp, mode: 'connect', ws };
    }
  }
  const mp = await automator.launch({
    projectPath: PROJECT,
    cliPath: CLI,
    trustProject: true,
    timeout,
  });
  return { mp, mode: 'launch', ws: null };
}

export async function safeClose(mp) {
  if (!mp) return;
  try { await mp.close(); } catch (_) { /* ignore */ }
}

export function isConnectionError(err) {
  const msg = err?.message || String(err);
  return /connection closed|ECONNRESET|WebSocket|http port|devTools/i.test(msg);
}
