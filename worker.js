importScripts('carrier-geometry.js?v=pr28-1', 'engine.js?v=engfix-1');
self.onmessage = e => {
  const { id, type, design } = e.data;
  try {
    if (type === 'mc') {
      const r = PGD.monteCarlo(design, design.mc.samples || 200, p => self.postMessage({ id, progress: p }));
      self.postMessage({ id, done: true, result: r });
    } else if (type === 'sens') {
      self.postMessage({ id, done: true, result: PGD.sensitivity(design) });
    }
  } catch (err) { self.postMessage({ id, done: true, error: String(err && err.message || err) }); }
};
