import { app, shell, BrowserWindow, session, nativeImage, protocol, ipcMain } from 'electron'
import { join } from 'path'
import { createReadStream, existsSync, statSync } from 'fs'
import { Readable } from 'stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { getDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'
import { backfillCreationGallery } from './services/gallery'
import { cleanupStaleGenerations } from './services/image-generation'
import { getThumbnailBytes, getThumbnailPlaceholderBytes, queueThumbnail } from './services/thumbnail'
import { stopAllMcpServers } from './services/mcp-server'
import { getDataDir } from './services/data-path'
import { runStartupTasks as runBackupStartupTasks, recoverInterruptedRestore } from './services/backup'
import { getRuntimeConfig } from './services/runtime-config'
import { getSetting } from './services/settings'
import { startAutoDownloadScheduler, stopAutoDownloadScheduler } from './services/video-generation'
import { ensureIntegrityOrPrompt } from './services/integrity-check'
import { initAccountContext, isAccountReady } from './services/account-context'
import { runInEpoch } from './services/account-epoch'
import { getDeviceSetting } from './services/device-settings'

if (is.dev) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
}

function configureStableUserDataPath(): void {
  const cfg = getRuntimeConfig()
  if (cfg.buildMode !== 'oem' || !cfg.oemProjectKey) return
  const safeKey = cfg.oemProjectKey.replace(/[^a-z0-9-]/g, '').slice(0, 64)
  if (!safeKey) return
  app.setPath('userData', join(app.getPath('appData'), `local-agent-oem-${safeKey}`))
}

configureStableUserDataPath()

type WindowCloseBehavior = 'close-window' | 'minimize'

let isQuitting = false
const gotSingleInstanceLock = app.requestSingleInstanceLock()

function getLocalFileMime(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'mkv') return 'video/x-matroska'
  if (ext === 'mpeg' || ext === 'mpg') return 'video/mpeg'
  return 'application/octet-stream'
}

