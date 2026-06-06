// electron-builder afterPack 钩子：在文件落地到 win-unpacked、打成安装器之前，
// 为关键运行时文件生成完整性基线 resources/integrity-manifest.json。
//
// 用途：桌面端启动时由 src/main/services/integrity-check.ts 读取本清单，
// 校验 ffmpeg.dll 等核心组件是否被杀毒软件误删 / 安装下载损坏，缺失即弹窗引导修复。
//
// 仅处理 win：mac 的同类库是 Frameworks 内的 libffmpeg.dylib，命名/布局不同，首版不覆盖。

const { createHash } = require('crypto')
const { readFileSync, writeFileSync, existsSync, statSync } = require('fs')
const { join } = require('path')

// critical=true：缺失会直接导致启动崩溃，必须校验（含 hash）；false：重要但缺失影响面较小
const TARGETS = [
  { path: 'ffmpeg.dll', critical: true }, // Chromium 媒体解码：视频预览 / 抽帧强依赖
  { path: 'resources/app.asar', critical: true }, // 应用主体
  { path: 'libEGL.dll', critical: false },
  { path: 'libGLESv2.dll', critical: false },
  { path: 'd3dcompiler_47.dll', critical: false },
  { path: 'vk_swiftshader.dll', critical: false },
  { path: 'icudtl.dat', critical: false },
  { path: 'resources.pak', critical: false },
  { path: 'v8_context_snapshot.bin', critical: false }
]

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context
  if (electronPlatformName !== 'win32') return

  const files = []
  for (const t of TARGETS) {
    const abs = join(appOutDir, t.path)
    if (!existsSync(abs)) continue // 某些 Electron 版本可能不含该文件，跳过而非报错
    const buf = readFileSync(abs)
    files.push({
      path: t.path.replace(/\\/g, '/'),
      size: statSync(abs).size,
      sha256: createHash('sha256').update(buf).digest('hex'),
      critical: t.critical
    })
  }

  const manifest = {
    appVersion: packager.appInfo.version,
    generatedAt: new Date().toISOString(),
    files
  }

  const out = join(appOutDir, 'resources', 'integrity-manifest.json')
  writeFileSync(out, JSON.stringify(manifest, null, 2))
  console.log(`[after-pack] integrity manifest written: ${files.length} files -> ${out}`)
}
