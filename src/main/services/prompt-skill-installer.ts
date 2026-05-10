import { join } from 'path'
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs'
import { getDataDir } from './data-path'

async function extractZipNative(zipPath: string, destDir: string): Promise<void> {
  const { execSync } = await import('child_process')
  mkdirSync(destDir, { recursive: true })
  if (process.platform === 'win32') {
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { timeout: 30000 }
    )
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { timeout: 30000 })
  }
}

function findSkillMd(dir: string): string | null {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isFile() && entry.name === 'SKILL.md') return dir
    if (entry.isDirectory()) {
      const sub = findSkillMd(join(dir, entry.name))
      if (sub) return sub
    }
  }
  return null
}

export async function installSkillFromUrl(url: string): Promise<{ success: boolean; name?: string; error?: string }> {
  const tmpDir = join(require('os').tmpdir(), `skill-install-${Date.now()}`)
  const zipPath = join(tmpDir, 'download.zip')

  try {
    mkdirSync(tmpDir, { recursive: true })

    // Download
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const contentType = response.headers.get('content-type') || ''
    const buffer = Buffer.from(await response.arrayBuffer())
    console.log(`[skill-install] url=${url} contentType=${contentType} size=${buffer.length} first50=${buffer.slice(0, 50).toString('utf-8').replace(/[^\x20-\x7e]/g, '.')}`)

    // If response is JSON, try to extract actual download URL
    if (contentType.includes('json') || (buffer.length < 10000 && buffer[0] === 0x7b)) {
      try {
        const json = JSON.parse(buffer.toString('utf-8'))
        console.log(`[skill-install] JSON response:`, JSON.stringify(json).slice(0, 500))
        const actualUrl = json.data?.url || json.data?.download_url || json.url || json.download_url
        if (actualUrl) {
          console.log(`[skill-install] following download URL: ${actualUrl}`)
          const dlResp = await fetch(actualUrl, { redirect: 'follow' })
          if (!dlResp.ok) throw new Error(`Actual download failed: ${dlResp.status}`)
          const dlBuffer = Buffer.from(await dlResp.arrayBuffer())
          writeFileSync(zipPath, dlBuffer)
          console.log(`[skill-install] actual file size=${dlBuffer.length}`)
        } else {
          throw new Error(`API returned JSON but no download URL found: ${JSON.stringify(json).slice(0, 200)}`)
        }
      } catch (e: any) {
        if (e.message.includes('API returned JSON')) throw e
        throw new Error(`Failed to parse download response: ${e.message}`)
      }
    } else {
      writeFileSync(zipPath, buffer)
    }

    // Extract
    const extractDir = join(tmpDir, 'extracted')
    await extractZipNative(zipPath, extractDir)

    // Log extracted contents for debugging
    const listDir = (d: string, prefix = ''): string[] => {
      const items: string[] = []
      try {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          items.push(prefix + e.name + (e.isDirectory() ? '/' : ''))
          if (e.isDirectory()) items.push(...listDir(join(d, e.name), prefix + '  '))
        }
      } catch {}
      return items
    }
    console.log(`[skill-install] extracted contents:\n${listDir(extractDir).join('\n')}`)

    // Find SKILL.md
    const skillDir = findSkillMd(extractDir)
    if (!skillDir) throw new Error('No SKILL.md found in archive')

    // Parse frontmatter for name
    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')
    const nameMatch = content.match(/^name:\s*(.+)$/m)
    const skillName = nameMatch ? nameMatch[1].trim() : 'unknown-skill'
    const dirName = skillName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-')

    // Copy to skills directory
    const destDir = join(getDataDir(), 'skills', dirName)
    mkdirSync(destDir, { recursive: true })

    // Copy all files recursively
    copyDirSync(skillDir, destDir)

    // Cleanup temp
    const { rmSync } = require('fs')
    rmSync(tmpDir, { recursive: true, force: true })

    return { success: true, name: skillName }
  } catch (err: any) {
    try {
      const { rmSync } = require('fs')
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
    return { success: false, error: err.message || String(err) }
  }
}

export interface MarketSkill {
  name: string
  description: string
  slug: string
  url: string
  version?: string
  author?: string
  downloads?: number
  stars?: number
  score?: number
  updated_at?: number
  source?: string
}

export async function searchMarketSkills(
  keyword: string
): Promise<{ results: MarketSkill[]; total: number }> {
  // Try SkillHub API first (lightmake.site)
  try {
    const apiUrl = `http://lightmake.site/api/skills?keyword=${encodeURIComponent(keyword)}`
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const data = await response.json()

    if (data.code === 0 && data.data?.skills) {
      const results: MarketSkill[] = data.data.skills.map((s: any) => ({
        name: s.name || '',
        description: s.description_zh || s.description || '',
        slug: s.slug || '',
        url: `http://lightmake.site/api/v1/download?slug=${encodeURIComponent(s.slug || '')}`,
        version: s.version || '',
        author: s.ownerName || '',
        downloads: s.downloads || 0,
        stars: s.stars || 0,
        score: s.score || 0,
        updated_at: s.updated_at || 0,
        source: 'skillhub'
      }))
      console.log(`[skillhub] search "${keyword}": found ${results.length} skills`)
      return { results, total: data.data.total || results.length }
    }
  } catch (err: any) {
    console.log(`[skillhub] search failed: ${err.message}`)
  }

  // Fallback: scrape CocoLoop
  try {
    const searchUrl = `https://hub.cocoloop.cn/search?keyword=${encodeURIComponent(keyword)}`
    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    const html = await response.text()

    const dlMatches = html.match(/dl\.cocoloop\.cn\/bss\/skills\/[^\\"'\s\\]+/g) || []
    const dlUrls = Array.from(new Set(dlMatches.map((u: string) => 'https://' + u.replace(/\\$/, ''))))
    const nameMatches = html.match(/SkillCard_titleEn[^>]*>([^<]+)/g) || []
    const names = nameMatches.map((m: string) => m.replace(/SkillCard_titleEn[^>]*>/, ''))
    const descMatches = html.match(/SkillCard_desc[^>]*>([^<]+)/g) || []
    const descs = descMatches.map((m: string) => m.replace(/SkillCard_desc[^>]*>/, ''))

    const results: MarketSkill[] = []
    for (let i = 0; i < names.length; i++) {
      results.push({ name: names[i] || '', description: descs[i] || '', slug: '', url: dlUrls[i] || '', source: 'cocoloop' })
    }
    console.log(`[cocoloop] search "${keyword}": found ${results.length} skills`)
    return { results, total: results.length }
  } catch (err: any) {
    console.log(`[cocoloop] search also failed: ${err.message}`)
  }

  return { results: [], total: 0 }
}

function copyDirSync(src: string, dest: string): void {
  const { copyFileSync, readdirSync, mkdirSync, statSync } = require('fs')
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}
