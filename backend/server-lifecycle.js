'use strict';

// Every replica uses the same MongoDB database and JWT secrets.
// Render owns traffic distribution; this module reports readiness and drains requests.
function installLifecycle(app, db, client, runtime = process) {
  let draining = false;
  let pendingHealth = null;
  async function databaseReady() {
    if (!pendingHealth) {
      pendingHealth = db.command({ ping: 1 }, { timeoutMS: 2500 })
        .then(() => true, () => false)
        .finally(() => { pendingHealth = null; });
    }
    return pendingHealth;
  }
  app.get('/health/live', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(draining ? 503 : 200).json({ status: draining ? 'draining' : 'ok' });
  });
  app.get('/health/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const ready = !draining && await databaseReady();
    res.status(ready && !draining ? 200 : 503).json({ status: ready && !draining ? 'ready' : 'unavailable' });
  });
  app.use((_req, res, next) => {
    if (draining) return res.status(503).set('Connection', 'close').json({ message: 'Server restarting. Please try again shortly.' });
    next();
  });
  return function attach(server) {
    let stopping = false;
    function stop() {
      if (stopping) return;
      stopping = true;
      draining = true;
      const deadline = setTimeout(() => { server.closeAllConnections?.(); runtime.exit(1); }, 25000);
      deadline.unref?.();
      server.close(async error => {
        try { await client.close(); clearTimeout(deadline); runtime.exit(error ? 1 : 0); }
        catch { clearTimeout(deadline); runtime.exit(1); }
      });
      server.closeIdleConnections?.();
    }
    runtime.once('SIGTERM', stop);
    runtime.once('SIGINT', stop);
  };
}
module.exports = { installLifecycle };
