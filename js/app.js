import { checkWallet, detectKind } from './balances.js';
import { loadState, saveState, downloadBackup, mergeBackup, emptyState } from './storage.js';

let state = loadState();
let scan = { running: false };

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

function commit() {
  saveState(state);
  render();
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '?');
const fmtNum = (v, digits = 4) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: digits });
const fmtInt = (v) => Number(v).toLocaleString('tr-TR');
const fmtSize = (bytes) => `${(bytes / 1024 ** 3).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB`;
const short = (a) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

function walletLinks(address, kind) {
  if (kind === 'solana') {
    return [link(`https://solscan.io/account/${address}`, 'Solscan'), link(`https://jup.ag/portfolio/${address}`, 'Jupiter')];
  }
  return [
    link(`https://debank.com/profile/${address}`, 'DeBank'),
    link(`https://app.zerion.io/${address}/overview`, 'Zerion'),
    link(`https://hypurrscan.io/address/${address}`, 'Hypurrscan'),
  ];
}

// ---------------------------------------------------------------- scanning

function startScan(fileList) {
  const files = [...fileList].filter((f) => /\.(mbox|eml)$/i.test(f.name));
  if (!files.length) {
    alert('Lütfen .mbox veya .eml uzantılı bir dosya seç.');
    return;
  }
  if (scan.running) return;

  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  scan = { running: true, readBytes: 0, totalBytes: files.reduce((s, f) => s + f.size, 0), total: 0, matched: 0 };
  renderScanStatus();

  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      Object.assign(scan, data);
      renderScanStatus();
    } else if (data.type === 'done') {
      worker.terminate();
      scan = { running: false };
      state.projects = data.result.projects;
      state.lastScan = {
        files: files.map((f) => f.name),
        at: new Date().toISOString(),
        total: data.result.total,
        matched: data.result.matched,
      };
      commit();
    } else if (data.type === 'error') {
      worker.terminate();
      scan = { running: false, error: data.message };
      renderScanStatus();
    }
  };
  worker.onerror = (e) => {
    worker.terminate();
    scan = { running: false, error: e.message || 'Tarama başlatılamadı' };
    renderScanStatus();
  };
  worker.postMessage({ files });
}

// ---------------------------------------------------------------- rendering

function render() {
  renderScanStatus();
  renderProjects();
  renderWalletProjectOptions();
  renderWallets();
}

function renderScanStatus() {
  const el = $('scan-status');
  const bar = $('progress');
  el.className = 'muted';
  bar.hidden = !scan.running;
  $('file-input').disabled = scan.running;

  if (scan.running) {
    const pct = scan.totalBytes ? (scan.readBytes / scan.totalBytes) * 100 : 0;
    $('progress-bar').style.width = `${pct.toFixed(1)}%`;
    el.textContent = `Taranıyor: %${pct.toFixed(1)} (${fmtSize(scan.readBytes)} / ${fmtSize(scan.totalBytes)}), `
      + `${fmtInt(scan.total)} mail okundu, ${fmtInt(scan.matched)} kripto maili bulundu. Bu sekmeyi kapatma.`;
  } else if (scan.error) {
    el.className = 'error';
    el.textContent = `Tarama hatası: ${scan.error}`;
  } else if (state.lastScan) {
    const s = state.lastScan;
    el.textContent = `Son tarama ${new Date(s.at).toLocaleString('tr-TR')}: ${fmtInt(s.total)} mailden `
      + `${fmtInt(s.matched)} tanesi kripto ile ilgili, ${state.projects.length} proje.`;
  } else {
    el.textContent = 'Henüz tarama yapılmadı.';
  }
}

function renderProjects() {
  const q = $('filter').value.trim().toLowerCase();
  const type = $('type-filter').value;
  const tag = $('tag-filter').value;
  const showHidden = $('show-hidden').checked;
  const hidden = new Set(state.hidden);

  const list = state.projects.filter((p) => {
    if (!showHidden && hidden.has(p.key)) return false;
    if (type ? p.type !== type : p.type === 'bülten') return false;
    if (tag === 'adres' ? !p.addresses.length : tag && !p.tags.includes(tag)) return false;
    if (!q) return true;
    return [p.name, p.domain, p.provider, ...p.tags, ...p.senders, ...p.mails.map((m) => m.subject)]
      .some((s) => s && s.toLowerCase().includes(q));
  });

  const box = $('projects');
  box.replaceChildren();
  if (!state.projects.length) {
    box.append(h('p', { class: 'muted' }, 'Tarama yapınca projeler burada listelenecek.'));
    return;
  }
  box.append(h('p', { class: 'muted small' }, `${list.length} proje gösteriliyor.`));
  for (const p of list) box.append(projectCard(p, hidden.has(p.key)));
}

