#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
from datetime import datetime

class MockLiveKitHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # LiveKit join endpoint
        if path in ['/lk/join', '/api/livekit/join']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Mock LiveKit connection data - 使用本地视频文件
            response = {
                "url": "ws://localhost:8081/rtc",
                "token": "mock_token_" + str(int(datetime.now().timestamp())),
                "width": 1280,
                "height": 720,
                "video_url": "/static/demo-video.mp4"  # 添加视频文件路径
            }
            self.wfile.write(json.dumps(response).encode())
            return
            
        # RTC validate endpoint
        elif path == '/rtc/validate':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
            return
            
        elif self.path == '/lk/stop':
            # 模拟停止端点
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {"status": "stopped", "message": "Session stopped successfully"}
            self.wfile.write(json.dumps(response).encode('utf-8'))
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 停止会话请求")
            return
            
        elif self.path == '/rtc':
            # 模拟WebRTC端点
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {
                "status": "connected",
                "peer_connection": "mock-connection-id",
                "ice_servers": [
                    {"urls": "stun:stun.l.google.com:19302"}
                ]
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
            print(f"[{datetime.now().strftime('%H:%M:%S')}] WebRTC连接请求")
            return
            
        # Templates endpoint
        elif self.path == '/templates':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Mock template data with better preview images
            templates = [
                {
                    "name": "default",
                    "title": "默认角色",
                    "description": "标准AI助手角色",
                    "preview_image": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjNGY4MWJkIi8+PGNpcmNsZSBjeD0iMTAwIiBjeT0iNjAiIHI9IjMwIiBmaWxsPSIjZmZmIi8+PHRleHQgeD0iMTAwIiB5PSIxMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIg6buY6K6k6KeS6ImyPC90ZXh0Pjwvc3ZnPg=="
                },
                {
                    "name": "professional",
                    "title": "专业顾问",
                    "description": "商务专业形象",
                    "preview_image": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMmVjYzcxIi8+PGNpcmNsZSBjeD0iMTAwIiBjeT0iNjAiIHI9IjMwIiBmaWxsPSIjZmZmIi8+PHRleHQgeD0iMTAwIiB5PSIxMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIg5LiT5Lia6aG+6ZeuPC90ZXh0Pjwvc3ZnPg=="
                },
                {
                    "name": "friendly",
                    "title": "友好助手",
                    "description": "亲和力强的助手",
                    "preview_image": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTc0YzNjIi8+PGNpcmNsZSBjeD0iMTAwIiBjeT0iNjAiIHI9IjMwIiBmaWxsPSIjZmZmIi8+PHRleHQgeD0iMTAwIiB5PSIxMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIg5Y+L5aW95Yqp5omLPC90ZXh0Pjwvc3ZnPg=="
                }
            ]
            self.wfile.write(json.dumps({"templates": templates}).encode())
            return
            
        # Current template endpoint
        elif path == '/templates/current':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"current_template": "default"}).encode())
            return
            
        # Demo video endpoint
        elif self.path == '/demo-video.mp4':
            # 返回演示视频HTML页面（作为视频源）
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            with open('demo-video.html', 'r', encoding='utf-8') as f:
                self.wfile.write(f.read().encode('utf-8'))
            return
            
        # Serve static files
        else:
            super().do_GET()
    
    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # Handle /lk/stop endpoint
        if path == '/lk/stop':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {"status": "stopped", "message": "Session stopped successfully"}
            self.wfile.write(json.dumps(response).encode('utf-8'))
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 停止会话请求 (POST)")
            return
        
        # Template selection endpoint
        elif path == '/templates/select':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                template_name = data.get('template_name', 'default')
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response = {
                    "status": "success",
                    "message": f"模板已切换到: {template_name}",
                    "current_template": template_name
                }
                self.wfile.write(json.dumps(response).encode())
                print(f"[INFO] 用户选择模板: {template_name}")
                return
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
                return
        
        # Default POST handling
        self.send_response(404)
        self.end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == "__main__":
    PORT = 8081
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), MockLiveKitHandler) as httpd:
        print(f"Mock LiveKit server running at http://localhost:{PORT}")
        print("提供以下API端点:")
        print("  - /lk/join, /api/livekit/join (LiveKit连接)")
        print("  - /rtc/validate (RTC验证)")
        print("  - /rtc (模拟WebRTC端点)")
        print("  - /templates (模板列表)")
        print("  - /templates/current (当前模板)")
        print("  - /templates/select (模板选择)")
        print("  - 静态文件服务")
        httpd.serve_forever()