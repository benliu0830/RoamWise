// The same handler runs locally and as a Vercel Node.js Function.
// This endpoint deliberately returns no credentials or environment values.
export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  return response.status(200).json({ status: 'ok', application: 'Roamwise' });
}
