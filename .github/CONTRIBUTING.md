# 开发流程

本仓库的标准流程：**所有改动走 PR，不直推 `main`**。

`main` 已配置分支保护，直推会被 GitHub 直接拒绝（`Changes must be made through a pull request`）。这条规则对管理员同样生效。

---

## 一、一次改动的完整步骤

### 1. 从最新 `main` 切分支

```bash
git fetch origin
git checkout -b <type>/<description> origin/main
```

分支命名沿用现有惯例：

| 前缀 | 用途 | 例 |
|---|---|---|
| `feat/` | 新功能 | `feat/connector-panel` |
| `fix/` | 修 bug | `fix/login-redirect` |
| `chore/` | 工程配置、依赖、CI | `chore/ci-baseline` |
| `docs/` | 纯文档 | `docs/development-workflow` |

### 2. 改代码

见 `guidelines/Guidelines.md`（设计规范）和 `AGENTS.md`（关键文件）。

### 3. 本地跑完整质量闸门

```bash
pnpm check
```

这一条等价于依次执行：

```bash
pnpm test        # node:test，39 个用例
pnpm typecheck   # tsc --noEmit
pnpm build:check # 真实跑一次 vite build，产物写到临时目录
```

**三条全绿才能提 PR。** `pnpm check` 任一步失败都会中断，后面的步骤不会跑。

### 4. 提交并推分支

```bash
git add -A
git commit -m "<type>: <一句话说明>"
git push -u origin <branch>
```

提交信息用中文，遵循现有格式：`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` / `style:`。

### 5. 开 PR

- 标题：`chore: 修复质检三件套并接入 GitHub Actions CI`（沿用仓库现有中文标题风格）
- 描述用大白话写清楚三件事：**改了什么 / 为什么 / 风险在哪**
- 不要贴大段 diff，让看的人自己点开看

### 6. 等 CI 绿，再合并

- PR 上会自动跑 `CI`（名称：测试 + 类型检查 + 构建），全绿才允许合并
- 合并方式用 **squash**，保持 `main` 历史干净
- 合并后 Vercel 会自动重新部署到生产环境

---

## 二、本地环境准备

### 工具链版本

`.mise.toml` 钉死了版本：

```toml
[tools]
node = "22"
"npm:pnpm" = "10.34.3"
```

**pnpm 版本必须是 10.34.3，不能用最新的。** 仓库的 lockfile 依赖 pnpm 10 的 `overrides` 语义，用 pnpm 11/12 装会直接失败：

```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
```

如果本机没有 pnpm：

```bash
corepack pnpm@10.34.3 install --frozen-lockfile
```

### `pnpm` 必须在 PATH 上

`pnpm check` 内部会再调用 `pnpm`（`pnpm test && pnpm typecheck && ...`）。
如果只有 `corepack pnpm@10.34.3` 而 PATH 上没有可执行的 `pnpm`，子脚本会报：

```
sh: pnpm: command not found
```

解决办法二选一：

```bash
# 方案 A：让 package.json 的 packageManager 字段生效（推荐，仓库已配置）
corepack enable
```

```bash
# 方案 B：临时 shim
mkdir -p ~/bin && printf '#!/bin/sh\nexec corepack pnpm@10.34.3 "$@"\n' > ~/bin/pnpm && chmod +x ~/bin/pnpm
export PATH="$HOME/bin:$PATH"
```

### 环境变量

`.env` 不入库，需要自己建（模板见 `.env.example`）：

```bash
cp .env.example .env
```

最少需要 `ZHIPU_API_KEY`。`glm-4-flash` / `glm-4.7-flash` 是免费档，填付费模型会扣余额。

---

## 三、CI 做了什么

`.github/workflows/ci.yml`，PR 和推 `main` 都会跑：

1. `pnpm/action-setup@v4` —— 显式钉 pnpm `10.34.3`
2. `actions/setup-node@v4` —— Node 22，带 pnpm 缓存
3. `pnpm install --frozen-lockfile`
4. `pnpm check` —— test → typecheck → build 三合一

