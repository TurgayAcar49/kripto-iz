// Mail parsing and crypto-project detection. Runs in browsers, workers and Node 18+.
// Mail text is handled as "binary strings" (one char per raw byte) until the
// declared charset of each part is known.

const MAX_MESSAGE_BYTES = 300_000;

export function bytesToBinary(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return s;
}

function binaryToBytes(s) {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytes;
}

export async function* splitMbox(chunks) {
  let carry = '';
  let lines = [];
  let size = 0;
  let prevBlank = true;

  function* take(line) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (prevBlank && line.startsWith('From ')) {
      if (lines.length) yield lines.join('\n');
      lines = [];
      size = 0;
      prevBlank = false;
      return;
    }
    prevBlank = line === '';
    if (size < MAX_MESSAGE_BYTES) {
      lines.push(line);
      size += line.length + 1;
    }
  }

  for await (const chunk of chunks) {
    const parts = (carry + bytesToBinary(chunk)).split('\n');
    carry = parts.pop();
    for (const line of parts) yield* take(line);
  }
  if (carry) yield* take(carry);
  if (lines.length) yield lines.join('\n');
}

export function emlToRaw(bytes) {
  return bytesToBinary(bytes.subarray(0, MAX_MESSAGE_BYTES)).replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------- parsing

export function parseMessage(raw) {
  const { headers, body } = splitHeaders(raw);
  const { name, email } = parseAddress(headerText(headers['from']));
  return {
    fromName: name,
    fromEmail: email,
    domain: email.split('@')[1] || '',
    subject: headerText(headers['subject']),
    date: parseDate(headers['date']),
    text: extractText(headers, body).slice(0, 20_000),
  };
}

function splitHeaders(raw) {
  if (raw.startsWith('\n')) return { headers: {}, body: raw.slice(1) };
  const idx = raw.indexOf('\n\n');
  const head = idx === -1 ? raw : raw.slice(0, idx);
  const body = idx === -1 ? '' : raw.slice(idx + 2);
  const headers = {};
  let current = null;
  for (const line of head.split('\n')) {
    if (/^[ \t]/.test(line)) {
      if (current) headers[current] += ' ' + line.trim();
      continue;
    }
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key in headers) {
      current = null;
    } else {
      headers[key] = m[2];
      current = key;
    }
  }
  return { headers, body };
}

function extractText(headers, body, depth = 0) {
  const ctype = headers['content-type'] || 'text/plain';
  const type = ctype.split(';')[0].trim().toLowerCase();

  if (type.startsWith('multipart/')) {
    const boundary = getParam(ctype, 'boundary');
    if (!boundary || depth > 5) return '';
    const texts = [];
    for (const part of body.split('--' + boundary).slice(1)) {
      if (part.startsWith('--')) break;
      const p = splitHeaders(part.replace(/^[^\n]*\n/, ''));
      const t = extractText(p.headers, p.body, depth + 1);
      if (t) texts.push(t);
      if (type === 'multipart/alternative' && t) break;
    }
    return texts.join('\n');
  }

  if (type !== 'text/plain' && type !== 'text/html') return '';

  const cte = (headers['content-transfer-encoding'] || '').trim().toLowerCase();
  let bin = body;
  if (cte === 'base64') bin = base64ToBinary(body);
  else if (cte === 'quoted-printable') bin = qpToBinary(body);

  const text = decodeBinary(bin, getParam(ctype, 'charset') || 'utf-8');
  return type === 'text/html' ? htmlToText(text) : text;
}

function getParam(header, name) {
  const m = header.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
}

function base64ToBinary(s) {
  let clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  // A truncated message can leave a lone trailing char, which atob rejects.
  if (clean.length % 4 === 1) clean = clean.slice(0, -1);
  try {
    return atob(clean);
  } catch {
    return '';
  }
}

function qpToBinary(s) {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBinary(bin, charset) {
  let label = String(charset).trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (label === 'utf8') label = 'utf-8';
  try {
    return new TextDecoder(label).decode(binaryToBytes(bin));
  } catch {
    return bin;
  }
}

function headerText(value) {
  if (!value) return '';
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(binaryToBytes(value));
  } catch {
    text = value;
  }
  return text
    .replace(/(\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, enc, data) => {
      const bin = enc.toUpperCase() === 'B' ? base64ToBinary(data) : qpToBinary(data.replace(/_/g, ' '));
      return decodeBinary(bin, charset);
    })
    .trim();
}

