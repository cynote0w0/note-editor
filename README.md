# Markdown Hub (Markdown 编辑器)

基于 Node.js 和 Marked.js 构建的现代化 Markdown 编辑器。支持左右分屏、实时预览，并提供了一键将内容直接同步至你的 GitHub 仓库的功能。

## 🌟 核心特性
- **实时预览**：基于 Marked.js 与 Highlight.js，支持 Markdown 语法与代码段高亮实时渲染。
- **暗黑沉浸式 UI**：采用现代化的 Glassmorphism（毛玻璃）设计和深色模式，提供极优雅的编辑体验。
- **自定义文件名**：前端界面内置文件名输入框，让你在保存时可自由决定最终生成的文件名（如 `diary.md` 或 `2026-03-24.md`）。
- **一键 GitHub 同步**：只需配置一次 Token，即可点击右上角的 "Save to GitHub"（或使用快捷键 `Ctrl + S`）随时将文件连同自定义文件名直接推送到你的目标 GitHub 仓库中。

---

## 🚀 快速开始

### 1. 环境准备
请确保你的电脑上已经安装了 [Node.js](https://nodejs.org/) 环境。

### 2. 获取代码并安装依赖
在终端中进入项目根目录，运行以下命令安装所需的依赖包：
```bash
npm install
```

### 3. 配置 GitHub 访问凭证
在项目根目录下找到 `.env` 文件。按以下格式替换为你自己的真实信息：

```env
# 你的 GitHub Personal Access Token (PAT)
# 注意：该 token 需要有目标仓库的读写权限 (Contents: Read and write)
GITHUB_TOKEN=your_github_personal_access_token_here

# 仓库所有者的 GitHub 用户名
REPO_OWNER=your_github_username

# 目标仓库的名称
REPO_NAME=your_repository_name

# 保存大类的目标目录路径（如果保存在仓库根目录，则直接留空；如果是保存在某个文件夹内，请填文件夹名称，如 docs。末尾无需加斜杠）
FILE_PATH=

# Web 应用运行的本地端口（默认 3000）
PORT=3000

# 管理员密码
ADMIN_PASSWORD=password

# 会话密钥
SESSION_SECRET=change_this_to_a_random_secret_string
```

> **获取 GitHub Token 指南**：登录 GitHub -> Settings -> Developer Settings -> Personal access tokens (建议使用 Fine-grained tokens) -> Generate new token。选择你的目标仓库，并确保为其开启 **Contents** 的 **Read and write** 权限。

### 4. 启动服务
配置好 `.env` 文件后，在终端中启动后端服务：
```bash
node server.js
```
启动成功后，控制台会输出 `Server is running at http://localhost:3000`。

### 5. 开始使用
在浏览器中打开网址：[`http://localhost:3000`](http://localhost:3000)。
- **左侧输入框**：编写你的 Markdown 文本内容。支持使用 `Tab` 键缩进。
- **右上角文件名**：填写你想保存的文件名（如 `notes.md`）。文件会保存在 `.env` 指定的 `FILE_PATH` 文件夹下。
- **右侧阅览区**：实时查看渲染和排版效果。
- **保存**：完成后，使用快捷键 `Ctrl + S` （MacOS 为 `Cmd + S`），或直接点击界面右上角按钮，即可自动提交 `Auto-save from Markdown Editor` 的 commit 并更新到 GitHub。

---

## 🛠️ 技术架构
- **前端页面**：纯 HTML / CSS / JavaScript 编写，集成了全局按键侦听。
  - `marked.js`：轻量级 Markdown 渲染引擎。
  - `highlight.js`：为代码块提供代码高亮支持。
- **后端服务**：Node.js 运行时 + Express.js 框架进行静态资源托管。
- **API 通信**：使用官方的 `@octokit/rest` SDK，与 GitHub REST API 进行交互以创建/更新记录。

## ⚠️ 安全与注意事项
- 由于应用是通过 API 方式直接提交更改，如果你的 GitHub 仓库指定路径下已有该文件，保存操作会提取当前的 `SHA` 校验值并覆盖已有文件。
- `.env` 配置文件中包含了重要的私钥数据（`GITHUB_TOKEN`），请**绝对不要**将其（以及整个项目包含凭证的状态）提交到任何公开的代码托管平台中！确保你的 `.gitignore` 包含了 `.env` 规则。
