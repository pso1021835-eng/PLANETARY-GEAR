// The worker and the main-thread fallback must use the same design and lifetime.
(function (root) {
  function createAnalysisJobs(engine, makeWorker, schedule = setTimeout) {
    let generation = 0, worker = null;
    function cancel() {
      generation++;
      if (worker) worker.terminate();
      worker = null;
    }
    function run(type, current, done, progress) {
      cancel();
      const id = generation, design = JSON.parse(JSON.stringify(current));
      const finish = result => {
        if (id !== generation) return;
        cancel();
        done(result);
      };
      function fallback() {
        if (id !== generation) return;
        if (worker) worker.terminate();
        worker = null;
        schedule(() => {
          if (id !== generation) return;
          try {
            finish(type === 'mc' ? engine.monteCarlo(design, design.mc.samples || 200) : engine.sensitivity(design));
          } catch (err) { finish({ error: err.message }); }
        }, 0);
      }
      try {
        worker = makeWorker();
        worker.onmessage = ({ data }) => {
          if (id !== generation || data.id !== id || !worker) return;
          if (data.done) finish(data.error ? { error: data.error } : data.result);
          else if (progress) progress(data.progress);
        };
        worker.onerror = fallback;
        worker.postMessage({ id, type, design });
      } catch { fallback(); }
    }
    return { cancel, run };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = createAnalysisJobs;
  else root.createAnalysisJobs = createAnalysisJobs;
})(globalThis);
