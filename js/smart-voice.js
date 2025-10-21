// 智能语音检测模块 - 基于build目录中的recordManual.js
class SmartVoiceDetector {
    constructor() {
        this.recorder = null;
        this.isInitialized = false; // 添加初始化状态标记
        this.isActive = false;
        this.voiceMinCount = 0; // 静音数量
        this.voiceMaxCount = 0; // 最大声音数量
        this.voiceLimitNum = 0; // 声音输入限制时长
        this.prevChunk = null;
        this.voiceCount = 12; // 约1秒的静音检测
        this.voicePercent = 10; // 音量阈值
        this.isProcessingVoice = false;
        this.ws = null; // WebSocket连接
        
        // UI元素
        this.voiceBtn = null;
        this.statusElement = null;
        this.onVoiceSent = null; // 语音发送回调
    }
    
    // 初始化智能语音检测
    init(options = {}) {
        this.voiceBtn = options.voiceBtn;
        this.statusElement = options.statusElement;
        this.onVoiceSent = options.onVoiceSent;
        this.ws = options.websocket;
        
        // 检查Recorder是否可用
        if (typeof Recorder === 'undefined') {
            console.error('Recorder库未加载，请确保已引入recorder文件');
            return false;
        }
        
        this.rec = Recorder({
            type: "wav",
            sampleRate: 16000,
            bitRate: 16,
            onProcess: (buffers, powerLevel, bufferDuration, bufferSampleRate, newBufferIdx, asyncEnd) => {
                this.handleAudioProcess(buffers, powerLevel, bufferDuration, bufferSampleRate, newBufferIdx, asyncEnd);
            }
        });
        
        this.rec.open(() => {
            console.log('智能语音检测已初始化');
            if (this.voiceBtn) {
                this.voiceBtn.disabled = false;
                this.voiceBtn.textContent = '🎤 开始智能录音';
            }
            return true;
        }, (msg, isUserNotAllow) => {
            console.error('无法打开麦克风:', msg);
            if (this.voiceBtn) {
                this.voiceBtn.disabled = true;
                this.voiceBtn.textContent = '🎤 麦克风错误';
            }
            if (isUserNotAllow) {
                this.updateStatus('麦克风访问被拒绝，请允许麦克风访问并刷新页面');
            } else {
                this.updateStatus('麦克风错误: ' + msg);
            }
            return false;
        });
        
        return true;
    }
    
    // 处理音频数据
    handleAudioProcess(buffers, powerLevel, bufferDuration, bufferSampleRate, newBufferIdx, asyncEnd) {
        if (!this.isActive || this.isProcessingVoice) {
            return;
        }
        
        // 将buffers转成pcm数据
        var chunk = Recorder.SampleData(buffers, bufferSampleRate, bufferSampleRate, this.prevChunk);
        
        // 语音活动检测逻辑（基于build/recordManual.js）
        if (powerLevel > this.voicePercent) {
            this.voiceMaxCount = this.voiceMaxCount + 1;
            this.voiceMinCount = 0;
            this.updateStatus('正在说话...');
        } else {
            this.voiceMinCount = this.voiceMinCount + 1;
            if (this.voiceMaxCount === 0) {
                this.updateStatus('监听中...');
            }
        }
        
        // 保留或丢弃音频数据
        if (powerLevel > this.voicePercent || this.voiceMaxCount > 0) {
            console.log("保留语音数据", powerLevel, 'voiceMaxCount:', this.voiceMaxCount, 'voiceMinCount:', this.voiceMinCount);
            this.prevChunk = chunk;
            this.voiceLimitNum = this.voiceLimitNum + 1;
        } else {
            this.prevChunk = null;
            // 清理旧的buffer数据
            setTimeout(() => {
                if (newBufferIdx > 5 && buffers && buffers.length > newBufferIdx - 5) {
                    buffers.splice(newBufferIdx - 5, 1);
                }
            });
        }
        
        // 检测用户停止说话或达到最大录音时长（基于build/recordManual.js逻辑）
        if ((this.voiceMinCount > this.voiceCount && this.voiceMaxCount > 0) || this.voiceLimitNum > 29 * 12) {
            console.log("检测到用户停止说话，准备发送音频", 'voiceMinCount:', this.voiceMinCount, 'voiceLimitNum:', this.voiceLimitNum);
            
            // 重置计数器
            this.voiceMinCount = 0;
            this.voiceMaxCount = 0;
            this.voiceLimitNum = 0;
            this.isProcessingVoice = true;
            
            this.updateStatus('处理中...');
            
            setTimeout(() => {
                // 处理音频数据
                var pcm = chunk.data;
                var sampleRate = chunk.sampleRate;
                
                // 创建mock录音器来转换音频格式（基于build/recordManual.js）
                var mockRec = Recorder({ 
                    type: "wav", 
                    bitRate: 16, 
                    sampleRate: bufferSampleRate 
                });
                
                mockRec.mock(pcm, sampleRate);
                mockRec.stop((blob, duration) => {
                    console.log("音频处理完成，准备发送", blob, duration);
                    
                    // 发送音频数据
                    this.sendVoiceData(blob, duration);
                    
                    // 重置处理状态
                    setTimeout(() => {
                        this.isProcessingVoice = false;
                        this.updateStatus('监听中...');
                    }, 100);
                    
                }, (msg) => {
                    console.error("音频处理错误:", msg);
                    this.isProcessingVoice = false;
                    this.updateStatus('处理错误');
                    setTimeout(() => {
                        this.updateStatus('监听中...');
                    }, 2000);
                });
            }, 50);
        }
    }
    
    // 发送语音数据
    sendVoiceData(blob, duration) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(blob);
            console.log('语音数据已发送', blob.size, 'bytes');
            
            // 调用回调函数
            if (this.onVoiceSent) {
                this.onVoiceSent({
                    size: blob.size,
                    duration: duration,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        } else {
            console.error('WebSocket未连接');
            this.updateStatus('发送失败：未连接到服务器');
        }
    }
    
    // 开始智能语音检测
    start() {
        if (!this.rec) {
            console.error('录音器未初始化');
            return false;
        }
        
        this.rec.start();
        this.isActive = true;
        
        if (this.voiceBtn) {
            this.voiceBtn.textContent = '🎤 停止智能录音';
            this.voiceBtn.classList.add('recording');
        }
        
        this.updateStatus('监听中...');
        
        // 重置计数器
        this.voiceMinCount = 0;
        this.voiceMaxCount = 0;
        this.voiceLimitNum = 0;
        this.prevChunk = null;
        this.isProcessingVoice = false;
        
        console.log('智能语音检测已开始');
        return true;
    }
    
    // 停止智能语音检测
    stop() {
        if (this.rec && this.isActive) {
            this.rec.stop();
            this.isActive = false;
            
            if (this.voiceBtn) {
                this.voiceBtn.textContent = '🎤 开始智能录音';
                this.voiceBtn.classList.remove('recording');
            }
            
            this.updateStatus('已停止');
            console.log('智能语音检测已停止');
        }
    }
    
    // 切换智能语音检测状态
    toggle() {
        if (this.isActive) {
            this.stop();
        } else {
            this.start();
        }
    }
    
    // 更新WebSocket连接
    updateWebSocket(ws) {
        this.ws = ws;
    }
    
    // 更新状态显示
    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
        console.log('智能语音状态:', message);
    }
    
    // 销毁实例
    destroy() {
        this.stop();
        if (this.rec) {
            this.rec.close();
            this.rec = null;
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartVoiceDetector;
} else {
    window.SmartVoiceDetector = SmartVoiceDetector;
}