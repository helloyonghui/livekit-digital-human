require('dotenv').config();
const express = require('express');
const { AccessToken, RoomServiceClient, IngressClient, IngressInput } = require('livekit-server-sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('.'));

// 环境变量配置
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://newnpc-lzszfd85.livekit.cloud';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'your-api-key';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'your-api-secret';

// 初始化LiveKit客户端
const roomClient = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const ingressClient = new IngressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// CORS支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// LiveKit连接端点
app.post('/api/livekit/join', async (req, res) => {
  try {
    const { roomName = 'digital-human-room', userName = 'user-' + Date.now(), participantName } = req.body;
    
    // 使用 participantName 或 userName 作为用户标识
    const userIdentity = participantName || userName;
    
    // 生成访问令牌
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userIdentity,
      name: userIdentity,
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
    });

    const jwt = await token.toJwt();

    // 返回前端期望的格式
    res.json({
      success: true,
      livekitUrl: LIVEKIT_URL,
      token: jwt,
      roomName: roomName,
      participantName: userIdentity,
      // 保持向后兼容
      url: LIVEKIT_URL,
      userName: userIdentity,
      width: 1280,
      height: 720
    });

    console.log(`用户 ${userIdentity} 加入房间 ${roomName}`);
  } catch (error) {
    console.error('生成令牌失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 创建 Ingress
app.post('/api/livekit/ingress', async (req, res) => {
  try {
    const { roomName, participantName } = req.body;
    
    if (!roomName || !participantName) {
      return res.status(400).json({ 
        success: false, 
        error: 'roomName and participantName are required' 
      });
    }

    // 重试逻辑处理速率限制 - 优化版本
    const maxRetries = 5; // 增加重试次数
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`创建 Ingress 尝试 ${attempt}/${maxRetries}...`);
        
        const ingress = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
          name: `ingress-${roomName}-${Date.now()}`,
          roomName: roomName,
          participantIdentity: participantName,
          participantName: participantName
        });

        console.log('Ingress 创建成功:', ingress);
        
        // 格式化响应以匹配前端期望
        res.json({
          success: true,
          ingress: {
            ingressId: ingress.ingressId,
            roomName: ingress.roomName,
            participantName: ingress.participantName,
            rtmpUrl: ingress.url,
            streamKey: ingress.streamKey,
            status: ingress.state?.status || 'created'
          }
        });
        return;
      } catch (error) {
        console.error(`Ingress 创建尝试 ${attempt} 失败:`, error.message);
        lastError = error;
        
        // 检查是否是速率限制错误
        if (error.message && (error.message.includes('Rate limit') || error.message.includes('rate limit') || error.message.includes('429'))) {
          if (attempt < maxRetries) {
            // 指数退避策略：第1次等待5秒，第2次等待10秒，第3次等待20秒，第4次等待40秒
            const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 60000); // 最大等待60秒
            console.log(`速率限制错误，等待 ${waitTime/1000} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        } else if (error.message && error.message.includes('Unauthorized')) {
          // 401 错误不需要重试
          return res.status(401).json({
            success: false,
            error: 'Unauthorized: Please check your LiveKit API credentials',
            details: error.message
          });
        } else {
          // 其他错误也不需要重试
          break;
        }
      }
    }

    throw lastError;
  } catch (error) {
    console.error('Error creating ingress:', error);
    
    let errorMessage = 'Failed to create ingress';
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      errorMessage = 'Rate limit exceeded after multiple retries. Please try again later.';
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage = 'Authentication failed. Please check API credentials.';
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage, 
      details: error.message 
    });
  }
});

// 获取房间信息
app.get('/api/livekit/room/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    const rooms = await roomClient.listRooms([roomName]);
    
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json(rooms[0]);
  } catch (error) {
    console.error('Error getting room info:', error);
    res.status(500).json({ error: 'Failed to get room info', details: error.message });
  }
});

// 列出所有 Ingress
app.get('/api/livekit/ingress', async (req, res) => {
  try {
    const { roomName } = req.query;
    const ingresses = await ingressClient.listIngress(roomName);
    res.json(ingresses);
  } catch (error) {
    console.error('Error listing ingresses:', error);
    res.status(500).json({ error: 'Failed to list ingresses', details: error.message });
  }
});

app.post('/lk/join', async (req, res) => {
  // 重定向到标准端点
  req.url = '/api/livekit/join';
  app.handle(req, res);
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 提供前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LiveKit服务器运行在端口 ${PORT}`);
  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
  console.log('访问 http://localhost:' + PORT + ' 查看应用');
});