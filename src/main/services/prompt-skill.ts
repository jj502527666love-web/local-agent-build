import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'fs'
import { v4 as uuid } from 'uuid'
import { app } from 'electron'
import { getDataDir } from './data-path'

export interface PromptSkill {
  id: string
  name: string
  description: string
  dirName: string
  enabled: boolean
}

interface SkillMeta {
  name: string
  description: string
  version: string
}

let bundledCopied = false

function getSkillsDir(): string {
  const dir = join(getDataDir(), 'skills')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!bundledCopied) {
    bundledCopied = true
    copyBundledSkills(dir)
  }
  return dir
}

function getBundledSkillsDir(): string {
  const isProd = app.isPackaged
  return isProd
    ? join(process.resourcesPath, 'bundled-skills')
    : join(__dirname, '../../resources/bundled-skills')
}

const SKIP_DIRS = new Set(['__pycache__', 'node_modules', '.git'])

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        copyDirRecursive(srcPath, destPath)
      }
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

function extractVersion(skillDir: string): string {
  const skillMd = join(skillDir, 'SKILL.md')
  if (!existsSync(skillMd)) return '0.0.0'
  try {
    const content = readFileSync(skillMd, 'utf-8')
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!match) return '0.0.0'
    const verMatch = match[1].match(/^version:\s*["']?([^"'\n]+)["']?$/m)
    return verMatch ? verMatch[1].trim() : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}

function copyBundledSkills(skillsDir: string): void {
  try {
    const bundledDir = getBundledSkillsDir()
    if (!existsSync(bundledDir)) return
    for (const entry of readdirSync(bundledDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const srcDir = join(bundledDir, entry.name)
      const targetDir = join(skillsDir, entry.name)
      if (!existsSync(targetDir)) {
        copyDirRecursive(srcDir, targetDir)
      } else {
        const bundledVer = extractVersion(srcDir)
        const installedVer = extractVersion(targetDir)
        if (compareVersions(bundledVer, installedVer) > 0) {
          rmSync(targetDir, { recursive: true, force: true })
          copyDirRecursive(srcDir, targetDir)
        }
      }
    }
  } catch (e) {
    console.error('Failed to copy bundled skills:', e)
  }
}

function getMetaPath(): string {
  return join(getSkillsDir(), '_meta.json')
}

function loadMeta(): Record<string, { id: string; enabled: boolean }> {
  const p = getMetaPath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return {}
  }
}

function saveMeta(meta: Record<string, { id: string; enabled: boolean }>): void {
  writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2), 'utf-8')
}

function parseFrontmatter(content: string): SkillMeta {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return { name: '', description: '', version: '' }
  const fm = match[1]
  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  const descMatch = fm.match(/^description:\s*(.*)$/m)
  let description = ''
  if (descMatch) {
    const val = descMatch[1].trim()
    if (val === '>' || val === '|' || val === '>-' || val === '|-') {
      // YAML multiline: collect indented continuation lines
      const startIdx = fm.indexOf(descMatch[0]) + descMatch[0].length
      const rest = fm.slice(startIdx)
      const lines = rest.split('\n')
      const parts: string[] = []
      let started = false
      for (const line of lines) {
        if (!started && line.trim() === '') {
          continue
        }
        if (/^\s+\S/.test(line)) {
          started = true
          parts.push(line.trim())
        } else {
          break
        }
      }
      description = parts.join(' ')
    } else {
      description = val
    }
  }
  const versionMatch = fm.match(/^version:\s*["']?([^"'\n]+)["']?$/m)
  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description,
    version: versionMatch ? versionMatch[1].trim() : ''
  }
}

export function listPromptSkills(): PromptSkill[] {
  const dir = getSkillsDir()
  const meta = loadMeta()
  const results: PromptSkill[] = []

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const skillMdPath = join(dir, entry.name, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue

    const content = readFileSync(skillMdPath, 'utf-8')
    const fm = parseFrontmatter(content)
    const m = meta[entry.name] || { id: uuid(), enabled: true }

    if (!meta[entry.name]) {
      meta[entry.name] = m
    }

    results.push({
      id: m.id,
      name: fm.name || entry.name,
      description: fm.description || '',
      dirName: entry.name,
      enabled: m.enabled
    })
  }

  saveMeta(meta)
  return results
}

export function getPromptSkillContent(dirName: string): string {
  const dir = getSkillsDir()
  const skillMdPath = join(dir, dirName, 'SKILL.md')
  if (!existsSync(skillMdPath)) return ''

  return readFileSync(skillMdPath, 'utf-8')
}

export function getPromptSkillByName(name: string): { dirName: string; content: string; skillDir: string } | null {
  const skills = listPromptSkills()
  const skill = skills.find(
    (s) => s.enabled && (s.name === name || s.dirName === name || s.name.toLowerCase() === name.toLowerCase())
  )
  if (!skill) return null
  const skillDir = join(getSkillsDir(), skill.dirName)
  return { dirName: skill.dirName, content: getPromptSkillContent(skill.dirName), skillDir }
}

export function togglePromptSkill(dirName: string, enabled: boolean): void {
  const meta = loadMeta()
  if (meta[dirName]) {
    meta[dirName].enabled = enabled
  }
  saveMeta(meta)
}

export function deletePromptSkill(dirName: string): void {
  const dir = getSkillsDir()
  const skillDir = join(dir, dirName)
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true })
  }
  const meta = loadMeta()
  delete meta[dirName]
  saveMeta(meta)

  // Cascade: remove from all bots' prompt_skill_dirs
  try {
    const { getDatabase } = require('../database')
    const db = getDatabase()
    const bots = db.prepare("SELECT id, prompt_skill_dirs FROM bots WHERE prompt_skill_dirs LIKE '%' || ? || '%'").all(dirName) as any[]
    for (const bot of bots) {
      const dirs: string[] = JSON.parse(bot.prompt_skill_dirs || '[]')
      const filtered = dirs.filter((d: string) => d !== dirName)
      if (filtered.length !== dirs.length) {
        db.prepare('UPDATE bots SET prompt_skill_dirs = ? WHERE id = ?').run(JSON.stringify(filtered), bot.id)
      }
    }
  } catch (e) {
    console.error('Failed to cleanup bot prompt_skill_dirs references:', e)
  }
}

export function getSkillsDirectory(): string {
  return getSkillsDir()
}

export function createPromptSkillFromContent(name: string, description: string, skillMdContent: string): PromptSkill {
  const dir = getSkillsDir()
  const dirName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-')
  const skillDir = join(dir, dirName)
  mkdirSync(skillDir, { recursive: true })

  const frontmatter = `---\nname: ${name}\ndescription: ${description}\n---\n\n`
  const content = skillMdContent.startsWith('---') ? skillMdContent : frontmatter + skillMdContent
  writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf-8')

  const meta = loadMeta()
  const id = uuid()
  meta[dirName] = { id, enabled: true }
  saveMeta(meta)

  return { id, name, description, dirName, enabled: true }
}