function createLocalFileResponse(filePath: string, request: Request): Response {
  const stat = statSync(filePath)
  const mime = getLocalFileMime(filePath)
  const range = request.headers.get('range')
  if (range && stat.size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      let start = match[1] ? Number(match[1]) : 0
      let end = match[2] ? Number(match[2]) : stat.size - 1
      if (!Number.isFinite(start) || start < 0) start = 0
      if (!Number.isFinite(end) || end >= stat.size) end = stat.size - 1
      if (start <= end) {
        const stream = createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(stream) as any, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
    }
  }
  const stream = createReadStream(filePath)
  return new Response(Readable.toWeb(stream) as any, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

if (!gotSingleInstanceLock) {
  app.quit()
}

function getWindowCloseBehavior(): WindowCloseBehavior {
  try {
    // 设备级优先；老用户首次回退账号库旧值（迁移兼容），避免设置丢失。
    // 仅在账号已就绪时才回退读库——否则未登录关闭登录窗会触发 getDatabase()，凭空建出空库。
    let v = getDeviceSetting('window_close_behavior')
    if (v == null && isAccountReady()) {
      try { v = getSetting('window_close_behavior') } catch {}
    }
    return v === 'minimize' ? 'minimize' : 'close-window'
  } catch {
    return 'close-window'
  }
}

function createAppIcon(): Electron.NativeImage {
  const paths = [
    join(__dirname, '../../build/icon.png'),
    join(process.resourcesPath || '', 'icon.png')
  ]
  for (const p of paths) {
    if (existsSync(p)) return nativeImage.createFromPath(p)
  }
  const svg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
    <rect width="256" height="256" rx="48" fill="#F27638"/>
    <rect x="53" y="68" width="22" height="120" rx="2" fill="white"/>
    <rect x="53" y="168" width="62" height="20" rx="2" fill="white"/>
    <path d="M163 68 L203 188 L183 188 L175 166 L151 166 L143 188 L123 188 L163 68Z" fill="white"/>
    <path d="M163 102 L154 152 L172 152 Z" fill="#F27638"/>
  </svg>`
  return nativeImage.createFromBuffer(Buffer.from(svg), { scaleFactor: 1 })
}

function createWindow(): BrowserWindow {
  const isWin = process.platform === 'win32'
  // Windows 使用 hidden 标题栏 + titleBarOverlay 方案：保留右上角最小/最大/关闭按钮，
  // UI 顶栏自渲染并 app-drag 实现窗口拖动。
  // macOS 使用原生标题栏（含红黄绿 traffic light + 标题文字）：避免 traffic light
  // 与 sidebar logo 重叠的视觉冲突，符合 Mac 用户习惯。
  // Linux 同 Mac，用原生标题栏。
  const winOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: getRuntimeConfig().appName || 'LocalAgent',
    icon: createAppIcon(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  }
  if (isWin) {
    winOptions.frame = false
    winOptions.titleBarStyle = 'hidden'
    winOptions.titleBarOverlay = {
      color: '#ffffff',
      symbolColor: '#212529',
      height: 36
    }
  }
  const mainWindow = new BrowserWindow(winOptions)

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    if (getWindowCloseBehavior() === 'minimize') {
      event.preventDefault()
      mainWindow.minimize()
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function showOrCreateMainWindow(): void {
  const existingWindow = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed())
  if (!existingWindow) {
    createWindow()
    return
  }
  if (existingWindow.isMinimized()) existingWindow.restore()
  if (!existingWindow.isVisible()) existingWindow.show()
  existingWindow.focus()
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
])

app.commandLine.appendSwitch('ignore-certificate-errors')

// Windows 专用：屏蔽 Xbox Game Bar overlay 探测导致的「需要使用新应用以打开此
// ms-gamingoverlay 链接」弹窗。
// 触发场景：用户系统精简了 Xbox Game Bar UWP 包，但残留 ms-gamingoverlay 协议
// 注册表项；Electron 内嵌 Chromium 的 GPU 进程启动时探测 Game Bar 兼容性，
// Shell 找不到处理程序就弹窗。
if (process.platform === 'win32') {
  // 1) 减少 Chromium GPU 进程触发 Game Bar 探测的频率
  app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling')
  // 2) 兜底：把自己注册成 ms-gamingoverlay 协议处理器，让 Shell 总能找到处理者
  //    Chromium 探测通常只查注册表项是否存在，几乎不会真正启动协议
  try {
    app.setAsDefaultProtocolClient('ms-gamingoverlay')
  } catch {}
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    showOrCreateMainWindow()
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId(getRuntimeConfig().appId)

    // 核心运行时组件完整性自检：ffmpeg.dll 等缺失/损坏时弹窗引导修复并终止，
    // 避免后续创建窗口加载媒体栈时白屏/崩溃（详见 services/integrity-check.ts）。
    if (!ensureIntegrityOrPrompt()) {
      app.quit()
      return
    }

  protocol.handle('local-file', (request) => {
    try {
      const url = new URL(request.url)
      // 支持相对路径模式: local-file://img?rel=images/xxx/yyy.png
      // 也兼容绝对路径模式: local-file://img?p=C:/xxx/yyy.png (旧数据)
      let filePath = url.searchParams.get('rel') || ''
      if (!filePath) {
        filePath = url.searchParams.get('p') || ''
      } else {
        // 相对路径 → 拼接数据目录
        filePath = join(getDataDir(), filePath)
      }
      if (!filePath || !existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      // 缩略图模式：?thumb=1 → 返回 360px JPEG 缩略图（首次生成后磁盘缓存）
      // 用于图库等多图列表，避免按原图分辨率解码导致的卡顿
      if (url.searchParams.get('thumb') === '1') {
        const thumb = getThumbnailBytes(filePath, false)
        if (thumb) {
          // 转 Uint8Array 让 Response 类型签名通过；底层零拷贝
          return new Response(new Uint8Array(thumb.data), { headers: { 'Content-Type': thumb.mime, 'Access-Control-Allow-Origin': '*' } })
        }
        queueThumbnail(filePath).catch(() => {})
        const placeholder = getThumbnailPlaceholderBytes()
        return new Response(new Uint8Array(placeholder.data), { headers: { 'Content-Type': placeholder.mime, 'Access-Control-Allow-Origin': '*' } })
      }
      return createLocalFileResponse(filePath, request)
    } catch (e) {
      console.error('local-file protocol error:', e)
      return new Response('Error', { status: 500 })
    }
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    headers['Content-Security-Policy'] = [
      is.dev
        ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: https: http:; img-src 'self' data: https: http: local-file:; media-src 'self' https: http: local-file: blob:"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http:; img-src 'self' data: https: http: local-file:; media-src 'self' https: http: local-file: blob:"
    ]
    // Bypass CORS for cloud API requests（apiDomain 由 inject 注入，dev fallback 默认）
    const apiHost = (() => {
      try { return new URL(getRuntimeConfig().apiDomain).hostname } catch { return '' }
    })()
    if (apiHost && details.url.includes(apiHost)) {
      headers['Access-Control-Allow-Origin'] = ['*']
      headers['Access-Control-Allow-Headers'] = ['*']
      headers['Access-Control-Allow-Methods'] = ['*']
    }
    callback({ responseHeaders: headers })
  })

  // 账号数据隔离：在恢复自愈与打开数据库【之前】先确定当前账号目录并注入 data-path。
  // 时序硬约束——否则 recoverInterruptedRestore() / getDatabase() 会落到错误目录。
  try {
    initAccountContext()
  } catch (e) {
    console.error('[account] initAccountContext failed:', e)
  }

  // 桌面端必须登录才能使用：仅当账号已确定（已登录用户读 account-map / 老用户原地继承）时
  // 才打开数据库并跑依赖 db 的启动任务。全新且从未登录时不建任何库（无 guest），停在登录页；
  // 用户登录后 setActiveAccount 触发热切换（关旧库开新库 + reload 渲染层），渲染层重载后即进入此就绪分支。
  if (isAccountReady()) {
    // 崩溃自愈：上次"恢复"中途被中断时，回滚到恢复前数据。
    // 必须在打开数据库【之前】同步执行，避免新/半成品 db 被打开后产生文件锁导致回滚失败。
    try {
      recoverInterruptedRestore()
    } catch (e) {
      console.error('[backup] restore self-heal failed:', e)
    }

    // 启动期 db 任务统一绑定当前账号代次（epoch=启动时的 0）：若用户在这些任务（尤其异步的自动备份）
    // 进行中登录切到别的账号（热切换会 bumpEpoch），任务 await 后的 getDatabase() 将因代次不符被
    // assertEpoch 拒绝，避免把旧账号的回填/清理/备份数据写进新账号库。
    // （relaunch 版靠进程重启天然规避此问题，热切换不重启进程，需显式用 runInEpoch 绑定。）
    runInEpoch(() => {
      // Initialize database
      getDatabase()

      // 一次性回填：将已存在的 image_generations.result_path 归入图库「创作」分类
      // 通过 settings.gallery_backfill_done 标记幂等，仅首次启动跑
      try {
        const result = backfillCreationGallery()
        if (result.total > 0) {
          console.log(`[Gallery] Backfill creation: added ${result.added}, skipped ${result.skipped}, total ${result.total}`)
        }
      } catch (e) {
        console.error('[Gallery] Backfill failed:', e)
      }

      // 启动时清理上次崩溃残留的"生成中"图片任务（避免 UI 永久转圈）
      try {
        cleanupStaleGenerations()
      } catch (e) {
        console.error('[ImageGen] cleanupStaleGenerations failed:', e)
      }

      // Backup startup tasks: 清理上次崩溃残骸 + 异步触发自动备份（如配置）
      runBackupStartupTasks().catch((e) => console.error('Backup startup error:', e))
      startAutoDownloadScheduler()
    })
  }

  // Register all IPC handlers（不依赖 db，始终注册：登录页也要用 cloud/dataDir 等 IPC）
  registerIpcHandlers()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Auto updater (production only)
  if (!is.dev) {
    setupAutoUpdater()
  }

  app.on('activate', () => {
    showOrCreateMainWindow()
  })
})
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  // mac 未签名场景：Squirrel.Mac 在 quitAndInstall 阶段调 SecCodeCheckValidity 校验当前
  // 运行 .app 的代码签名，未签名直接 reject，UI 上「下载完成 → 点重启安装」会变成
  // 「app 退出但 .app 没被替换 → 重启依然是旧版」的静默失败。
  // 更关键：electron-updater MacUpdater 在 update-downloaded 后若 autoInstallOnAppQuit=true，
  // 会立刻调 nativeUpdater(Squirrel.Mac).checkForUpdates() 触发签名校验，未签名直接 emit
  // error → 我们的 UI 状态机会从「下载完成」秒切到「更新失败」。所以 mac 必须把
  // autoInstallOnAppQuit 关掉，配合下面 updater:install 改为「打开下载目录」走手动覆盖。
  // 等接入 Apple Developer 签名+公证后这两段都可以回滚。
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin'

  let downloadedFilePath: string | null = null

  function sendToRenderer(channel: string, ...args: unknown[]): void {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send(channel, ...args)
  }

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('updater:available', { version: info.version, releaseNotes: info.releaseNotes })
  })

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('updater:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:progress', { percent: Math.round(progress.percent), transferred: progress.transferred, total: progress.total })
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    downloadedFilePath = typeof info?.downloadedFile === 'string' ? info.downloadedFile : null
    sendToRenderer('updater:downloaded', { manualInstall: process.platform === 'darwin' })
  })

  autoUpdater.on('error', (err) => {
    sendToRenderer('updater:error', err?.message || String(err))
  })

  // IPC from renderer
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { currentVersion: app.getVersion(), latestVersion: result?.updateInfo?.version }
    } catch (e: any) {
      return { error: e?.message || String(e) }
    }
  })

  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    // mac 未签名兜底：跳过 Squirrel.Mac（必失败），在 Finder 中高亮 zip，
    // 用户手动覆盖 /Applications/{App}.app。等签名+公证落地后此分支可删。
    if (process.platform === 'darwin') {
      if (downloadedFilePath) {
        shell.showItemInFolder(downloadedFilePath)
        return { mode: 'manual', path: downloadedFilePath }
      }
      return { error: 'no_downloaded_file' }
    }
    autoUpdater.quitAndInstall(false, true)
    return { mode: 'auto' }
  })

  ipcMain.handle('updater:getVersion', () => app.getVersion())

  // Check for updates 3 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)
}

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  isQuitting = true
  stopAutoDownloadScheduler()
  stopAllMcpServers()
  closeDatabase()
})
