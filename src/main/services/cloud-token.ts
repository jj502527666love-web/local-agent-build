import { getRuntimeConfig } from './runtime-config'

let cloudToken: string | null = null

interface CloudPermissions {
  allow_custom_provider: boolean
  allow_custom_embedding: boolean
}

// 默认：未登录状态下，本地能力（自定义模型/向量）保持可用，避免破坏旧用户体验
let cloudPermissions: CloudPermissions = {
  allow_custom_provider: false,
  allow_custom_embedding: true,
}

export interface CloudEmbeddingModel {
  id: number
  model_id: string
  name: string
}

// 渲染进程通过 fetchCloudData 同步过来的云端 embedding 模型列表
let cloudEmbeddingModels: CloudEmbeddingModel[] = []
// 用户在 SettingsView 选择的偏好云端 embedding 模型 model_id
let preferredCloudEmbeddingModel = ''

export function setCloudToken(token: string | null): void {
  cloudToken = token
}

export function getCloudToken(): string | null {
  return cloudToken
}

export function getCloudApiBase(): string {
  return `${getRuntimeConfig().apiDomain}/api`
}

export function getCloudGatewayUrl(): string {
  return `${getCloudApiBase()}/gateway`
}

export function setCloudPermissions(perms: Partial<CloudPermissions>): void {
  cloudPermissions = { ...cloudPermissions, ...perms }
}

export function getAllowCustomProvider(): boolean {
  return cloudPermissions.allow_custom_provider
}

export function getAllowCustomEmbedding(): boolean {
  return cloudPermissions.allow_custom_embedding
}

export function setCloudEmbeddingModels(models: CloudEmbeddingModel[]): void {
  cloudEmbeddingModels = Array.isArray(models) ? models : []
}

export function getCloudEmbeddingModels(): CloudEmbeddingModel[] {
  return cloudEmbeddingModels
}

export function setPreferredCloudEmbeddingModel(modelId: string): void {
  preferredCloudEmbeddingModel = modelId || ''
}

export function getPreferredCloudEmbeddingModel(): string {
  return preferredCloudEmbeddingModel
}

/**
 * 当前生效的云端 embedding 模型 model_id：
 * 1. 用户偏好且仍在可用列表中 → 用偏好
 * 2. 否则取列表第一个
 * 3. 列表空 → 空字符串（调用方需返回错误：套餐未含向量模型）
 */
export function getActiveCloudEmbeddingModelId(): string {
  if (preferredCloudEmbeddingModel) {
    const hit = cloudEmbeddingModels.find((m) => m.model_id === preferredCloudEmbeddingModel)
    if (hit) return hit.model_id
  }
  return cloudEmbeddingModels[0]?.model_id || ''
}
