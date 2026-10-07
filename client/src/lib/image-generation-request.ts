import i18n from "@/i18n";

export async function readImageResponse(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch {
    throw new Error(i18n.t("imageGeneration.connectionError"));
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(i18n.t("imageGeneration.connectionError"));
  }
  return body as Record<string, any>;
}

/** Never retry the paid POST. Retry only read-only status requests. */
export async function requestImageGeneration(form: FormData, token?: string) {
  form.set("async", "true");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const initial = await fetch("/api/bolig/generate", { method: "POST", body: form, headers });
  let body = await readImageResponse(initial);
  if (initial.status !== 202) {
    return new Response(JSON.stringify(body), { status: initial.status, headers: { "Content-Type": "application/json" } });
  }
  if (typeof body.request_id !== "string" || !/^image-[a-f0-9-]+$/.test(body.request_id)) {
    throw new Error(i18n.t("imageGeneration.connectionError"));
  }
  const id = body.request_id;
  const deadline = Date.now() + 25 * 60_000;
  let failures = 0;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    let response: Response;
    try {
      response = await fetch(`/api/bolig/generate/jobs/${encodeURIComponent(id)}`, {
        headers, cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      body = await readImageResponse(response);
      if ([502, 503, 504].includes(response.status)) throw new Error("Temporary status connection failure");
      failures = 0;
    } catch {
      if (++failures < 5) continue;
      throw new Error(i18n.t("imageGeneration.connectionError"));
    }
    if (response.status === 202 && body.status === "pending") continue;
    return new Response(JSON.stringify(body), { status: response.status, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(i18n.t("imageGeneration.waitExpired"));
}
