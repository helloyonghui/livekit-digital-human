# LiveKit数字人应用部署指南

## 快速部署到公网

你说得对！你的代码架构已经支持直接连接公网LiveKit服务器。只需要以下几步：

### 1. 获取LiveKit Cloud服务

访问 [LiveKit Cloud](https://cloud.livekit.io/) 注册账户：

1. 注册并创建项目
2. 获取项目的WebSocket URL（类似：`wss://your-project.livekit.cloud`）
3. 获取API Key和API Secret

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的LiveKit配置：

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-actual-api-key
LIVEKIT_API_SECRET=your-actual-api-secret
```

### 3. 安装依赖并启动

```bash
npm install
npm start
```

### 4. 部署到公网

#### 选项A：Vercel部署（推荐）

```bash
npm install -g vercel
vercel
```

在Vercel控制台添加环境变量：
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY` 
- `LIVEKIT_API_SECRET`

#### 选项B：Railway部署

1. 连接GitHub仓库到Railway
2. 添加环境变量
3. 自动部署

#### 选项C：传统VPS部署

```bash
# 上传代码到服务器
scp -r . user@your-server:/path/to/app

# 在服务器上
cd /path/to/app
npm install
npm start
```

## 上游数字人推流配置

如果你有上游数字人系统需要推流，LiveKit Cloud支持RTMP Ingress：

1. 在LiveKit Cloud控制台创建Ingress
2. 获取RTMP推流地址
3. 配置上游系统推流到该地址

## 代码说明

你的前端代码已经完美支持：

- ✅ 动态端点选择（`/api/livekit/join` 或 `/lk/join`）
- ✅ WebSocket连接（`ws://` 和 `wss://`）
- ✅ 视频流订阅和质量优化
- ✅ 音频发布（麦克风）
- ✅ 数据通道消息

只需要一个真实的LiveKit服务器URL和令牌，就能直接工作！

## 本地开发

继续使用mock服务器进行开发：

```bash
python3 mock-server.py
```

## 故障排除

1. **连接失败**：检查LIVEKIT_URL是否正确
2. **令牌错误**：检查API_KEY和API_SECRET
3. **CORS问题**：确保服务器配置了正确的CORS头