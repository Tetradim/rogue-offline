async function readResponseValue(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.toLowerCase().startsWith('application/json')) return response.json()
  const text = await response.text()
  return text ? { error: text } : {}
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  })
  const value = await readResponseValue(response)
  if (!response.ok) {
    const error = new Error(value.error || `Request failed with ${response.status}.`)
    error.statusCode = response.status
    throw error
  }
  return value
}

function json(path, method, body) {
  return request(path, { method, body: JSON.stringify(body) })
}

export const studioApi = {
  health: () => request('/api/health'),
  chooseFolder: description => json('/api/dialog/folder', 'POST', { description }).then(result => result.path),
  createProject: (parentDir, name) => json('/api/projects', 'POST', { parentDir, name }),
  openProject: projectDir => json('/api/projects/open', 'POST', { projectDir }),
  saveProject: (projectDir, project) => json('/api/projects', 'PUT', { projectDir, project }),
  uploadAsset: (projectDir, stageId, kind, file) => json('/api/projects/assets', 'POST', { projectDir, stageId, kind, file }),
  removeAsset: (projectDir, relativePath) => json('/api/projects/assets/remove', 'POST', { projectDir, relativePath }),
  analyzeTarget: (targetDir, project) => json('/api/targets/analyze', 'POST', { targetDir, project }),
  planDelivery: (projectDir, targetDir) => json('/api/delivery/plan', 'POST', { projectDir, targetDir }),
  applyDelivery: (projectDir, targetDir, force = false) => json('/api/delivery/apply', 'POST', { projectDir, targetDir, force }),
  uninstallDelivery: (targetDir, modId) => json('/api/delivery/uninstall', 'POST', { targetDir, modId }),
  packageProject: (projectDir, outputDir, targetId) => json('/api/delivery/package', 'POST', { projectDir, outputDir, targetId }),
}
