# 桌面端发布与 push 规范

> **触发条件**：用户说「发布桌面端」/「push 桌面端到 GitHub」/「发 vX.Y.Z」等同义指令时，按本文档执行。
> 姊妹篇：云控端更新包见 `agent-admin/docs/云控端更新包打包流程.md`。

---

## 1. 仓库拓扑与凭据

| 项 | 值 |
|---|---|
| 源码仓（remote `origin`） | `https://github.com/jj502527666love-web/local-agent.git` |
| 打包仓（remote `build`） | `https://github.com/jj502527666love-web/local-agent-build.git` |
| 云打包实际构建的 ref | **build 仓的 `main`**（`agent-build` 服务器 `GITHUB_BUILD_REF` 默认 `main`） |
| GitHub 凭据 | **已灌入本机 Git 凭据管理器（GCM / Windows 凭据管理器），push 免密**；token 本体是 agent-build 生产服务器 `.env` 的 `GITHUB_BUILD_TOKEN`（fine-grained PAT，用户 `x-access-token`） |

**凭据铁律**：
- token **明文不写入任何入库文件**（本文档、脚本、git remote URL 都不行——入库即推到 GitHub 等于泄漏）；
- 换新机器 / 凭据失效时，重新灌入（一次性，之后免密）：

```bash
printf "protocol=https\nhost=github.com\nusername=x-access-token\npassword=<GITHUB_BUILD_TOKEN>\n\n" | git credential approve
```

- token 的获取处：agent-build 生产服务器（159.75.144.224）`.env` 的 `GITHUB_BUILD_TOKEN`；轮换后需 `php artisan config:clear`（服务端）并重新灌入本机 GCM。

## 2. 发布步骤（仅 build 仓；不动 origin）

```bash
cd F:/local-agent/agent-desktop
# 1. 从当前工作分支建发布分支（版本号与 package.json 一致）
git checkout -b release-build-<X.Y.Z>
git add -A
git commit -m "chore: release desktop <X.Y.Z> to build（<一句话摘要>）"

# 2. 强推 build 仓 main（云打包只构建 main，main 必须含本次代码）
git push build release-build-<X.Y.Z>:main --force

# 3. 推发布分支本体留档（build 仓保留每个版本的发布点）
git push build release-build-<X.Y.Z>:release-build-<X.Y.Z>

# 4. 验证：main 上的版本号必须 = 目标版本
git fetch build main && git show build/main:package.json | grep '"version"'
```

## 3. 铁律（历史踩坑沉淀）

1. **构建在途时禁止 force-push build/main**：agent-build 把每个构建的图标 commit 到 main，workflow checkout main 读图标；重写 main 历史会冲掉在途构建的图标致其失败。**advance main 前先确认构建队列已清空**（0.9.x 教训）。
2. **版本号 = 所构建 ref 的 package.json.version**：普通模式派发不传 `app_version`（仅 OEM 模式传），所以 main 上的代码必须是新版——只改后台「版本」元数据不打进包里（0.8.5/0.9.0/0.9.1 连续打出 0.8.4 的教训）。
3. **publish 前确认**：`package.json` 版本已 bump、`src/shared/changelog.ts` 与 `CHANGELOG.md` 已记录；构建产物（out/、dist/）不入库。
4. **不要推 origin**：源码仓的推送由用户自行决定时机（「仅 build 仓库」是默认要求）。

## 4. 异常处理

| 异常 | 处理 |
|---|---|
| `could not read Username` / 授权弹窗失败 | 凭据未灌或失效，按第 1 节重新 `git credential approve`；非交互会话弹不出 GCM 窗口时尤其要走灌入方式 |
| `Recv failure: Connection was reset` | 本机直连 GitHub 被断（梯子/代理问题），非代码 bug；修好网络或代理后重试 |
| push 后打出的包版本号仍旧版 | main 没含新代码（漏了第 2 步强推），按第 4 步验证命令排查 |
| 误 force-push 冲掉了在途构建图标 | 等该构建失败后重新派发即可；下次先清空队列 |

## 5. 本次首刷记录（1.1.0，2026-08-12）

- `release-build-1.1.0` commit → 强推 `build/main`（5ac3d453...2c970b99 forced update）+ 分支留档 `build/release-build-1.1.0`；
- 验证 `build/main:package.json` = `1.1.0` ✓；
- 凭据经 `git credential approve` 灌入 GCM（本机首次），明文未落任何入库文件。
