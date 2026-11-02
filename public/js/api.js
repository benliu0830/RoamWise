export async function api(path, body, { signal } = {}) {
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: signal || AbortSignal.timeout(55000)
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('The connection took too long or was interrupted. Please try again.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an unexpected response. Please try again.');
  }
  if (!response.ok) throw new Error(data.error || 'This request could not be completed.');
  return data;
}