同一分支多次推送会自动取消旧运行。

浏览器回归是单独的可选命令，不进 `pnpm check`（CI 容器不保证有本机 Chrome）：

```bash
pnpm test:browser
```

它会在临时目录跑一次生产构建，并起一个本地 HTTP 服务同时提供静态站点和
`/api/chat` 的可控 SSE，全程离线、不访问真实模型。需要本机 Chrome，不在默认路径时
设置 `CHROME_PATH`。

注意：`/api/chat` 必须由这个本地服务用 `res.write` 分批下发，**不要**改成
`req.respond()` 塞 `ReadableStream` —— Puppeteer 只接受 string/Buffer，那样
「先发一段再挂住」的语义会失效，测出来的是假状态。测试要控制的流式场景，用
`mock.hold()` 挂住、`session.beginAnswer()` / `session.delta()` / `session.finish()`
显式推进；mock 与请求拦截记录到的异常会导致用例失败，只有明确预期的取消和页面关闭不算。

---

## 四、main 分支保护规则

| 规则 | 状态 |
|---|---|
| 禁止直推，必须走 PR | ✅ 生效（含管理员） |
| CI 必须通过才能合并 | ✅ 生效 |
| 禁止 force push | ✅ 生效 |
| 禁止删除分支 | ✅ 生效 |
| 要求 linear history（不许 merge commit） | ✅ 生效 |
| 需要人工 review | ❌ 未启用（单人项目；GitHub 不允许 approve 自己的 PR） |
| 合并前必须解决所有对话 | ✅ 生效 |

> 将来有第二个人参与开发时，把「需要人工 review」打开即可。改动走 GitHub API 的
> `PUT /repos/{owner}/{repo}/branches/main/protection`。

---

## 五、已知坑

### 1. `vite.figma.config.ts` 是 Figma Make 托管文件

Make 重新同步可能覆盖它。文件里有一段类型断言（`resolvedUserConfig`）用来修
`TS2349: Type 'never' has no call signatures`。**一旦被覆盖，类型检查会重新变红，
CI 会开始挡人。**

兜底方案：不改那个文件，改用 `tsconfig.json` 的 `exclude` 把它移出检查范围。

### 2. `src/imports/**/index.tsx` 已被排除出类型检查

这些是 Figma Make 生成的设计原稿，用了未声明的 `<loading>` 自定义元素。
app 代码只引用了同目录下的 svg / png 素材，不引用这些 `index.tsx`，所以排除掉
不影响产物，也不影响类型安全。

### 3. macOS 上构建失败

`pnpm-workspace.yaml` 的 `supportedArchitectures.os` 必须同时列 `linux` 和 `darwin`。
这个设置是**白名单不是补充**——只写 `linux` 会导致 macOS 装不到
`@rollup/rollup-darwin-arm64`，vite 构建直接报错。

### 4. `pnpm.overrides` 已迁移

`package.json` 里的 `pnpm` 字段在 pnpm 11+ 会被直接忽略。`overrides` 现在放在
`pnpm-workspace.yaml`。同时 `onlyBuiltDependencies` 白名单放行 `esbuild` 和
`@tailwindcss/oxide`——pnpm 10 默认拦截依赖的 postinstall，不放行则它们的原生
二进制落不下来，构建必挂。

---

## 六、回滚

改动都是纯配置或纯代码，`git revert <commit>` 即可。线上出问题时的快速路径：

```bash
git revert -m 1 <sha>   # 回滚某个 PR 的合并
```

或者直接在 GitHub 上把对应 PR `Revert`，会开一个反向 PR 走同样的 CI 流程。

---

## 七、给 AI 工具的约定

如果你在自动化工具里操作这个仓库：

- **不要直推 `main`** —— GitHub 会拒绝，而且这是有意的
- **先本地跑 `pnpm check`**，全绿再推分支
- **PR 描述写大白话**（改了什么 / 为什么 / 风险在哪），不要堆 diff
- **不要自己 approve 自己的 PR** —— GitHub 不允许
- **合并用 squash**
