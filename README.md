# 🐾 RaspiClaw v2.0

<!-- 试验243林晨 -->
**AI Agent 系统** — 基于 LangChain + LangGraph 的智能助手，具备工具调用、技能系统、记忆管理和 Web 控制面板。

---

## 功能特性

| 模块 | 能力 |
|------|------|
| 💬 **智能对话** | 多会话管理、流式输出、思考过程可视化、消息复制 |
| 🔧 **工具调用** | 终端操作、Python 代码执行、文件读写、丰富格式文件解析 |
| ⚡ **技能系统** | 可扩展的 SKILL.md 技能（数据分析、电机控制等） |
| 🧠 **记忆管理** | 身份/性格/用户档案/长期记忆，watchdog 自动提取 |
| 🌐 **联网搜索** | DuckDuckGo 搜索 + 网页内容抓取 |
| 🔧 **电机控制** | CAN 总线仿真 + Web 面板实时控制（8 个工具） |
| 🎨 **暗色主题 UI** | 现代 Web 界面，Provider 切换、文件上传、工作目录设置 |
| 📁 **丰富文件** | 支持 docx / pdf / xlsx / pptx 解析 |

---

## 快速开始

### 环境要求

- **Python 3.10+**
- **Windows 10/11**（macOS/Linux 亦可，脚本需手动适配）
- DeepSeek API Key（[免费注册获取](https://platform.deepseek.com/api_keys)）

### 一键安装（Windows）

```
双击 install.bat
```

脚本会自动完成：
1. 检测 Python 环境
2. 创建虚拟环境 `.venv`
3. 安装所有 Python 依赖
4. 生成 `.env` 配置文件模板

### 配置 API 密钥

安装完成后，编辑项目目录下的 **`.env`** 文件：

```ini
MAIN_MODEL=deepseek
DEEPSEEK_API_KEY=sk-你的密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 启动

```
双击 start.bat
```

或命令行：

```bash
.venv\Scripts\activate
python web_api.py
```

浏览器打开 **http://127.0.0.1:8000** 即可使用。

---

## 手动安装（macOS / Linux）

```bash
# 1. 创建虚拟环境
python -m venv .venv
source .venv/bin/activate   # Linux/macOS

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置密钥
cp .env.example .env
# 编辑 .env 填入 API Key

# 4. 启动
python web_api.py
```

---

## 项目结构

```
RaspiClaw/
├── web_api.py              # FastAPI 后端（REST + WebSocket）
├── Claw.py                 # 核心 Agent（LangGraph ReAct）
├── memory_manager.py       # 记忆管理器
├── skills_scanner.py       # 技能扫描器
├── background_loop.py      # 后台定时任务
├── providers.json          # 多 Provider 配置
├── requirements.txt        # Python 依赖
├── install.bat             # 一键安装脚本 (Windows)
├── start.bat               # 一键启动脚本 (Windows)
├── .env.example            # 配置文件模板
├── tools/                  # 工具模块
│   ├── terminal_tool.py    # 终端命令
│   ├── python_repl_tool.py # Python REPL
│   ├── read_file_tool.py   # 文件读取（沙盒保护）
│   ├── rich_file_tool.py   # 丰富格式解析
│   ├── web_search_tool.py  # 联网搜索
│   ├── write_memory_tool.py# 记忆写入
│   └── motor_control_tool.py# 电机控制
├── skills/                 # 技能定义
│   ├── summer_data_mining/ # 暑期数据分析
│   └── motor_control/      # 电机控制
├── memory/                 # Agent 记忆文件
│   ├── IDENTITY.md         # 身份设定
│   ├── SOUL.md             # 性格特征
│   ├── USER.md             # 用户档案
│   └── MEMORY.md           # 长期记忆
├── data/
│   └── summer.csv          # 示例数据集（500行×22列）
└── frontend/               # Web 前端
    ├── index.html
    └── assets/
        ├── app.js          # 前端逻辑
        └── style.css       # 样式
```

---

## 使用指南

### 基本对话

在输入框输入消息，按 **Enter** 发送（Shift+Enter 换行）。

### 思考过程显示

模型回复时，会显示 🧠 **Thinking** 块展示推理过程。点击可展开查看完整思考内容，不点击则自动折叠不干扰阅读。

### 多会话管理

点击左侧 **+** 按钮创建新对话。每个对话有独立的 Agent 实例、上下文记忆和历史消息。点击 × 关闭对话。

### 模型切换

顶部的 **Provider 下拉框** 可切换 AI 模型。  
在 **设置 → Provider Management** 中管理多个 API 提供商（新增/编辑/删除）。

### 文件操作

- 📎 **附加文件**：点击输入框左侧 📎 上传文件（docx/pdf/xlsx/pptx/txt/py 等）
- 📁 **工作目录**：点击 📁 设置 Agent 工作范围，所有操作限制在此目录内

### 技能使用

直接描述需求，Agent 自动调用匹配技能。例如：

- "帮我分析 summer.csv 数据"
- "初始化电机控制"
- "搜索最新的 AI 新闻"

### 记忆编辑

在 **记忆** 面板可编辑 Agent 的身份设定（IDENTITY）、性格特征（SOUL）、用户档案（USER）和长期记忆（MEMORY）。

### 电机控制

在 **电机控制** 面板使用滑块调节速度/角度，点击按钮初始化/启动/停止电机。

---

## 添加新 Provider

1. 进入 **设置 → Provider Management**
2. 点击 **+ Add Provider**
3. 填入：

| 字段 | 说明 |
|------|------|
| Name | 显示名称，如 "DeepSeek" |
| API Key | API 密钥 |
| Base URL | API 地址（不带 /v1 后缀） |
| Runtime Kind | deepseek / qwen / openai_compatible |
| Main Model ID | 主力模型 ID |

4. 保存后，在顶部下拉框切换到新 Provider。

---

## 添加新技能

1. 在 `skills/` 下创建新目录，如 `skills/my_skill/`
2. 创建 `SKILL.md` 描述技能用途和使用方法
3. 添加所需的 prompt 文件和参考数据
4. **重启服务**后生效（Agent 启动时扫描技能目录）

```
skills/my_skill/
├── SKILL.md               # 技能定义（必须）
└── prompts/
    └── task_guide.md       # 任务指引
```

---

## 配置多用户访问

将 `.env` 中的 `API_HOST` 改为 `0.0.0.0`：

```ini
API_HOST=0.0.0.0
API_PORT=8000
```

重启后，局域网内其他电脑可通过 `http://你的IP:8000` 访问。

---

## API 密钥获取

### DeepSeek（推荐）

1. 访问 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
2. 注册/登录 → API Keys → 创建新 Key
3. 复制 `sk-...` 填入 `.env`

### Qwen / 通义千问

1. 访问 [bailian.console.aliyun.com](https://bailian.console.aliyun.com/)
2. 登录阿里云 → 百炼控制台 → API-KEY 管理
3. 创建并复制 Key，将 `.env` 中的 `MAIN_MODEL` 改为 `qwen`

---

## 常见问题

| 问题 | 解决方案 |
|------|---------|
| 启动提示 "DEEPSEEK_API_KEY not found" | 检查 `.env` 文件是否存在，API Key 是否正确填入 |
| 对话没有响应 | 检查网络和 API Key 有效性，访问 platform.deepseek.com 验证 |
| 端口 8000 被占用 | 修改 `.env` 中 `API_PORT` 为其他端口（如 8080） |
| 依赖安装失败 | 尝试 `pip install -r requirements.txt --user` 或使用管理员权限 |
| WebSocket 连接失败 | 检查防火墙是否拦截，确认 API_HOST 设置正确 |

---

## 技术栈

| 层 | 技术 |
|---|---|
| Agent 框架 | LangGraph (ReAct Agent) |
| LLM | DeepSeek / Qwen（通义千问） |
| 后端 | FastAPI + WebSocket |
| 前端 | 原生 HTML/CSS/JS（暗色主题） |
| 数据分析 | Pandas + Scikit-learn + Matplotlib + Seaborn |
| 文件解析 | python-docx + PyPDF2 + openpyxl + python-pptx |
| 搜索 | duckduckgo-search |

---

## 许可证

MIT License — 自由使用、修改和分发。