function projectCard(p, isHidden) {
  const linked = state.wallets.filter((w) => w.projectKey === p.key);
  const known = new Set(state.wallets.map((w) => w.address));
  const badgeClass = p.type === 'gömülü cüzdan' ? 'badge gomulu' : p.type === 'borsa' ? 'badge borsa' : 'badge';
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${p.name} crypto app`)}`;

  return h('div', { class: `card${isHidden ? ' hidden-item' : ''}` },
    h('div', { class: 'card-head' },
      h('h3', {},
        p.name,
        h('span', { class: badgeClass }, p.type),
        p.provider && h('span', { class: 'badge' }, `${p.provider} ile giriş`),
        linked.length > 0 && h('span', { class: 'badge ok' }, `${linked.length} cüzdan bağlı`),
      ),
      h('div', { class: 'actions' },
        p.domain ? link(`https://${p.domain}`, p.domain) : link(searchUrl, 'Siteyi ara'),
        h('button', { type: 'button', onclick: () => promptWallet(p) }, 'Cüzdan adresi ekle'),
        h('button', { type: 'button', class: 'ghost', onclick: () => toggleHidden(p.key, !isHidden) }, isHidden ? 'Göster' : 'Gizle'),
      ),
    ),
    h('div', { class: 'muted small' },
      `${p.count} mail · ilk: ${fmtDate(p.firstDate)} · son: ${fmtDate(p.lastDate)}`,
      p.senders.length ? ` · gönderen: ${p.senders.join(', ')}` : '',
    ),
    p.tags.length > 0 && h('div', { class: 'tags' }, p.tags.map((t) => h('span', {}, t))),
    p.addresses.length > 0 && h('div', {},
      h('div', { class: 'small muted' }, 'Maillerde geçen adresler (senin cüzdanın olabilir de, token kontratı da olabilir):'),
      h('ul', { class: 'addr-list' }, p.addresses.map(({ address, count }) =>
        h('li', {},
          h('span', { class: 'mono' }, address),
          h('span', { class: 'muted small' }, ` (${count} mail)`),
          known.has(address)
            ? h('span', { class: 'badge ok' }, 'ekli')
            : h('button', { type: 'button', onclick: () => addWallet(address, `${p.name} (mailden)`, p.key) }, 'Cüzdanlarıma ekle'),
        ))),
    ),
    h('details', {},
      h('summary', {}, 'Son mailler'),
      h('table', {}, h('tbody', {}, p.mails.map((m) => h('tr', {}, h('td', { class: 'muted' }, fmtDate(m.date)), h('td', {}, m.subject || '(konusuz)'))))),
      p.txs.length > 0 && h('div', { class: 'small' }, h('div', { class: 'muted' }, 'Maillerde geçen işlem hash\'leri:'),
        p.txs.map((t) => h('div', { class: 'mono' }, t))),
    ),
  );
}

function renderWalletProjectOptions() {
  const select = $('wallet-project');
  const current = select.value;
  select.replaceChildren(
    h('option', { value: '' }, 'Proje seç (isteğe bağlı)'),
    ...state.projects.map((p) => h('option', { value: p.key }, `${p.name}${p.domain ? ` (${p.domain})` : ''}`)),
  );
  select.value = current;
}

function renderWallets() {
  const box = $('wallets');
  box.replaceChildren();
  if (!state.wallets.length) {
    box.append(h('p', { class: 'muted' }, 'Henüz cüzdan eklenmedi.'));
    return;
  }
  const projectName = Object.fromEntries(state.projects.map((p) => [p.key, p.name]));
  for (const w of state.wallets) {
    box.append(h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h3', {}, w.label || short(w.address),
          h('span', { class: 'badge' }, w.kind === 'evm' ? 'EVM' : 'Solana'),
          w.projectKey && h('span', { class: 'badge' }, projectName[w.projectKey] || w.projectKey),
        ),
        h('div', { class: 'actions' },
          ...walletLinks(w.address, w.kind),
          h('button', { type: 'button', onclick: (e) => runCheck(w.id, e.target) }, 'Kontrol et'),
          h('button', { type: 'button', class: 'ghost danger', onclick: () => removeWallet(w.id) }, 'Sil'),
        ),
      ),
      h('div', { class: 'mono muted' }, w.address),
      w.lastCheck ? renderCheck(w.lastCheck) : h('p', { class: 'muted small' }, 'Henüz kontrol edilmedi.'),
    ));
  }
}

