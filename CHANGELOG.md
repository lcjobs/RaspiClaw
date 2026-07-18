# RaspiClaw 更新日志

<!-- 试验243林晨 -->
---

## v2.1.0 (2026-06-16)

**重大更新:**
- 项目重命名: DataClaw → RaspiClaw
- 三档权限梯度系统: 完全权限 / 询问权限 / 安全模式
- UI 全面中文化
- Light/Dark 主题切换
- 删除电机控制模块

**新增:**
- 权限模式选择器（对话页顶部下拉框）
- 亮色/暗色主题一键切换按钮（侧边栏底部 🌓）
- 权限 API: `POST /api/permission/{id}`, `GET /api/permission/{id}`
- `RaspiClawAgent.set_permission_mode()` 及工具过滤逻辑

**修复:**
- `.env.example` 和 `.env` 删除 Qwen 配置，默认模型改为 `deepseek-v4-pro`
- `providers.json.example` 模型名修正为 `deepseek-v4-pro` / `deepseek-v4-flash`
- 欢迎页英文全部改为中文

**删除:**
- `tools/motor_control_tool.py` — 电机控制工具
- `skills/motor_control/` — 电机控制技能
- 前端电机控制面板（HTML/JS/CSS）
- `/api/motor/status` 端点

**类重命名:**
- `CoreClawAgent` → `RaspiClawAgent`
- `Claw.py` 保持文件名不变（兼容导入）

---

## v2.0.4 (2026-06-16)

- 安装包完整发布版本，含 README.md + CHANGELOG.md + .env.example + providers.json.example
- 所有 Provider 配置模板更新为 Opus/Sonnet/Haiku 三档格式

---

## v2.0.3 (2026-06-16)

**修复:**
- Settings 面板按钮全部失效 — `app.js` 中 `models.main` 废弃字段导致渲染失败
- 编辑 Provider 保存后模型徽章不更新 — 新增自动重载逻辑
- DeepSeek 模型名错误 (`deepseek-v4` → `deepseek-v4-pro` / `deepseek-v4-flash`)

**新增:**
- Chat 页 Tier 下拉框，实时切换 Opus/Sonnet/Haiku
- 编辑已激活 Provider 后自动调用 switch API 刷新 Agent

---

## v2.0.2 (2026-06-16)

**新增:**
- `openai_compatible` 运行时支持 — `Claw.py` 新增 `ChatOpenAI` 分支，支持 Zhipu GLM 等
- Opus / Sonnet / Haiku 三档模型配置系统
- Provider 编辑表单重构，4 字段替代旧的 Main/Haiku

**修复:**
- Zhipu GLM baseUrl 路径错误 (`/api/anthropic` → `/api/paas/v4`)
- Provider 切换时 `runtimeKind` 不被识别的问题
- `requirements.txt` 补齐 `langchain-openai` 和 `python-multipart`

**依赖变更:**
- 新增: `langchain-openai>=0.3.0`
- 新增: `python-multipart>=0.0.9`

---

## v2.0.1 (2026-06-16)

**修复:**
- 🚨 `start.bat` 中 `taskkill /F` 无进程名校验 — 加入三重安全保护
- `start.bat` 双击闪退 — 修复 `%~dp0` 工作目录 + 去掉 BOM
- `start.bat` 端口硬编码 8080 → 改为从 `.env` 动态读取
- `package.bat` PowerShell 转义失败 → 改用 Python `package.py`

**新增:**
- 关闭浏览器自动杀进程（WebSocket 断连 + 5 秒倒计时）
- `start.bat` 启动后自动打开浏览器
- 启动速度优化：12s → 8s 固定等待

---

## v2.0.0 (2026-06-16)

**新增:**
- 多会话管理（独立 Agent 实例 + 上下文）
- 流式输出停止按钮
- 文件附件上传（📎）
- 工作目录设置（📁）
- 消息复制按钮（📋）
- docx / pdf / xlsx / pptx 丰富文件解析
- 联网搜索（DuckDuckGo + URL 抓取）
- Provider 管理前后端（CRUD + 切换）
- 思考过程可视化（🧠 Thinking 块）
- 安装/启动/打包脚本（install.bat / start.bat / package.bat）