function parseAddress(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const email = (from.match(/[\w.+-]+@[\w.-]+/) || [''])[0].toLowerCase();
  return { name: '', email };
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function codePoint(n) {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
}

function htmlToText(html) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(Number(d)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

// ---------------------------------------------------------------- detection

export const EXCHANGES = {
  'binance.com': 'Binance',
  'binance.tr': 'Binance TR',
  'okx.com': 'OKX',
  'bybit.com': 'Bybit',
  'coinbase.com': 'Coinbase',
  'kraken.com': 'Kraken',
  'kucoin.com': 'KuCoin',
  'gate.io': 'Gate',
  'mexc.com': 'MEXC',
  'bitget.com': 'Bitget',
  'htx.com': 'HTX',
  'bingx.com': 'BingX',
  'crypto.com': 'Crypto.com',
  'btcturk.com': 'BtcTurk',
  'paribu.com': 'Paribu',
  'bitlo.com': 'Bitlo',
  'icrypex.com': 'Icrypex',
};

// Email-login wallet providers send mail on behalf of many different apps,
// so their mails are grouped by app name instead of by sender domain.
export const WALLET_PROVIDERS = {
  'privy.io': 'Privy',
  'magic.link': 'Magic',
  'web3auth.io': 'Web3Auth',
  'dynamic.xyz': 'Dynamic',
  'dynamicauth.com': 'Dynamic',
  'thirdweb.com': 'thirdweb',
  'particle.network': 'Particle',
  'turnkey.com': 'Turnkey',
  'getpara.com': 'Para',
  'capsule.xyz': 'Capsule',
};

// Crypto media and newsletter platforms: crypto-heavy text, but no user funds.
const NEWS = new Set([
  'decrypt.co', 'cointelegraph.com', 'coindesk.com', 'theblock.co', 'theblockcrypto.com',
  'bankless.com', 'messari.io', 'cryptoslate.com', 'blockworks.co', 'thedefiant.io',
  'milkroad.com', 'coingecko.com', 'coinmarketcap.com', 'cryptopanic.com', 'dlnews.com',
  'beincrypto.com', 'u.today', 'substack.com', 'beehiiv.com', 'medium.com', 'mirror.xyz',
  'paragraph.xyz', 'paragraph.com', 'mailchimp.com', 'convertkit.com', 'kit.com',
]);

const PERSONAL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com',
  'icloud.com', 'me.com', 'yandex.com', 'proton.me', 'protonmail.com', 'mail.ru',
]);

const IGNORE = new Set([
  'google.com', 'youtube.com', 'apple.com', 'microsoft.com', 'facebookmail.com',
  'linkedin.com', 'amazon.com', 'paypal.com',
]);

const SIGNALS = [
  { re: /\b(crypto|kripto|blockchain|on-?chain|web3|defi|dapp)\b/i, w: 2 },
  { re: /\b(wallet|cüzdan)/i, w: 2 },
  { re: /\b(token|swap|bridge|nft|mint(ed|ing)?|airdrop|whitelist|allowlist)\b/i, w: 2 },
  { re: /\b(ETH|BTC|USDC|USDT|SOL|HYPE|BNB|WETH|stablecoin)\b/, w: 1 },
  { re: /\b(deposit(ed)?|yatırma|yatırıldı)/i, w: 2, tag: 'deposit' },
  { re: /\b(liquidity|likidite|LP token|liquidity pool)/i, w: 2, tag: 'likidite' },
  { re: /\b(stak(e|ed|ing)|restak(e|ing))\b/i, w: 2, tag: 'stake' },
  { re: /\b(vault|yield|APY|APR)\b/i, w: 2, tag: 'vault' },
  { re: /(withdraw|çekim|çekme talebi)/i, w: 1, tag: 'çekim' },
  { re: /\bairdrop/i, w: 1, tag: 'airdrop' },
  { re: /\b(testnet|faucet|devnet)\b/i, w: 2, tag: 'testnet' },
  { re: /\b(points?|season|leaderboard|referral)\b/i, w: 1, tag: 'puan' },
  { re: /\b(seed phrase|recovery phrase|private key|gizli anahtar)/i, w: 2, tag: 'anahtar' },
  { re: /(login|sign[- ]?in|verification|one-time|doğrulama|giriş)\s*(code|kod)/i, w: 1, tag: 'giriş' },
];

const CRYPTO_TLDS = new Set([
  'xyz', 'fi', 'finance', 'network', 'exchange', 'money', 'trade', 'markets', 'protocol',
  'capital', 'cash', 'eth', 'sol', 'gg', 'so', 'wtf', 'fun',
]);
const CRYPTO_NAME = /(swap|dex|defi|chain|labs|protocol|dao|coin|token|wallet|stake|yield|bridge|vault|hyper|sol|eth|btc|nft|onchain|web3|perp|lend)/i;

const MIN_SCORE = 5;

