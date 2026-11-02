export class ApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Centralize timeouts and safe errors. Provider URLs can contain API keys,
// so never include those URLs, raw provider bodies, or fetch errors in responses.
export async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new ApiError('The data provider could not be reached. Please try again.', 504);
  }
  if (response.status === 429) {
    throw new ApiError(
      'The data provider is temporarily rate limited. Please try again later.',
      429
    );
  }
  if (!response.ok) {
    throw new ApiError('The data provider could not complete this request.');
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError('The data provider returned an invalid response.');
  }
}
