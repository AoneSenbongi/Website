import app from "./index.mjs";

// Pages advanced mode supplies ASSETS. Cron handlers are not supported by Pages.
export function createPagesEntry(application = app, clock = Date.now) {
  let nextMaintenance = 0;
  return {
    fetch(request, env, context) {
      if (env.DB && context.waitUntil && clock() >= nextMaintenance) {
        nextMaintenance = clock() + 10 * 60 * 1000;
        context.waitUntil(application.scheduled({}, env).catch(() => {
          nextMaintenance = 0;
          console.error("Blog maintenance failed");
        }));
      }
      return application.fetch(request, env, context);
    },
  };
}
export default createPagesEntry();
