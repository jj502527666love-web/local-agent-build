import { app, shell, BrowserWindow, session, nativeImage, protocol, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { getDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'
import { stopAllMcpServers } from './services/mcp-server'
import { getDataDir } from './services/data-path'
import { runAutoBackupIfNeeded } from './services/backup'
import { getRuntimeConfig } from './services/runtime-config'

if (is.dev) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
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

function createWindow(): void {
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
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
])

app.commandLine.appendSwitch('ignore-certificate-errors')

app.whenReady().then(async () => {
  electronApp.setAppUserModelId(getRuntimeConfig().appId)

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
      const data = readFileSync(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png'
      return new Response(data, { headers: { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' } })
    } catch (e) {
      console.error('local-file protocol error:', e)
      return new Response('Error', { status: 500 })
    }
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    headers['Content-Security-Policy'] = [
      is.dev
        ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: https: http:; img-src 'self' data: https: http: local-file:"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http:; img-src 'self' data: https: http: local-file:"
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

  // Initialize database
  getDatabase()

  // Register all IPC handlers
  registerIpcHandlers()

  // Auto backup check (non-blocking)
  runAutoBackupIfNeeded().catch((e) => console.error('Auto backup error:', e))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Auto updater (production only)
  if (!is.dev) {
    setupAutoUpdater()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

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

  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('updater:downloaded')
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
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.handle('updater:getVersion', () => app.getVersion())

  // Check for updates 3 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopAllMcpServers()
  closeDatabase()
})
