# Azure DevOps Pipelines 接入指南

作为 GitHub Actions 的**备份云打包通道**。仓库根目录已有 `azure-pipelines.yml`，此文档指导首次接入。

## 什么时候用

- GitHub Actions 的 macOS runner 排队超过 10 分钟
- GitHub Actions 免费额度（私有仓库 200 分钟 mac/月）用尽
- 需要更高的 macOS 免费额度（Azure 不对 mac 加倍率，1800 分钟可用）

日常打包**仍以 GitHub Actions 为主**，这是后备方案。

---

## 一次性接入步骤

### 第 1 步：注册 Azure DevOps

1. 打开 <https://dev.azure.com>
2. 用**微软账号**登录（没有就注册一个，免费）
3. 首次登录会引导创建 **Organization**（组织）
   - 名字随便起，比如 `your-name` 或 `your-company`
   - 区域选 **East Asia** 或 **Southeast Asia**（距离最近）
4. 创建 **Project**（项目）
   - Project name: `local-agent-build`
   - Visibility: **Private**（和 GitHub 仓库保持一致）
   - 其他默认

### 第 2 步：申请免费并发额度（关键，不做会一直排队）

Azure DevOps 对 2021 年之后新注册的账号**默认不给免费并发**，必须手动申请：

1. 打开 <https://aka.ms/azpipelines-parallelism-request>
2. 填表（英文填写，关键字段）：
   - **Organization name**: 第 1 步里创建的 Organization 名字
   - **Email**: 你的微软账号邮箱
   - **Do you plan to use Azure Pipelines to build Microsoft-owned code?**: No
   - **Do you plan to use Azure Pipelines to build open source code?**: No（这是私有项目）
   - **Reason for requesting parallelism**: 写清楚需求，例：
     > Need free parallel job for CI/CD of internal Electron desktop app, as fallback to GitHub Actions macOS runners which often have long queue times.
3. 提交后等待 **2~3 个工作日**邮件审批
4. 审批通过后：**Private project** 获得 1 个 parallel job + 1800 分钟/月

> 在审批通过前，pipeline 可以保存配置但无法真正运行。

### 第 3 步：连接 GitHub 仓库

审批邮件到达后：

1. 进入你的 Project → 左侧菜单 **Pipelines** → **New pipeline**
2. **Where is your code?** → 选 **GitHub**
3. 首次会跳转 GitHub OAuth 授权：
   - 授权 **Azure Pipelines** 访问你的 GitHub
   - 授权范围选 `jj502527666love-web/local-agent-build` 即可，不用全部仓库
4. **Select a repository** → 选 `jj502527666love-web/local-agent-build`
5. 可能会弹出 **GitHub App** 安装页面 → 安装到目标仓库
6. **Configure your pipeline** → 选 **Existing Azure Pipelines YAML file**
7. **Path** → 选 `/azure-pipelines.yml`
8. **Review your pipeline YAML** → 不用改，点右上角 **Save**（**不要点 Run and save**，先只保存配置）

保存后会得到一个 Pipeline 名字，类似 `local-agent-build`。

---

## 日常使用

### 手动触发打包

1. Azure DevOps → Project → **Pipelines**
2. 选中 `local-agent-build` pipeline
3. 右上角 **Run pipeline**
4. 参数（可选）：
   - **version**: 填版本号，比如 `0.5.5`（目前仅作 UI 记录，不影响打包）
5. **Run**

两端 matrix（Windows + macOS）会**并行**构建。

### 查看进度

Run 详情页左侧显示两个 job：
- **Build windows** (windows-latest)
- **Build mac** (macOS-13)

点任意一个看实时日志。预计：
- Windows: 3~5 分钟
- macOS: 5~10 分钟（含排队）

### 下载产物

Run 详情页顶部区域 → **Related** → **2 published** → 点进去：
- `win-build` - 包含 `.exe` 和 `latest.yml`
- `mac-build` - 包含 `.dmg` 和 `latest-mac.yml`

点 **Download** 下载对应 zip 包。

---

## GitHub Actions vs Azure Pipelines 对比速查

| 维度 | GitHub Actions | Azure Pipelines |
|---|---|---|
| 配置文件 | `.github/workflows/build.yml` | `azure-pipelines.yml`（仓库根） |
| 免费额度（private） | 2000min Linux 基础分钟 | 1800min/月 单并发 |
| macOS 倍率 | **10x**（200 分钟实际可用） | **1x**（1800 分钟全部可用） |
| Windows 倍率 | 2x | 1x |
| 触发入口 | GitHub → Actions → Run workflow | Azure DevOps → Pipelines → Run pipeline |
| 产物位置 | Run → Artifacts | Run → Published |
| Mac runner 硬件 | 同一批 Apple 机房，排队速度差不多 | 同一批 Apple 机房，排队速度差不多 |

**结论**：Azure 的 macOS 免费额度**比 GitHub 实惠**（没有 10x 倍率），作为备份值得保留。

---

## 常见问题

### Q1：Pipeline 保存后点 Run 一直卡在 "Waiting for approval"

A：说明第 2 步的免费并发额度还没申请或还没审批通过。去邮箱看微软的邮件，或到 **Project Settings → Parallel jobs** 查看 Private 项目的并发数，如果是 0 就是没申请到。

### Q2：Run 到一半报错 `No hosted parallelism has been purchased or granted`

A：同上，并发额度未授权。填表等审批。

### Q3：GitHub 仓库更新了，Azure 里看到的 YAML 是旧的？

A：Azure Pipelines 每次 Run 都**从 GitHub 最新代码**拉取（除非你在 Triggers 固定了分支）。如果不放心，Run 时可以选择具体的 commit。

### Q4：签名相关错误（codesign failed / No identity found）

A：`azure-pipelines.yml` 里已设置 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` 跳过签名。如果后续要启用签名，参考 electron-builder 文档，在 Azure 的 **Library → Secure files** 上传 p12 证书。

### Q5：better-sqlite3 原生模块编译失败

A：常见于 Node 版本不匹配。`azure-pipelines.yml` 已锁定 Node 22，与 `@.github/workflows/build.yml` 保持一致。如果还出错，确认本地 `npm ci` 能跑通。

---

## 关联文件

- 仓库根 `azure-pipelines.yml` - Azure Pipelines 配置
- `.github/workflows/build.yml` - GitHub Actions 配置（主通道）
- `electron-builder.yml` - 打包产物规格
- `package.json` - 版本号权威来源

---

## 一次性设置 checklist

- [ ] 注册 Azure DevOps 账号和 Organization
- [ ] 创建 Project（私有）
- [ ] 提交免费并发额度申请（<https://aka.ms/azpipelines-parallelism-request>）
- [ ] 等待邮件审批通过（2~3 工作日）
- [ ] 连接 GitHub 仓库，指向 `/azure-pipelines.yml`，保存
- [ ] 首次 Run pipeline 验证 Windows + macOS 产物能正常生成
