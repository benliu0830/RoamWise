const allowedKeys = new Set(['GEMINI_API_KEY', 'GEOAPIFY_API_KEY']);

// Read credentials only when an API request needs them, never in browser code.
export function requireApiKey(name) {
  if (!allowedKeys.has(name)) throw new Error('Unsupported API configuration.');
  const value = process.env[name]?.trim();
  if (!value) {
    const error = new Error(`${name} is not configured on the server.`);
    error.status = 503;
    throw error;
  }
  return value;
}
