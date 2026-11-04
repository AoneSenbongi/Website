let current;
function authRequired() {
  const error = Error("ログイン期限が切れています。");
  error.code = "auth_required";
  return error;
}
export async function session({ refresh = false, requireAdmin = false } = {}) {
  if (!current || refresh) {
    let r;
    try { r = await fetch("/api/blog/session", {
      cache: "no-store",
      credentials: "same-origin",
    }); } catch {
      throw Error("サーバーに接続できませんでした。接続を確認して、もう一度お試しください。");
    }
    let data;
    try { data = await r.json(); } catch {
      throw Error("サーバーの応答を確認できませんでした。もう一度お試しください。");
    }
    if (!r.ok) throw Error(data.error);
    current = data;
  }
  if (requireAdmin && !current.isAdmin) throw authRequired();
  return current;
}
export async function api(path, { method = "GET", body } = {}) {
  const admin = path.startsWith("/api/admin/");
  const headers = {};
  if (method !== "GET") {
    headers["X-CSRF-Token"] = (await session({refresh:admin, requireAdmin:admin})).csrf;
    headers["Content-Type"] = "application/json";
  }
  let r;
  try { r = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  }); } catch {
    if (admin) await session({refresh:true, requireAdmin:true});
    throw Error("サーバーに接続できませんでした。接続を確認して、もう一度お試しください。");
  }
  if (admin && r.status === 401) throw authRequired();
  let data;
  try {
    data = await r.json();
  } catch {
    if (admin) await session({refresh:true, requireAdmin:true});
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