const EVM_ADDR = /\b0x[a-fA-F0-9]{40}\b/g;
const TX_HASH = /\b0x[a-fA-F0-9]{64}\b/g;
const SOL_NEAR_KEYWORD =
  /(?:[Ww]allet|WALLET|[Aa]ddress|ADDRESS|[Aa]dres|[Cc]üzdan)\W{0,20}([1-9A-HJ-NP-Za-km-z]{32,44})(?![1-9A-HJ-NP-Za-km-z])/g;

export function rootDomain(domain) {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'gen'].includes(sld)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

export function analyze(msg) {
  const root = rootDomain(msg.domain);
  if (!root || PERSONAL.has(root) || IGNORE.has(root)) return null;

  const hay = `${msg.subject}\n${msg.text}`;
  let score = 0;
  const tags = new Set();
  for (const s of SIGNALS) {
    if (s.re.test(hay)) {
      score += s.w;
      if (s.tag) tags.add(s.tag);
      if (s.re.test(msg.subject)) score += 1;
    }
  }

  const addresses = new Set(
    [...hay.matchAll(EVM_ADDR)].map((m) => m[0].toLowerCase()).filter((a) => !/^0x0+$/.test(a)),
  );
  for (const m of hay.matchAll(SOL_NEAR_KEYWORD)) addresses.add(m[1]);
  const txs = new Set([...hay.matchAll(TX_HASH)].map((m) => m[0].toLowerCase()));

  if (EXCHANGES[root] || WALLET_PROVIDERS[root]) score += 5;
  if (CRYPTO_TLDS.has(root.split('.').pop())) score += 3;
  if (CRYPTO_NAME.test(root.split('.')[0])) score += 2;
  if (addresses.size) score += 3;
  if (txs.size) score += 3;
  if (score < MIN_SCORE) return null;

  return { identity: identify(msg, root), msg, tags: [...tags], addresses: [...addresses], txs: [...txs], score };
}

function identify(msg, root) {
  if (WALLET_PROVIDERS[root]) {
    const provider = WALLET_PROVIDERS[root];
    const app = appNameFromProviderMail(msg) || provider;
    return { key: `${root}:${app.toLowerCase()}`, name: app, domain: '', provider, type: 'gömülü cüzdan' };
  }
  if (EXCHANGES[root]) {
    return { key: root, name: EXCHANGES[root], domain: root, provider: '', type: 'borsa' };
  }
  const label = root.split('.')[0];
  const name = label.charAt(0).toUpperCase() + label.slice(1);
  return { key: root, name, domain: root, provider: '', type: NEWS.has(root) ? 'bülten' : 'proje' };
}

function appNameFromProviderMail(msg) {
  const generic = /privy|magic|web3auth|dynamic|thirdweb|particle|turnkey|para\b|capsule|no-?reply|support|team|info/i;
  if (msg.fromName && !generic.test(msg.fromName)) return msg.fromName.trim();
  const m = msg.subject.match(/\b(?:for|to|on|into|için)\s+(\S.{0,40}?)\s*[!.]?$/i);
  return m ? m[1].trim() : '';
}

// ---------------------------------------------------------------- aggregation

const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');

export function createScanner() {
  const projects = new Map();
  let total = 0;
  let matched = 0;

  function add(raw) {
    total++;
    let result;
    try {
      result = analyze(parseMessage(raw));
    } catch {
      return;
    }
    if (!result) return;
    matched++;

    const { identity, msg, tags, addresses, txs } = result;
    let p = projects.get(identity.key);
    if (!p) {
      p = {
        ...identity,
        count: 0,
        firstDate: null,
        lastDate: null,
        tags: new Set(),
        senders: new Set(),
        addresses: new Map(),
        txs: new Set(),
        mails: [],
      };
      projects.set(identity.key, p);
    }

    p.count++;
    if (msg.date) {
      if (!p.firstDate || msg.date < p.firstDate) p.firstDate = msg.date;
      if (!p.lastDate || msg.date > p.lastDate) p.lastDate = msg.date;
    }
    tags.forEach((t) => p.tags.add(t));
    if (msg.fromName && p.senders.size < 5) p.senders.add(msg.fromName);
    for (const a of addresses) p.addresses.set(a, (p.addresses.get(a) || 0) + 1);
    for (const t of txs) if (p.txs.size < 20) p.txs.add(t);
    p.mails.push({ date: msg.date, subject: msg.subject });
    if (p.mails.length > 40) {
      p.mails.sort(byDateDesc);
      p.mails.length = 20;
    }
  }

  function result() {
    const list = [...projects.values()].map((p) => ({
      ...p,
      tags: [...p.tags],
      senders: [...p.senders],
      addresses: [...p.addresses]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([address, count]) => ({ address, count })),
      txs: [...p.txs],
      mails: p.mails.sort(byDateDesc).slice(0, 10),
    }));
    list.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
    return { total, matched, projects: list };
  }

  return { add, result, get total() { return total; }, get matched() { return matched; } };
}
