import request from './request'

const silentConfig = { _silent: true }

export const getAdminUsers = (params = {}) => {
  return request.get('/users/', { params, ...silentConfig })
}

export const getAdminProjects = (params = {}) => {
  return request.get('/projects/', { params, ...silentConfig })
}

export const getAdminTemplates = (params = {}) => {
  return request.get('/crf-templates/', { params, ...silentConfig })
}

export const getAdminDocuments = (params = {}) => {
  return request.get('/documents/', { params, ...silentConfig })
}

export const getAdminStats = () => {
  return request.get('/stats/dashboard', silentConfig)
}

export const getAdminActiveTasks = () => {
  return request.get('/stats/active-tasks', silentConfig)
}

export const getProjectExtractionTasks = (projectId, params = {}) => {
  return request.get(`/projects/${projectId}/crf/extraction/tasks`, { params, ...silentConfig })
}

export const getAdminExtractionTasks = (params = {}) => {
  return request.get('/admin/extraction-tasks', { params, ...silentConfig })
}

export const getAdminExtractionTaskDetail = (id, params = {}) => {
  return request.get(`/admin/extraction-tasks/${id}`, { params, ...silentConfig })
}

export const resubmitAdminExtractionTask = (id, data = {}) => {
  return request.post(`/admin/extraction-tasks/${id}/resubmit`, data)
}
