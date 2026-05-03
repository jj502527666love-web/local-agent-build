let cloudToken: string | null = null

interface CloudPermissions {
  allow_custom_provider: boolean
}

let cloudPermissions: CloudPermissions = { allow_custom_provider: false }

const CLOUD_API_BASE = 'https://agent-admin.o455.com/api'

export function setCloudToken(token: string | null): void {
  cloudToken = token
}

export function getCloudToken(): string | null {
  return cloudToken
}

export function getCloudApiBase(): string {
  return CLOUD_API_BASE
}

export function getCloudGatewayUrl(): string {
  return `${CLOUD_API_BASE}/gateway`
}

export function setCloudPermissions(perms: Partial<CloudPermissions>): void {
  cloudPermissions = { ...cloudPermissions, ...perms }
}

export function getAllowCustomProvider(): boolean {
  return cloudPermissions.allow_custom_provider
}
