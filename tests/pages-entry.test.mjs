import test from "node:test";
import assert from "node:assert/strict";
import pages, { createPagesEntry } from "../worker/pages-entry.mjs";

test("Pages entry rejects unauthenticated administration with production settings", async () => {
  const env = {
    DB: {},
    SITE_ORIGIN: "https://yamachikaseiya.com",
    ACCESS_ISSUER: "https://soft-disk-64fc.cloudflareaccess.com",
    ACCESS_AUD: "test-audience",
    ADMIN_EMAIL: "owner@example.com",
  };
  for (const path of ["/admin/", "/api/admin/posts"]) {
    const response = await pages.fetch(new Request(env.SITE_ORIGIN + path), env, {});
    assert.equal(response.status, 401);
  }
});

test("Pages runs expiration cleanup in the background at most once per ten minutes", async () => {
  let time = 1, calls = 0;
  const jobs = [];
  const entry = createPagesEntry({
    fetch: () => new Response("ok"),
    scheduled: async () => { calls++; },
  }, () => time);
  const context = { waitUntil: p => jobs.push(p) };
  const request = new Request("https://yamachikaseiya.com/blog/");
  assert.equal((await entry.fetch(request, { DB: {} }, context)).status, 200);
  await entry.fetch(request, { DB: {} }, context);
  assert.equal(calls, 1);
  time += 600000;
  await entry.fetch(request, { DB: {} }, context);
  await Promise.all(jobs);
  assert.equal(calls, 2);
});
