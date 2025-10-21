#!/usr/bin/env python3
"""
模拟RTMP推流脚本
用于测试LiveKit Ingress接收上游数字人推流
"""

import subprocess
import sys
import time
import requests
import json
import os

def create_ingress(server_url="http://localhost:3000", room_name="test-room", participant_name="digital-human"):
    """创建LiveKit Ingress"""
    try:
        print(f"🔄 正在创建Ingress...")
        response = requests.post(f"{server_url}/api/livekit/ingress", 
                               json={
                                   "roomName": room_name,
                                   "participantName": participant_name
                               })
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                ingress = data['ingress']
                print(f"✅ Ingress创建成功!")
                print(f"   房间名称: {ingress['roomName']}")
                print(f"   参与者: {ingress['participantName']}")
                print(f"   RTMP URL: {ingress['rtmpUrl']}")
                return ingress['rtmpUrl']
            else:
                print(f"❌ 创建失败: {data.get('error')}")
                return None
        else:
            print(f"❌ HTTP错误: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return None

def check_ffmpeg():
    """检查FFmpeg是否可用"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("✅ FFmpeg 可用")
            return True
        else:
            print("❌ FFmpeg 不可用")
            return False
    except FileNotFoundError:
        print("❌ 未找到FFmpeg，请先安装FFmpeg")
        print("   macOS: brew install ffmpeg")
        print("   Ubuntu: sudo apt install ffmpeg")
        return False
    except subprocess.TimeoutExpired:
        print("❌ FFmpeg 检查超时")
        return False

def create_test_video():
    """创建测试视频"""
    test_video = "test_video.mp4"
    
    if os.path.exists(test_video):
        print(f"✅ 测试视频已存在: {test_video}")
        return test_video
    
    print("🔄 正在创建测试视频...")
    
    # 创建一个简单的测试视频：彩色条纹 + 时间戳
    cmd = [
        'ffmpeg',
        '-f', 'lavfi',
        '-i', 'testsrc2=size=1280x720:rate=30',
        '-f', 'lavfi', 
        '-i', 'sine=frequency=1000:sample_rate=48000',
        '-t', '60',  # 60秒
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-y',
        test_video
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print(f"✅ 测试视频创建成功: {test_video}")
            return test_video
        else:
            print(f"❌ 视频创建失败: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        print("❌ 视频创建超时")
        return None
    except Exception as e:
        print(f"❌ 视频创建异常: {e}")
        return None

def start_rtmp_stream(rtmp_url, video_file):
    """开始RTMP推流"""
    print(f"🚀 开始推流到: {rtmp_url}")
    print(f"📹 视频文件: {video_file}")
    
    cmd = [
        'ffmpeg',
        '-re',  # 实时推流
        '-stream_loop', '-1',  # 循环播放
        '-i', video_file,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-ar', '48000',
        '-f', 'flv',
        rtmp_url
    ]
    
    print("📝 FFmpeg命令:")
    print(" ".join(cmd))
    print("\n🔄 推流开始... (按Ctrl+C停止)")
    
    try:
        # 启动推流进程
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # 监控推流状态
        while True:
            # 检查进程是否还在运行
            if process.poll() is not None:
                stdout, stderr = process.communicate()
                print(f"❌ 推流进程已退出，退出码: {process.returncode}")
                if stderr:
                    print(f"错误信息: {stderr}")
                break
            
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n⏹️  用户中断推流")
        process.terminate()
        process.wait()
    except Exception as e:
        print(f"❌ 推流异常: {e}")
        if 'process' in locals():
            process.terminate()

def main():
    print("🎬 LiveKit RTMP推流测试工具")
    print("=" * 50)
    
    # 1. 检查FFmpeg
    if not check_ffmpeg():
        sys.exit(1)
    
    # 2. 创建Ingress
    rtmp_url = create_ingress()
    if not rtmp_url:
        print("❌ 无法创建Ingress，退出")
        sys.exit(1)
    
    # 3. 创建测试视频
    video_file = create_test_video()
    if not video_file:
        print("❌ 无法创建测试视频，退出")
        sys.exit(1)
    
    print("\n" + "=" * 50)
    print("🎯 测试准备完成!")
    print(f"📺 RTMP推流地址: {rtmp_url}")
    print(f"📹 测试视频: {video_file}")
    print("🌐 请在浏览器中打开: http://localhost:3000")
    print("🏠 加入房间 'test-room' 观看推流")
    print("=" * 50)
    
    # 自动开始推流（3秒后）
    print("\n🚀 3秒后自动开始推流...")
    time.sleep(3)
    
    # 4. 开始推流
    start_rtmp_stream(rtmp_url, video_file)

if __name__ == "__main__":
    main()