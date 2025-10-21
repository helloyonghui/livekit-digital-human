# Railway 部署指南

## 项目概述

这是一个完整的 LiveKit 数字人应用，包含：
- **前端**：HTML/CSS/JavaScript，使用 LiveKit Client SDK
- **后端**：Node.js + Express 服务器
- **功能**：视频流接入、房间管理、令牌生成

## 快速部署到 Railway

### 1. 准备 LiveKit Cloud 账户

1. 访问 [LiveKit Cloud](https://cloud.livekit.io/)
2. 注册并创建项目
3. 获取以下信息：
   - WebSocket URL（如：`wss://your-project.livekit.cloud`）
   - API Key
   - API Secret

### 2. 部署到 Railway

#### 方法一：通过 GitHub（推荐）

1. 将代码推送到 GitHub 仓库
2. 访问 [Railway](https://railway.app/)
3. 点击 "Deploy from GitHub repo"
4. 选择你的仓库
5. Railway 会自动检测到 Node.js 项目并开始部署

#### 方法二：通过 Railway CLI

```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 登录
railway login

# 初始化项目
railway init

# 部署
railway up
```

### 3. 配置环境变量

在 Railway 控制台中添加以下环境变量：

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-actual-api-key
LIVEKIT_API_SECRET=your-actual-api-secret
PORT=3000
```

### 4. 验证部署

部署完成后，Railway 会提供一个公网 URL，如：`https://your-app.railway.app`

访问以下端点验证：
- `https://your-app.railway.app/health` - 健康检查
- `https://your-app.railway.app/` - 主页
- `https://your-app.railway.app/test-complete-flow.html` - 完整功能测试

## 其他部署选项

### Vercel
```bash
npm install -g vercel
vercel
```

### Heroku
```bash
git add .
git commit -m "Deploy to Heroku"
heroku create your-app-name
git push heroku main
```

### Render
1. 连接 GitHub 仓库
2. 选择 "Web Service"
3. 设置构建命令：`npm install`
4. 设置启动命令：`npm start`

## 项目结构

```
├── server.js          # 主服务器文件
├── package.json       # 依赖配置
├── railway.json       # Railway 配置
├── Procfile          # 进程配置
├── .env.example      # 环境变量示例
├── lib/              # LiveKit 客户端库
├── test-complete-flow.html  # 测试页面
└── 其他静态文件...
```

## 环境变量说明

- `LIVEKIT_URL`: LiveKit 服务器 WebSocket 地址
- `LIVEKIT_API_KEY`: LiveKit API 密钥
- `LIVEKIT_API_SECRET`: LiveKit API 密钥
- `PORT`: 服务器端口（Railway 会自动设置）

## 故障排除

1. **部署失败**：检查 `package.json` 中的 Node.js 版本要求
2. **连接失败**：确认环境变量设置正确
3. **CORS 错误**：服务器已配置 CORS，应该不会有问题

## 成本估算

- **Railway**: 免费额度足够小型项目使用
- **LiveKit Cloud**: 按使用量计费，有免费额度
- **总成本**: 小规模使用基本免费