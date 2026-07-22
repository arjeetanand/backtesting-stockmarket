import type { ReplaySessionData } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

async function requestError(response: Response, action: string): Promise<Error> {
  const payload = await response.json().catch(() => null) as { detail?: string } | null;
  return new Error(payload?.detail ?? `Could not ${action}: ${response.statusText}`);
}

export async function createReplaySession(params: {
  symbol?: string;
  timeframe?: string;
  start: string;
  end: string;
  mode?: "manual" | "automated";
  initial_capital?: number;
}): Promise<ReplaySessionData> {
  const response = await fetch(`${API_BASE_URL}/replay/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw await requestError(response, "create the replay session");
  }
  return response.json();
}

export async function getReplaySession(sessionId: string): Promise<ReplaySessionData> {
  const response = await fetch(`${API_BASE_URL}/replay/sessions/${sessionId}`);
  if (!response.ok) {
    throw await requestError(response, "fetch the replay session");
  }
  return response.json();
}

export async function stepReplaySession(sessionId: string, steps: number = 1): Promise<ReplaySessionData> {
  const response = await fetch(`${API_BASE_URL}/replay/sessions/${sessionId}/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps }),
  });
  if (!response.ok) {
    throw await requestError(response, "advance the replay");
  }
  return response.json();
}

export async function placeReplayOrder(
  sessionId: string,
  params: {
    side: "buy" | "sell";
    quantity: number;
    order_type?: "market" | "limit" | "stop";
    price?: number;
    stop_loss?: number;
    take_profit?: number;
  }
): Promise<ReplaySessionData> {
  const response = await fetch(`${API_BASE_URL}/replay/sessions/${sessionId}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw await requestError(response, "place the simulated order");
  }
  return response.json();
}

export async function closeReplayOrder(sessionId: string, orderId: string): Promise<ReplaySessionData> {
  const response = await fetch(`${API_BASE_URL}/replay/sessions/${sessionId}/orders/${orderId}/close`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await requestError(response, "close the simulated position");
  }
  return response.json();
}

export async function finishReplaySession(sessionId: string): Promise<ReplaySessionData> {
  const response = await fetch(`${API_BASE_URL}/replay/sessions/${sessionId}/finish`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await requestError(response, "finish the replay session");
  }
  return response.json();
}
