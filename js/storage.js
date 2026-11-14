const KEY = 'kripto-iz:v1';

export const emptyState = () => ({ projects: [], wallets: [], hidden: [], lastScan: null, settings: {} });

export function loadState() {
  try {
    return { ...emptyState(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    alert(`Veriler tarayıcıya kaydedilemedi: ${err.message}. "Yedeği indir" ile dışa aktarmayı unutma.`);
  }
}

export function downloadBackup(state) {
  const { settings, ...data } = state;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kripto-iz-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Also accepts data/store.json from the earlier local-server version.
export function mergeBackup(state, backup) {
  if (!backup || typeof backup !== 'object' || !Array.isArray(backup.wallets)) {
    throw new Error('Bu dosya bir Kripto İz yedeği değil');
  }
  const known = new Set(state.wallets.map((w) => w.address));
  const wallets = [...state.wallets];
  for (const w of backup.wallets) {
    if (w && typeof w.address === 'string' && !known.has(w.address)) {
      wallets.push({ ...w, id: w.id || crypto.randomUUID() });
      known.add(w.address);
    }
  }
  const useBackupProjects = !state.projects.length && Array.isArray(backup.projects);
  return {
    ...state,
    wallets,
    hidden: [...new Set([...state.hidden, ...(backup.hidden || [])])],
    projects: useBackupProjects ? backup.projects : state.projects,
    lastScan: useBackupProjects ? backup.lastScan || null : state.lastScan,
  };
}
