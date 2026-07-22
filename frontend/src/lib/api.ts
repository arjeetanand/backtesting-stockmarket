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
    const timeout = new Promise<Response>((_, reject) => {
      timer = window.setTimeout(() => {
        controller.abort();
        reject(new Error("The local data service did not respond in time. Check that the API is running and try again."));
      }, timeoutMs);
    });
    return await Promise.race([fetch(input, { ...init, signal: controller.signal }), timeout]);
  } catch (error) {
    throw error;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}
