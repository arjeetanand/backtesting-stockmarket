/** Fetch API resources with a bounded wait so a disconnected local service
 * cannot leave a page in an indefinite loading state. */
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController();
  let timer: number | undefined;
  const externalSignal = init.signal;
  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) forwardAbort();
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    return await new Promise<Response>((resolve, reject) => {
      let settled = false;
      timer = window.setTimeout(() => {
        settled = true;
        controller.abort();
        reject(new Error("Could not connect to the local data service. Start the backend on port 8000, then try again."));
      }, timeoutMs);
      void fetch(input, { ...init, signal: controller.signal }).then((response) => {
        if (settled) return;
        settled = true;
        resolve(response);
      }).catch((error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    });
  } catch (error) {
    throw error;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}
