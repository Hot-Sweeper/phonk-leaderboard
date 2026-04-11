export async function register() {
  // Only run the scheduler on the Node.js server runtime, not in edge or build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkAndRunScheduledUpdate } = await import("./lib/update-runner");

    let running = false;

    async function tick() {
      if (running) return;
      running = true;
      try {
        await checkAndRunScheduledUpdate();
      } catch (err) {
        console.error("[Scheduler] Error during scheduled update:", err);
      } finally {
        running = false;
      }
    }

    // Wait 30s after startup for the server to settle, then check immediately
    setTimeout(() => {
      console.log("[Scheduler] Auto-update scheduler started. Checking every 5 minutes.");
      tick();
      // Check every 5 minutes whether an update is due
      setInterval(tick, 5 * 60 * 1000);
    }, 30_000);
  }
}
