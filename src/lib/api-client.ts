export async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  const normalized = text.trim();

  if (normalized.startsWith("<!DOCTYPE") || normalized.startsWith("<html")) {
    throw new Error(
      response.status === 401
        ? "Your session is no longer valid. Sign in again."
        : `The server returned HTML instead of JSON (${response.status}). Check the server error or redirect target.`
    );
  }

  throw new Error(normalized || `Unexpected response format (${response.status}).`);
}
