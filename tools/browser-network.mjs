// Browser integration fixture only. Production code always uses real Turnstile.
// Set BLOG_LIVE_TURNSTILE=1 to load the external widget instead.
export async function turnstileTransport(context) {
  if (process.env.BLOG_LIVE_TURNSTILE === "1") return;
  await context.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js*",
    (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
    (()=>{let next=0;const widgets=new Map();window.turnstile={
      render(target,options){const id=next++;widgets.set(id,options);queueMicrotask(()=>options.callback('XXXX.DUMMY.TOKEN.XXXX'));return id;},
      reset(id){const options=widgets.get(id);if(options)queueMicrotask(()=>options.callback('XXXX.DUMMY.TOKEN.XXXX'));},
      remove(id){widgets.delete(id);}
    };})();
  `,
      }),
  );
}