function renderCheck(r) {
  const out = h('div', { class: 'result' },
    h('div', { class: 'muted small' }, `Kontrol: ${new Date(r.checkedAt).toLocaleString('tr-TR')}`));

  if (r.kind === 'evm') {
    const active = r.chains.filter((c) => c.active);
    const failed = r.chains.filter((c) => c.error);
    out.append(h('h4', {}, 'Zincirlerdeki bakiyeler'));
    out.append(active.length
      ? h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Zincir'), h('th', {}, 'Ana coin'), h('th', {}, 'USDC'), h('th', {}, 'İşlem sayısı'))),
        h('tbody', {}, active.map((c) => h('tr', {},
          h('td', {}, c.chain), h('td', {}, `${c.native} ${c.symbol}`), h('td', {}, c.usdc ?? '-'), h('td', {}, c.txCount)))))
      : h('p', { class: 'muted small' }, 'Kontrol edilen EVM zincirlerinde bakiye veya işlem yok.'));
    if (failed.length) {
      out.append(h('p', { class: 'error small' }, `Ulaşılamayan: ${failed.map((c) => `${c.chain} (${c.error})`).join(', ')}`));
    }
    out.append(renderHyperliquid(r.hyperliquid));
    out.append(renderZerion(r.zerion));
  } else if (r.kind === 'solana') {
    const s = r.solana;
    out.append(h('h4', {}, 'Solana'));
    if (s.error) out.append(h('p', { class: 'error small' }, s.error));
    else {
      out.append(h('p', { class: 'small' }, `${s.sol} SOL`));
      if (s.tokens.length) {
        out.append(h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Token'), h('th', {}, 'Miktar'))),
          h('tbody', {}, s.tokens.map((t) => h('tr', {}, h('td', { class: 'mono' }, t.symbol || t.mint), h('td', {}, t.amount))))));
      }
    }
  }
  return out;
}

function renderHyperliquid(hl) {
  const box = h('div', {}, h('h4', {}, 'Hyperliquid'));
  if (!hl) return box;
  if (hl.error) {
    box.append(h('p', { class: 'error small' }, hl.error));
    return box;
  }
  if (!hl.active) {
    box.append(h('p', { class: 'muted small' }, 'Hesap boş.'));
    return box;
  }
  box.append(h('p', { class: 'small' }, `Perp hesap değeri: ${fmtNum(hl.accountValue, 2)} USDC`));
  if (hl.positions.length) {
    box.append(h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Pozisyon'), h('th', {}, 'Büyüklük'), h('th', {}, 'Değer'), h('th', {}, 'K/Z'))),
      h('tbody', {}, hl.positions.map((p) => h('tr', {},
        h('td', {}, p.coin), h('td', {}, p.size), h('td', {}, fmtNum(p.value, 2)), h('td', {}, fmtNum(p.pnl, 2)))))));
  }
  if (hl.spot.length) {
    box.append(h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Spot varlık'), h('th', {}, 'Miktar'))),
      h('tbody', {}, hl.spot.map((b) => h('tr', {}, h('td', {}, b.coin), h('td', {}, fmtNum(b.total)))))));
  }
  if (hl.vaults.length) {
    box.append(h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Vault (deposit)'), h('th', {}, 'Değer (USDC)'))),
      h('tbody', {}, hl.vaults.map((v) => h('tr', {},
        h('td', {}, link(`https://app.hyperliquid.xyz/vaults/${v.vault}`, short(v.vault))), h('td', {}, fmtNum(v.equity, 2)))))));
  }
  if (hl.staking && (Number(hl.staking.delegated) > 0 || Number(hl.staking.undelegated) > 0)) {
    box.append(h('p', { class: 'small' },
      `Stake: ${fmtNum(hl.staking.delegated)} HYPE delege, ${fmtNum(hl.staking.undelegated)} HYPE delege edilmemiş, ${fmtNum(hl.staking.pendingWithdrawal)} HYPE çekim bekliyor`));
  }
  return box;
}

