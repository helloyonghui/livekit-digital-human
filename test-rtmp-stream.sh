#!/bin/bash

# LiveKit RTMP推流测试脚本
# 使用FFmpeg向LiveKit Ingress推送测试视频流

echo "=== LiveKit RTMP推流测试 ==="

# 检查FFmpeg是否安装
if ! command -v ffmpeg &> /dev/null; then
    echo "错误: FFmpeg未安装，请先安装FFmpeg"
    echo "macOS: brew install ffmpeg"
    echo "Ubuntu: sudo apt install ffmpeg"
    exit 1
fi

# 从API获取Ingress信息
echo "获取Ingress信息..."
INGRESS_INFO=$(curl -s -X GET "http://localhost:3000/api/livekit/ingress")

if [ -z "$INGRESS_INFO" ] || [ "$INGRESS_INFO" = "[]" ]; then
    echo "错误: 没有找到可用的Ingress，请先创建一个Ingress"
    echo "可以访问 http://localhost:3000/test-complete-flow.html 创建"
    exit 1
fi

# 解析RTMP URL和Stream Key
RTMP_URL=$(echo $INGRESS_INFO | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)
STREAM_KEY=$(echo $INGRESS_INFO | grep -o '"streamKey":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$RTMP_URL" ] || [ -z "$STREAM_KEY" ]; then
    echo "错误: 无法解析Ingress信息"
    echo "Ingress信息: $INGRESS_INFO"
    exit 1
fi

echo "RTMP URL: $RTMP_URL"
echo "Stream Key: $STREAM_KEY"

# 创建测试视频（彩色条纹 + 时间戳）
echo "开始RTMP推流..."
echo "按 Ctrl+C 停止推流"

ffmpeg -f lavfi -i "testsrc2=size=1280x720:rate=30" \
       -f lavfi -i "sine=frequency=1000:sample_rate=48000" \
       -vf "drawtext=fontfile=/System/Library/Fonts/Arial.ttf:text='LiveKit Test %{localtime}':fontcolor=white:fontsize=24:x=10:y=10" \
       -c:v libx264 -preset veryfast -tune zerolatency \
       -c:a aac -ar 48000 -b:a 128k \
       -g 60 -keyint_min 60 -sc_threshold 0 \
       -b:v 2000k -maxrate 2000k -bufsize 4000k \
       -f flv "${RTMP_URL}/${STREAM_KEY}"