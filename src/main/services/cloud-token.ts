import { getRuntimeConfig } from './runtime-config'

let cloudToken: string | null = null

interface CloudPermissions {
  allow_custom_provider: boolean
}

let cloudPermissions: CloudPermissions = { allow_custom_provider: false }

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
