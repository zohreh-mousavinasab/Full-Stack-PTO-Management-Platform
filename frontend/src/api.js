const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const detail = typeof data === 'string' ? data : data?.detail || 'Request failed'
    throw new Error(detail)
  }

  return data
}

export async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  return parseResponse(response)
}

export { API_BASE }

