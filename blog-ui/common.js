let current;
export async function session() {
  if (!current) {
    const r = await fetch("/api/blog/session", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    current = data;
  }
  return current;
}
export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (method !== "GET") {
    headers["X-CSRF-Token"] = (await session()).csrf;
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("ログイン状態または接続を確認してください。");
  }
  if (!r.ok) throw Error(data.error || "操作を完了できませんでした。");
  return data;
}
export function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
export function status(id, message) {
  document.getElementById(id).textContent = message;
}