function renderZerion(z) {
  const box = h('div', {}, h('h4', {}, 'DeFi pozisyonları (likidite, stake, deposit)'));
  if (!z) {
    box.append(h('p', { class: 'muted small' },
      'Tüm zincirlerdeki LP ve deposit pozisyonlarını görmek için yukarıdaki DeBank veya Zerion linkine tıkla ya da "Yedek ve ayarlar" bölümüne Zerion API anahtarı ekle.'));
    return box;
  }
  if (z.error) {
    box.append(h('p', { class: 'error small' }, z.error));
    return box;
  }
  box.append(h('p', { class: 'small' }, `Toplam: $${fmtNum(z.total, 2)}`));
  if (z.positions.length) {
    box.append(h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Tür'), h('th', {}, 'Varlık'), h('th', {}, 'Protokol'), h('th', {}, 'Zincir'), h('th', {}, 'Miktar'), h('th', {}, 'Değer ($)'))),
      h('tbody', {}, z.positions.map((p) => h('tr', {},
        h('td', {}, p.type), h('td', {}, p.name), h('td', {}, p.protocol || '-'), h('td', {}, p.chain),
        h('td', {}, p.quantity != null ? fmtNum(p.quantity) : '-'), h('td', {}, p.value != null ? fmtNum(p.value, 2) : '-'))))));
  }
  return box;
}

// ---------------------------------------------------------------- actions

function addWallet(address, label, projectKey) {
  address = address.trim();
  const kind = detectKind(address);
  if (!kind) {
    alert('Geçerli bir EVM (0x...) veya Solana adresi girin.');
    return false;
  }
  const normalized = kind === 'evm' ? address.toLowerCase() : address;
  if (state.wallets.some((w) => w.address === normalized)) {
    alert('Bu adres zaten ekli.');
    return false;
  }
  state.wallets.push({
    id: crypto.randomUUID(),
    address: normalized,
    kind,
    label: String(label || '').trim().slice(0, 80),
    projectKey: projectKey || null,
    addedAt: new Date().toISOString(),
    lastCheck: null,
  });
  commit();
  return true;
}

function promptWallet(project) {
  const address = prompt(`${project.name} için cüzdan adresini yapıştır (0x... veya Solana):`);
  if (address) addWallet(address, `${project.name} cüzdanı`, project.key);
}

function toggleHidden(key, hide) {
  const set = new Set(state.hidden);
  if (hide) set.add(key);
  else set.delete(key);
  state.hidden = [...set];
  commit();
}

function removeWallet(id) {
  if (!confirm('Bu cüzdan listeden silinsin mi? (Blokzincirdeki varlıklarına bir şey olmaz.)')) return;
  state.wallets = state.wallets.filter((w) => w.id !== id);
  commit();
}

async function checkOne(id) {
  const wallet = state.wallets.find((w) => w.id === id);
  if (!wallet) return;
  wallet.lastCheck = await checkWallet(wallet.address, { zerionKey: state.settings.zerionKey });
  saveState(state);
}

async function runCheck(id, button) {
  button.disabled = true;
  button.textContent = 'Kontrol ediliyor...';
  try {
    await checkOne(id);
  } catch (err) {
    alert(err.message);
  }
  render();
}

// ---------------------------------------------------------------- wiring

$('file-input').addEventListener('change', (e) => {
  startScan(e.target.files);
  e.target.value = '';
});

const drop = $('drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  startScan(e.dataTransfer.files);
});

$('wallet-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (addWallet($('wallet-address').value, $('wallet-label').value, $('wallet-project').value || null)) {
    $('wallet-address').value = '';
    $('wallet-label').value = '';
  }
});

$('check-all').addEventListener('click', async (e) => {
  const button = e.target;
  button.disabled = true;
  for (const w of [...state.wallets]) {
    button.textContent = `Kontrol ediliyor: ${w.label || short(w.address)}`;
    try {
      await checkOne(w.id);
    } catch (err) {
      console.error(err);
    }
    renderWallets();
  }
  button.disabled = false;
  button.textContent = 'Hepsini kontrol et';
});

$('backup-download').addEventListener('click', () => downloadBackup(state));

$('backup-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    state = mergeBackup(state, JSON.parse(await file.text()));
    commit();
    alert('Yedek yüklendi.');
  } catch (err) {
    alert(`Yedek yüklenemedi: ${err.message}`);
  }
});

$('reset').addEventListener('click', () => {
  if (!confirm('Bu tarayıcıdaki tüm proje ve cüzdan listesi silinsin mi? Önce yedek indirmen önerilir.')) return;
  state = emptyState();
  commit();
});

$('zerion-key').value = state.settings.zerionKey || '';
$('zerion-save').addEventListener('click', () => {
  state.settings = { ...state.settings, zerionKey: $('zerion-key').value.trim() || undefined };
  saveState(state);
  alert('Kaydedildi.');
});

for (const id of ['filter', 'type-filter', 'tag-filter', 'show-hidden']) {
  $(id).addEventListener('input', renderProjects);
}

render();
