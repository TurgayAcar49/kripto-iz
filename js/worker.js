import { splitMbox, emlToRaw, createScanner } from './mail.js';

self.onmessage = async (event) => {
  const files = event.data.files;
  const scanner = createScanner();
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let readBytes = 0;
  let lastPost = 0;

  const progress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPost < 250) return;
    lastPost = now;
    self.postMessage({ type: 'progress', readBytes, totalBytes, total: scanner.total, matched: scanner.matched });
  };

  async function* chunksOf(file) {
    const reader = file.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      readBytes += value.length;
      yield value;
    }
  }

  try {
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.eml')) {
        scanner.add(emlToRaw(new Uint8Array(await file.arrayBuffer())));
        readBytes += file.size;
        progress();
        continue;
      }
      for await (const raw of splitMbox(chunksOf(file))) {
        scanner.add(raw);
        progress();
      }
    }
    progress(true);
    self.postMessage({ type: 'done', result: scanner.result() });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
