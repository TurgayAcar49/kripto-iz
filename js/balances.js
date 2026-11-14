export const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
export const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function detectKind(address) {
  if (EVM_RE.test(address)) return 'evm';
  if (SOLANA_RE.test(address)) return 'solana';
  return null;
}

const EVM_CHAINS = [
  {
    name: 'Ethereum', symbol: 'ETH', rpc: 'https://ethereum-rpc.publicnode.com',
    usdc: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  },
  {
    name: 'Base', symbol: 'ETH', rpc: 'https://base-rpc.publicnode.com',
    usdc: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  },
  {
    name: 'Arbitrum', symbol: 'ETH', rpc: 'https://arbitrum-one-rpc.publicnode.com',
    usdc: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  },
  {
    name: 'Optimism', symbol: 'ETH', rpc: 'https://optimism-rpc.publicnode.com',
    usdc: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
  },
  {
    name: 'Polygon', symbol: 'POL', rpc: 'https://polygon.drpc.org',
    usdc: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  },
  {
    name: 'BNB Chain', symbol: 'BNB', rpc: 'https://bsc-rpc.publicnode.com',
    usdc: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  },
  { name: 'HyperEVM', symbol: 'HYPE', rpc: 'https://rpc.hyperliquid.xyz/evm' },
];

const SOLANA_RPC = 'https://solana-rpc.publicnode.com';
const SOLANA_MINTS = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
};

export async function checkWallet(address, { zerionKey } = {}) {
  const kind = detectKind(address);
  const checkedAt = new Date().toISOString();
  if (kind === 'evm') {
    const [chains, hyperliquid, zerion] = await Promise.all([
      Promise.all(EVM_CHAINS.map((c) => evmChain(c, address))),
      hyperliquidAccount(address),
      zerionKey ? zerionPositions(address, zerionKey) : null,
    ]);
    return { kind, address, chains, hyperliquid, zerion, checkedAt };
  }
  if (kind === 'solana') {
    return { kind, address, solana: await solanaAccount(address), checkedAt };
  }
  throw new Error('Tanınmayan adres biçimi');
}

async function postJson(url, body, timeoutMs = 15_000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function rpc(url, method, params) {
  const json = await postJson(url, { jsonrpc: '2.0', id: 1, method, params });
  if (json.error) throw new Error(json.error.message || 'RPC hatası');
  return json.result;
}

function formatUnits(value, decimals) {
  const s = value.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, -decimals);
  const frac = s.slice(-decimals).slice(0, 6).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

async function evmChain(chain, address) {
  try {
    const calls = [
      rpc(chain.rpc, 'eth_getBalance', [address, 'latest']),
      rpc(chain.rpc, 'eth_getTransactionCount', [address, 'latest']),
    ];
    if (chain.usdc) {
      const data = '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0');
      calls.push(rpc(chain.rpc, 'eth_call', [{ to: chain.usdc.address, data }, 'latest']));
    }
    const [bal, nonce, usdcRaw] = await Promise.all(calls);
    const native = BigInt(bal);
    const txCount = Number(BigInt(nonce));
    const usdc = usdcRaw && usdcRaw !== '0x' ? BigInt(usdcRaw) : 0n;
    return {
      chain: chain.name,
      symbol: chain.symbol,
      native: formatUnits(native, 18),
      usdc: chain.usdc ? formatUnits(usdc, chain.usdc.decimals) : null,
      txCount,
      active: native > 0n || usdc > 0n || txCount > 0,
    };
  } catch (err) {
    return { chain: chain.name, error: err.message };
  }
}

const hlInfo = (body) => postJson('https://api.hyperliquid.xyz/info', body);

async function hyperliquidAccount(user) {
  try {
    const [perp, spot, vaults, staking] = await Promise.all([
      hlInfo({ type: 'clearinghouseState', user }),
      hlInfo({ type: 'spotClearinghouseState', user }),
      hlInfo({ type: 'userVaultEquities', user }).catch(() => []),
      hlInfo({ type: 'delegatorSummary', user }).catch(() => null),
    ]);
    const accountValue = perp?.marginSummary?.accountValue ?? '0';
    const positions = (perp?.assetPositions || []).map(({ position: p }) => ({
      coin: p.coin, size: p.szi, value: p.positionValue, pnl: p.unrealizedPnl,
    }));
    const spotBalances = (spot?.balances || [])
      .filter((b) => Number(b.total) !== 0)
      .map((b) => ({ coin: b.coin, total: b.total }));
    const vaultList = (vaults || []).map((v) => ({ vault: v.vaultAddress, equity: v.equity }));
    const stake = staking && {
      delegated: staking.delegated,
      undelegated: staking.undelegated,
      pendingWithdrawal: staking.totalPendingWithdrawal,
    };
    return {
      accountValue,
      positions,
      spot: spotBalances,
      vaults: vaultList,
      staking: stake,
      active: Boolean(
        Number(accountValue) > 0 || positions.length || spotBalances.length || vaultList.length
        || (stake && (Number(stake.delegated) > 0 || Number(stake.undelegated) > 0)),
      ),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function zerionPositions(address, key) {
  try {
    const url = `https://api.zerion.io/v1/wallets/${address}/positions/`
      + '?filter[positions]=no_filter&filter[trash]=only_non_trash&currency=usd';
    const res = await fetch(url, {
      headers: { accept: 'application/json', authorization: 'Basic ' + btoa(key + ':') },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Zerion HTTP ${res.status}`);
    const json = await res.json();
    const positions = (json.data || [])
      .map((p) => {
        const a = p.attributes || {};
        return {
          type: a.position_type,
          name: a.fungible_info?.symbol || a.name,
          protocol: a.application_metadata?.name || a.protocol || '',
          chain: p.relationships?.chain?.data?.id || '',
          quantity: a.quantity?.float ?? null,
          value: a.value ?? null,
        };
      })
      .filter((p) => p.type !== 'wallet' || (p.value ?? 0) >= 0.01)
      .sort((x, y) => (y.value || 0) - (x.value || 0));
    const total = positions.reduce((sum, p) => sum + (p.value || 0), 0);
    return { total, positions };
  } catch (err) {
    return { error: err.message };
  }
}

async function solanaAccount(address) {
  try {
    const [bal, tokens] = await Promise.all([
      rpc(SOLANA_RPC, 'getBalance', [address]),
      rpc(SOLANA_RPC, 'getTokenAccountsByOwner', [
        address,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ]),
    ]);
    const list = (tokens.value || [])
      .map((t) => t.account.data.parsed.info)
      .filter((i) => i.tokenAmount.amount !== '0')
      .map((i) => ({ mint: i.mint, symbol: SOLANA_MINTS[i.mint] || '', amount: i.tokenAmount.uiAmountString }));
    return {
      sol: formatUnits(BigInt(bal.value), 9),
      tokens: list,
      active: bal.value > 0 || list.length > 0,
    };
  } catch (err) {
    return { error: err.message };
  }
}
