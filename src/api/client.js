async function readResponseValue(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.toLowerCase().startsWith('application/json')) {
    return response.json()
  }
  const text = await response.text()
  return text ? { error: text } : {}
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const value = await readResponseValue(response)
  if (!response.ok) {
    const error = new Error(value.error || `Request failed with ${response.status}.`)
    error.statusCode = response.status
    throw error
  }
  return value
}

export const studioApi = {
  health: () => request('/api/health'),
  chooseFolder: description => request('/api/dialog/folder', {
    method: 'POST',
    body: JSON.stringify({ description }),
  }).then(result => result.path),
  createProject: (parentDir, name) => request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ parentDir, name }),
  }),
  openProject: projectDir => request('/api/projects/open', {
    method: 'POST',
    body: JSON.stringify({ projectDir }),
  }),
  saveProject: (projectDir, project) => request('/api/projects', {
    method: 'PUT',
    body: JSON.stringify({ projectDir, project }),
  }),
}
