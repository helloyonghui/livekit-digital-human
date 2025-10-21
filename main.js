// 通话式前端（LiveKit-only 版）：仅用 LiveKit 连接与数据通道
(function () {
    // ---- DOM 与常量 ----
    const canvas = document.getElementById('videoCanvas');
    const video = document.getElementById('videoEl');
    const audioEl = document.getElementById('audioEl');
    const callBtn = document.getElementById('callBtn');
    const exitBtn = document.getElementById('exitBtn');
    const ansL1 = document.getElementById('ansL1');
    const ansL2 = document.getElementById('ansL2');
    const ansL3 = document.getElementById('ansL3');
    const sttText = document.getElementById('sttText');
    const listenHud = document.getElementById('listenHud');
    const listenStatus = document.getElementById('listenStatus');
    const interruptBtn = document.getElementById('interruptBtn');
    const micBtn = document.getElementById('micBtn');
    const textInput = document.getElementById('textInput');
    const sendBtn = document.getElementById('sendBtn');
    const textInputBar = document.getElementById('textInputBar');
    const audioOverlay = document.getElementById('audioOverlay');

    // LiveKit UMD 兼容：将全局 LivekitClient 映射为 LiveKit
    if (!window.LiveKit && window.LivekitClient) {
        window.LiveKit = window.LivekitClient;
    }

    const PHONE_SVG = '<svg class="icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14 8c1-1 2-1 3 0l5 5c1 1 1 2 0 3l-3 3c2 4 5 7 9 9l3-3c1-1 2-1 3 0l5 5c1 1 1 2 0 3l-2 2c-1 1-3 2-5 2C22 37 11 26 11 18c0-2 1-4 2-5l1-1z"/></svg>';

    // ---- 会话状态与资源 ----
    const SessionState = {
        IDLE: 'idle',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        ERROR: 'error'
    };
    let state = SessionState.IDLE;

    let room = null;
    let webgl = null;
    let fallbackVideoMode = false;
    let isVideoReady = false;

    // 麦克风状态变量（新增）
    let micEnabled = false;
    let micTrack = null;
    if (micBtn) micBtn.addEventListener('click', toggleMic);

    // ---- 回答与识别文本 ----
    const answerQueue = [];
    const pendingAnswers = [];
    function setStt(t){ try { if (sttText) sttText.textContent = String(t||''); } catch(e){} }
    function pushAnswerLine(text) {
        if (!text) return;
        answerQueue.push(text);
        while (answerQueue.length > 3) answerQueue.shift();
        const a = answerQueue;
        ansL1.textContent = a[0] || '';
        ansL2.textContent = a[1] || '';
        ansL3.textContent = a[2] || '';
        try {
            ansL1.classList.remove('line-new'); ansL2.classList.remove('line-new'); ansL3.classList.remove('line-new');
            ansL1.classList.remove('line-2', 'line-3'); ansL2.classList.remove('line-1', 'line-3'); ansL3.classList.remove('line-1', 'line-2');
            ansL1.classList.add('line-1');
            ansL2.classList.add('line-2');
            ansL3.classList.add('line-3', 'line-new');
            setTimeout(() => { ansL3 && ansL3.classList.remove('line-new'); }, 450);
        } catch(e){}
    }
    // 新增：统一设置 STT/用户文字显示（合并展示）
    function setStt(t){ try { if (sttText) sttText.textContent = String(t||''); } catch(e){} }
    function flushPendingAnswers() { if (!pendingAnswers.length) return; pendingAnswers.forEach(t => pushAnswerLine(t)); pendingAnswers.length = 0; }
    function pushAnswerLineDeferred(text) { if (!text) return; if (!isVideoReady) pendingAnswers.push(text); else pushAnswerLine(text); }
    function clearAnswers() {
        try {
            answerQueue.length = 0;
            pendingAnswers.length = 0;
            if (ansL1) { ansL1.textContent = ''; ansL1.classList.remove('line-1','line-2','line-3','line-new'); }
            if (ansL2) { ansL2.textContent = ''; ansL2.classList.remove('line-1','line-2','line-3','line-new'); }
            if (ansL3) { ansL3.textContent = ''; ansL3.classList.remove('line-1','line-2','line-3','line-new'); }
        } catch(e){}
    }

    // ---- 聆听 HUD ----
    function setListenActive(active) { 
        if (active) listenHud && listenHud.classList.add('active'); 
        else listenHud && listenHud.classList.remove('active');
        updateOverlayPositions(); }
    function updateListenStatus(text) { if (listenStatus) listenStatus.textContent = text || ''; updateOverlayPositions(); }

    // ---- 居中提示组件 ----
    function ensureCenterPromptEl() {
        const stage = document.querySelector('.stage');
        if (!stage) return null;
        let el = document.getElementById('centerPrompt');
        if (!el) {
            el = document.createElement('div');
            el.id = 'centerPrompt';
            el.className = 'center-prompt';
            const pill = document.createElement('div'); pill.className = 'pill';
            const spinner = document.createElement('div'); spinner.className = 'spinner';
            const textSpan = document.createElement('span'); textSpan.className = 'text';
            pill.appendChild(spinner); pill.appendChild(textSpan); el.appendChild(pill); stage.appendChild(el);
        }
        return el;
    }
    function setCenterPromptVariant(el, variant, showSpinner) {
        const pill = el.querySelector('.pill'); const textSpan = el.querySelector('.text'); const spinner = el.querySelector('.spinner');
        if (!pill || !textSpan || !spinner) return;
        el.classList.remove('variant-info','variant-warn','variant-danger','show-spinner');
        const v = (variant === 'danger' || variant === 'warn') ? variant : 'info';
        el.classList.add('variant-' + v);
        if (showSpinner) el.classList.add('show-spinner');
    }
    function showCenterPrompt(text, opts = {}) {
        const el = ensureCenterPromptEl(); if (!el) return;
        const textSpan = el.querySelector('.text');
        if (textSpan) {
            textSpan.textContent = text || '';
            const len = (text || '').length; let fs = 18;
            if (len > 60) fs = 14; else if (len > 36) fs = 15; else if (len > 18) fs = 16;
            textSpan.style.fontSize = fs + 'px';
        }
        const t = (text || '').toLowerCase();
        const isErrorWord = t.includes('错误') || t.includes('失败');
        const isLoadingWord = t.includes('加载') || t.includes('连接');
        const variant = opts.variant || (isErrorWord ? 'danger' : 'info');
        const showSpinner = !!(opts.showSpinner || isLoadingWord);
        setCenterPromptVariant(el, variant, showSpinner);
        updateOverlayPositions();
        el.style.opacity = '1';
    }
    function hideCenterPrompt() { const el = document.getElementById('centerPrompt'); if (el) el.style.opacity = '0'; }

    function hideOverlayButtons() { const i = document.getElementById('interruptBtn'); const e = document.getElementById('exitBtn'); if (i) i.classList.remove('btn-visible'); if (e) e.classList.remove('btn-visible'); }
    function showOverlayButtons() { const i = document.getElementById('interruptBtn'); const e = document.getElementById('exitBtn'); if (i) i.classList.add('btn-visible'); if (e) e.classList.add('btn-visible'); }

    // ---- 视频矩形与叠层定位 ----
    function getFittedVideoRect() {
        const stage = document.querySelector('.stage'); if (!stage) return { left:0, top:0, width:0, height:0 };
        const sw = stage.clientWidth; const sh = stage.clientHeight;
        const vw = video.videoWidth || 1280; const vh = video.videoHeight || 720;
        const videoRatio = vw / vh; const stageRatio = sw / sh;
        let width, height; if (stageRatio > videoRatio) { height = sh; width = Math.round(height * videoRatio); } else { width = sw; height = Math.round(width / videoRatio); }
        const left = Math.round((sw - width) / 2); const top = Math.round((sh - height) / 2);
        return { left, top, width, height };
    }
    function updateOverlayPositions() {
        const stage = document.querySelector('.stage'); 
        const interruptBtnEl = document.getElementById('interruptBtn'); 
        const exitBtnEl = document.getElementById('exitBtn'); 
        if (!stage || !interruptBtnEl || !exitBtnEl) return;
        const rect = getFittedVideoRect();
        const stageRect = stage.getBoundingClientRect();
        const interruptW = interruptBtnEl.offsetWidth || 100;
        interruptBtnEl.style.position = 'absolute'; 
        interruptBtnEl.style.top = rect.top + 12 + 'px'; 
        interruptBtnEl.style.left = (rect.left + rect.width - interruptW - 12) + 'px'; 
        interruptBtnEl.style.right = 'auto';
        exitBtnEl.style.position = 'absolute'; 
        exitBtnEl.style.top = rect.top + 12 + 'px';
        exitBtnEl.style.left = (rect.left + 12) + 'px';

        // 新增：居中提示定位到画布中心
        const centerPromptEl = document.getElementById('centerPrompt');
        if (centerPromptEl) {
            const cx = Math.floor(rect.left + rect.width / 2);
            const cy = Math.floor(rect.top + rect.height / 2);
            centerPromptEl.style.position = 'absolute';
            centerPromptEl.style.left = cx + 'px';
            centerPromptEl.style.top = cy + 'px';
            centerPromptEl.style.transform = 'translate(-50%, -50%)';
            centerPromptEl.style.maxWidth = Math.floor(rect.width * 0.8) + 'px';
        }

        const answerLinesEl = document.getElementById('answerLines');
        const sttTextEl = document.getElementById('sttText');
        const maxTextWidth = Math.floor(rect.width * 0.8);
        const textLeft = Math.floor(rect.left + (rect.width - maxTextWidth) / 2);
        if (answerLinesEl) {
            const answerTop = Math.floor(rect.top + rect.height * 0.62);
            answerLinesEl.style.position = 'absolute';
            answerLinesEl.style.left = textLeft + 'px';
            answerLinesEl.style.top = answerTop + 'px';
            answerLinesEl.style.width = maxTextWidth + 'px';
            // 关键：取消 CSS 残留的水平位移，避免偏移
            answerLinesEl.style.transform = 'none';
        }
        
        if (sttTextEl) {
            const listenStatusEl = document.getElementById('listenStatus');
            let sttTop = rect.top + rect.height - 40;
            try {
                if (listenStatusEl && listenHud && listenHud.classList.contains('active')) {
                    const listenRect = listenStatusEl.getBoundingClientRect();
                    const sttHeight = sttTextEl.offsetHeight || 28;
                    sttTop = Math.max(rect.top, Math.floor(listenRect.top - stageRect.top - sttHeight - 10));
                }
            } catch (e) {}
            sttTextEl.style.position = 'absolute';
            sttTextEl.style.left = textLeft + 'px';
            sttTextEl.style.top = sttTop + 'px';
            sttTextEl.style.width = maxTextWidth + 'px';
        }
        
        if (textInputBar) {
            const inputHeight = textInputBar.offsetHeight || 44;
            const inputTop = Math.floor(rect.top + rect.height - inputHeight - 12);
            textInputBar.style.position = 'absolute';
            textInputBar.style.left = textLeft + 'px';
            textInputBar.style.top = inputTop + 'px';
            textInputBar.style.width = maxTextWidth + 'px';
        
            // 新增：麦克风按钮仅在画面就绪时显示，并靠近文字框
            const micBtnEl = document.getElementById('micBtn');
            if (micBtnEl) {
                micBtnEl.style.position = 'absolute';
                micBtnEl.style.left = textLeft + 'px';
                micBtnEl.style.width = Math.floor(maxTextWidth * 0.25) + 'px';
                const micH = 36;
                const micTop = Math.max(rect.top, inputTop - micH - 8);
                micBtnEl.style.top = micTop + 'px';
                // 最后再根据 isVideoReady 切换显示
                const inputVisible = textInputBar && textInputBar.style.display !== 'none';
                micBtnEl.style.display = (isVideoReady && inputVisible) ? 'block' : 'none';
            }
        }
    }

    // ---- WebGL 渲染与回退 ----
    function startRenderer() {
        if (fallbackVideoMode) return;
        if (webgl) return;
        try {
            webgl = new WebGLVideoRendererBasic(canvas);
            const start = () => webgl.start(video);
            if (video.readyState >= 1) start(); else video.addEventListener('loadedmetadata', start, { once:true });
        } catch (err) {
            console.error('启动渲染失败，启用 HTMLVideo 回退', err);
            fallbackToHtmlVideo();
            try { video.muted = false; video.volume = 1.0; video.play().catch(()=>{}); } catch(e){}
        }
    }
    function stopRenderer() { try { if (webgl) webgl.stop(); } catch(e){} webgl = null; }
    function fallbackToHtmlVideo() {
        fallbackVideoMode = true;
        try {
            canvas.style.display = 'none';
            video.style.display = 'block';
            video.style.position = 'absolute';
            video.style.inset = '0';
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'contain';
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', 'true');
            video.setAttribute('x5-playsinline', 'true');
        } catch(e){}
    }

    // ---- 音频解锁 ----
    async function ensureVideoPlayingWithSound() {
        try {
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', 'true');
            video.setAttribute('x5-playsinline', 'true');
            video.style.display = 'block';
            video.muted = false; video.volume = 1.0; await video.play();
            if (audioEl) { audioEl.muted = false; audioEl.volume = 1.0; await audioEl.play(); }
            startRenderer();
        } catch (e) {
            console.warn('自动播放失败，需要用户交互解锁', e);
        }
    }

    // 麦克风权限请求（安全上下文检测+预取权限）
    async function ensureMicPermission() {
        try {
            console.log('检查麦克风权限...');
            console.log('isSecureContext:', window.isSecureContext);
            console.log('hostname:', location.hostname);
            console.log('protocol:', location.protocol);
            
            const secure = window.isSecureContext || location.hostname === 'localhost';
            if (!secure || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                const msg = `麦克风不可用：请在 HTTPS 或 localhost 访问页面 (secure: ${secure}, mediaDevices: ${!!navigator.mediaDevices})`;
                console.warn(msg);
                showCenterPrompt(msg, { variant: 'warn' });
                return false;
            }
            
            console.log('请求麦克风权限...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            console.log('麦克风权限获取成功');
            
            // 立即释放权限占用，仅保留授权结果
            try { stream.getTracks().forEach(t => t.stop()); } catch(e){}
            return true;
        } catch (e) {
            console.warn('麦克风权限请求失败', e);
            showCenterPrompt(`请允许浏览器访问麦克风: ${e.message}`, { variant: 'warn' });
            return false;
        }
    }

    // 麦克风开关切换与状态反馈
    async function toggleMic() {
        try {
            if (!room || state !== SessionState.CONNECTED) { showCenterPrompt('尚未连接房间', { variant:'warn' }); return; }
            if (!micEnabled) {
                const ok = await ensureMicPermission(); if (!ok) return;
                micTrack = await LiveKit.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
                await room.localParticipant.publishTrack(micTrack);
                micEnabled = true; if (micBtn) { micBtn.classList.add('on'); micBtn.textContent = '麦克风开'; }
                updateListenStatus('聆听中（麦克风开）');
            } else {
                try { await room.localParticipant.unpublishTrack(micTrack); } catch(e){}
                try { micTrack && micTrack.stop(); } catch(e){}
                micTrack = null; micEnabled = false;
                if (micBtn) { micBtn.classList.remove('on'); micBtn.textContent = '麦克风关'; }
                updateListenStatus('聆听中（麦克风关）');
            }
        } catch (e) { console.warn('切换麦克风失败', e); }
    }

    // ---- LiveKit-only：连接与发布 ----
    async function startCallLiveKitOnly(){
        try {
            showCenterPrompt('正在连接...', { showSpinner:true });
            let joinURL = (typeof window.JOIN_ENDPOINT === 'string' && window.JOIN_ENDPOINT) ? window.JOIN_ENDPOINT : null;
            if (!joinURL) {
                const path = location.pathname || '';
                if (path.includes('/cloud') || path.includes('/static_cloud')) {
                    joinURL = '/api/livekit/join';
                } else {
                    joinURL = '/lk/join';
                }
            }
            
            let resp;
            try {
                resp = await fetch(joinURL, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`join failed: ${resp.status}`);
            } catch (e) {
                // 自动回退：如果首选失败，尝试另一路径
                const alt = joinURL === '/lk/join' ? '/api/livekit/join' : '/lk/join';
                try {
                    resp = await fetch(alt, { cache: 'no-store' });
                } catch(_) {}
            }
            
            const data = (resp && resp.ok) ? await resp.json() : null;
            if (!data || !data.url || !data.token) throw new Error('加入失败：无效令牌');
    
            // 统一移除 /rtc（后端也会处理，此处双保险）
            let connectUrl = String(data.url).replace('/rtc', '').replace(/\/$/, '');
            console.log('[LK] join payload:', { url: data.url, tokenLen: String(data.token||'').length });
    
            // 预检 /rtc/validate：修复URL转换逻辑
            try {
                // 修复URL转换逻辑：ws->http, wss->https
                let origin;
                if (connectUrl.startsWith('wss://')) {
                    origin = connectUrl.replace(/^wss:\/\//, 'https://');
                } else if (connectUrl.startsWith('ws://')) {
                    origin = connectUrl.replace(/^ws:\/\//, 'http://');
                } else {
                    origin = connectUrl; // 如果已经是http/https，直接使用
                }
                const v = await fetch(`${origin}/rtc/validate`, { method: 'GET', cache: 'no-store' });
                console.log('[LK] /rtc/validate status:', v.status);
            } catch (e) {
                console.warn('[LK] /rtc/validate 预检失败（可能被重置）', e);
                showCenterPrompt('信令预检失败（可能是反代或上游问题）', { variant:'warn', showSpinner:false });
            }
            
            // try {
            //     video.style.display = 'block';
            //     video.style.width = '100%';
            //     video.style.height = '100%';
            // } catch(e) {}


            const roomOptions = { adaptiveStream: false, dynacast: false,
                            publishDefaults: {
                        // 仅发布 720p 层，避免订阅到低层
                                    videoSimulcastLayers: [LiveKit.VideoPresets.h720],
                                },
                                subscribeDefaults: {
                                    // 默认订阅最高质量
                                    videoQuality: LiveKit.VideoQuality.HIGH,
                                },
                     };
            room = new LiveKit.Room(roomOptions);
            room.on(LiveKit.RoomEvent.TrackSubscribed, (track,publication) => {
                try {
                    
                    if (track.kind === LiveKit.Track.Kind.Video) {
                        track.attach(video);

                        // 分辨率门控：最短边未达 720p 先透明（保持解码）
                        let gateShown = false;
                        
                        const applyGate = () => {
                            const vw = video.videoWidth || 0;
                            const vh = video.videoHeight || 0;
                            const actualProduct = vw * vh;
                            if (expectedProduct > 0 && actualProduct === expectedProduct) {
                                if (!gateShown) {
                                    gateShown = true;
                                    video.style.opacity = '1';
                                    video.style.pointerEvents = 'auto';
                                    console.log(`[Gate] show ${vw}x${vh}, product=${actualProduct}`);
                                }
                            } else {
                                video.style.opacity = '0';
                                // 保持 pointer-events 避免影响点击区域（可选）
                                video.style.pointerEvents = 'none';
                                // 布局不跳动
                                console.log(`[Gate] keep hidden: actual=${actualProduct}, expected=${expectedProduct}`);
                            }
                        };
                        // 初始透明（持续解码）
                        video.style.opacity = '0';
                        video.style.pointerEvents = 'none';
                    
                        // 视频预热和质量优化策略（保留你现有的短延迟）
                        if (publication && publication.setVideoQuality) {
                            setTimeout(() => {
                                publication.setVideoQuality(LiveKit.VideoQuality.HIGH);
                            }, 200);
                            if (publication.setSubscribed) {
                                publication.setSubscribed(true);
                            }
                        }
                        
                        // 优化视频播放配置
                        video.style.display = 'block';
                        video.muted = false;
                        video.preload = 'auto';
                        video.setAttribute('playsinline', '');
                        video.setAttribute('webkit-playsinline', 'true');
                        video.setAttribute('x5-playsinline', 'true');
                        
                        // 添加视频事件监听器来优化加载过程
                        const handleVideoReady = () => {
                            console.log('Video metadata loaded, starting playback');
                            // 元数据就绪先做一次门控判断
                            applyGate();
                            if (video.requestVideoFrameCallback) {
                            const watch = () => {
                                applyGate();
                                if (!gateShown) video.requestVideoFrameCallback(watch);
                            };
                            video.requestVideoFrameCallback(watch);
                        } else {
                            const pollId = setInterval(() => {
                                applyGate();
                                if (gateShown) clearInterval(pollId);
                            }, 200);
                        }
                            video.play().then(() => {
                                console.log('Video playback started successfully');
                                isVideoReady = true;
                                flushPendingAnswers();
                                updateOverlayPositions();
                        
                           
                            }).catch(e => {
                                console.warn('Video autoplay failed:', e);
                            });
                        };
                        
                        // 监听视频元数据加载完成
                        if (video.readyState >= 1) {
                            handleVideoReady();
                        } else {
                            video.addEventListener('loadedmetadata', handleVideoReady, { once: true });
                        }
                        
                        // 首帧渲染后兜底再检查一次（有的设备首帧后分层才更新）
                        
                        // if (canvas) canvas.style.display = 'none';
                    } else if (track.kind === LiveKit.Track.Kind.Audio) {
                        if (audioEl) track.attach(audioEl);
                        try {
                            audioEl.muted = false;
                            audioEl.volume = 1.0;
                            // audioEl.preload = 'none';  // 音频保持none避免不必要的预加载
                            audioEl.play().catch(()=>{});
                        } catch(e){}
                    }
                    try { console.log('TrackSubscribed: audio'); } catch(e){}
                } catch(e) { console.warn('attach track error', e); }
            });
            room.on(LiveKit.RoomEvent.DataReceived, (payload/*Uint8Array*/, participant, kind) => {
                try {
                    const s = new TextDecoder().decode(payload);
                    if (!s) return;
                    const msg = JSON.parse(s);
                    if (!msg || typeof msg !== 'object' || !('message_type' in msg)) return;
                    const mt = String(msg.message_type||'').toLowerCase();
                    const text = String(msg.text||'').trim();
                    if (!text) return;
                    if (mt === 'assistant') {
                        // 大模型回答：独立模块（answerLines）
                        pushAnswerLineDeferred(text);
                    } else if (mt === 'stt' || mt === 'user_text') {
                        // 语音识别 + 前端主动文字：合并在底部模块
                        setStt(text);
                    }
                    // 其他未知类型：直接忽略
                } catch(e) { /* ignore */ }
            });
            // 在 RoomEvent.ConnectionStateChanged 中插入模板面板显隐钩子
            room.on(LiveKit.RoomEvent.ConnectionStateChanged, (st) => {
                if (st === LiveKit.ConnectionState.Connected) {
                    state = SessionState.CONNECTED;
                    callBtn.classList.remove('start'); callBtn.classList.add('hangup'); 
                    callBtn.innerHTML = PHONE_SVG; callBtn.disabled = false;
                    // 更新提示为“停止播放”
                    callBtn.setAttribute('title', '停止播放');
                    callBtn.setAttribute('aria-label', '停止播放');
                    interruptBtn && (interruptBtn.disabled = false);
                    showOverlayButtons(); setListenActive(true); updateListenStatus('聆听中'); hideCenterPrompt();
                    try { video.muted = false; video.volume = 1.0; video.play().catch(()=>{}); 
                    if (audioEl) { audioEl.muted = false; audioEl.volume = 1.0; audioEl.play().catch(()=>{}); } } catch(e){}
                    updateOverlayPositions();
                
                    // 新增：连接成功后隐藏模板选择面板
                    if (window.TemplateSelector) window.TemplateSelector.hide();
                    
                } else if (st === LiveKit.ConnectionState.Disconnected || st === LiveKit.ConnectionState.Failed) {
                    state = SessionState.ERROR; hideOverlayButtons(); showCenterPrompt('连接异常', { variant:'warn', showSpinner:false });
                    textInputBar && (textInputBar.style.display = 'none');
                
                    // 新增：断开或失败时重新加载并显示模板选择面板
                    if (window.TemplateSelector) window.TemplateSelector.loadAndShow();
                }
                updateOverlayPositions();
            });

            try {
                await room.connect(connectUrl, data.token);
                console.log('LiveKit连接成功');
            } catch (e) {
                console.warn('LiveKit连接失败，使用模拟视频流', e);
                // 使用模拟视频流
                await startMockVideoStream(data);
                return;
            }

            // 模拟视频流功能
            async function startMockVideoStream(data) {
                console.log('启动模拟视频流');
                
                // 创建视频元素
                const video = document.createElement('video');
                video.src = data.video_url || '/demo-video.mp4';
                video.loop = true;
                video.muted = true;
                video.autoplay = true;
                video.style.display = 'none';
                document.body.appendChild(video);
                
                // 等待视频加载
                await new Promise((resolve, reject) => {
                    video.onloadeddata = resolve;
                    video.onerror = reject;
                    video.load();
                });
                
                // 开始播放
                await video.play();
                
                // 创建Canvas并获取视频流
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                const ctx = canvas.getContext('2d');
                
                // 模拟视频轨道
                const mockTrack = {
                    kind: 'video',
                    source: 'camera',
                    sid: 'mock-video-track',
                    participant: {
                        identity: 'mock-participant',
                        sid: 'mock-participant-sid'
                    },
                    attach: (element) => {
                        console.log('附加模拟视频轨道到元素');
                        if (element.tagName === 'VIDEO') {
                            element.srcObject = canvas.captureStream(30);
                            element.play();
                        }
                        return element;
                    },
                    detach: (element) => {
                        if (element.tagName === 'VIDEO') {
                            element.srcObject = null;
                        }
                    }
                };
                
                // 开始渲染循环
                function renderFrame() {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    requestAnimationFrame(renderFrame);
                }
                renderFrame();
                
                // 模拟参与者加入事件
                setTimeout(() => {
                    console.log('模拟参与者加入');
                    if (typeof handleTrackSubscribed === 'function') {
                        handleTrackSubscribed(mockTrack, null, {
                            identity: 'mock-participant',
                            sid: 'mock-participant-sid'
                        });
                    }
                    updateListenStatus('模拟连接中');
                }, 1000);
            }

            // 连接后：请求麦克风权限并自动开启（确保系统可获取话筒）
            console.log('尝试自动开启麦克风...');
            const ok = await ensureMicPermission();
            if (ok) {
                try {
                    console.log('创建音频轨道...');
                    micTrack = await LiveKit.createLocalAudioTrack({ 
                        echoCancellation: true, 
                        noiseSuppression: true, 
                        autoGainControl: true 
                    });
                    console.log('发布音频轨道...');
                    await room.localParticipant.publishTrack(micTrack);
                    micEnabled = true;
                    if (micBtn) { 
                        micBtn.classList.add('on'); 
                        micBtn.textContent = '麦克风开'; 
                    }
                    updateListenStatus('聆听中（麦克风开）');
                    console.log('麦克风自动开启成功');
                } catch (e) {
                    console.error('麦克风开启失败:', e);
                    showCenterPrompt(`麦克风开启失败: ${e.message}`, { variant: 'warn' });
                }
            } else {
                console.warn('麦克风权限获取失败，请手动点击麦克风按钮');
                showCenterPrompt('麦克风权限获取失败，请手动点击麦克风按钮', { variant: 'warn' });
            }

            window._lkRoom = room;
            // 发送文字到后端：包装为带类型的纯文本消息（前端主动发送）
            window.sendTextViaLiveKit = async function(text){
                try {
                    const t = String(text||'').trim(); if (!t) return;
                    const payload = JSON.stringify({ message_type: 'user_text', text: t });
                    const bytes = new TextEncoder().encode(payload);
                    await room.localParticipant.publishData(bytes, { reliable:true });
                } catch(e) { console.warn('publishData 失败', e); }
            };

        } catch(e) {
            state = SessionState.ERROR;
            showCenterPrompt('网络错误', { variant:'danger', showSpinner:false });
        }
    }

    // ---- 交互：文本发送 ----
    function sendTextFromUI(){
        if (!textInput) return;
        const txt = String(textInput.value || '').trim();
        if (!txt) return;
        textInput.value = '';
        if (window.sendTextViaLiveKit) window.sendTextViaLiveKit(txt);
    }
    if (sendBtn) sendBtn.addEventListener('click', sendTextFromUI);
    if (textInput) textInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') sendTextFromUI(); });

    // ---- 停止与重置（断开 LiveKit） ----
    async function stopCallResetOnly(){
        try { stopRenderer(); } catch(e){}
        setListenActive(false); updateListenStatus(''); setStt(''); clearAnswers();
        textInputBar && (textInputBar.style.display = 'none');
        try { if (room) await room.disconnect(); } catch(e){}
        room = null;
        try { video.srcObject = null; } catch(e){}
        callBtn.classList.remove('hangup'); callBtn.classList.add('start'); callBtn.innerHTML = PHONE_SVG; callBtn.disabled = false;
        // 恢复提示为“开始播放”
        callBtn.setAttribute('title', '开始播放');
        callBtn.setAttribute('aria-label', '开始播放');
        isVideoReady = false; pendingAnswers.length = 0;
        try { canvas.style.visibility = 'hidden'; } catch(e){}
        hideOverlayButtons();
        // 断开时释放麦克风资源
        try { if (micTrack && window._lkRoom && window._lkRoom.localParticipant) await window._lkRoom.localParticipant.unpublishTrack(micTrack); } catch(e){}
        try { micTrack && micTrack.stop(); } catch(e){}
        micTrack = null; micEnabled = false;
        if (micBtn) { micBtn.classList.remove('on'); micBtn.textContent = '麦克风关'; }
    }

    (function setupLifecycleStop(){
        let stopSent = false;
        async function sendStop(){
            if (stopSent) return;
            stopSent = true;
            try {
                if (navigator.sendBeacon) {
                    // sendBeacon 必须带数据体，给一个空 blob
                    const blob = new Blob([], { type: 'application/octet-stream' });
                    navigator.sendBeacon('/lk/stop', blob);
                } else {
                    await fetch('/lk/stop', { method: 'POST', cache: 'no-store', keepalive: true });
                }
            } catch(e) {
                try { await fetch('/lk/stop', { method: 'POST', cache: 'no-store', keepalive: true }); } catch(_) {}
            }
        }
        // 页面被卸载或进入 bfcache（更可靠）
        window.addEventListener('pagehide', sendStop, { once: true });
        // 传统卸载事件作为兜底
        window.addEventListener('beforeunload', sendStop, { once: true });
        // 删除：最小化/标签页隐藏不再触发停流，避免误停导致重启失败
        // document.addEventListener('visibilitychange', () => {
        //     if (document.visibilityState === 'hidden') sendStop();
        // });
    })();

    function stopAndReset(){ 
        hideCenterPrompt();
        if (callBtn) callBtn.disabled = true;
        stopCallResetOnly();
        try { fetch('/lk/stop', { method: 'POST', cache: 'no-store' }).catch(()=>{}); } catch(e) {}
        state = SessionState.IDLE; 
        // 更新：停止后重新加载并显示模板面板（避免按钮保持禁用）
        if (window.TemplateSelector) window.TemplateSelector.loadAndShow();
        if (callBtn) callBtn.disabled = false;
    }
        
    // ---- 打断（通过数据通道发送一个控制提示；后端可选择处理）----
    async function sendInterrupt(){
        try {
            if (window._lkRoom && window._lkRoom.localParticipant) {
                const payload = new TextEncoder().encode('[INTERRUPT]');
                await window._lkRoom.localParticipant.publishData(payload, { reliable:true });
                updateListenStatus(''); setStt(''); clearAnswers();
            }
        } catch(e) { console.warn('发送打断失败', e); }
    }

    // ---- 交互绑定与初始 UI ----
    callBtn.addEventListener('click', () => {
        if (callBtn.classList.contains('start')) {
            state = SessionState.CONNECTING;
            callBtn.disabled = true;
            startCallLiveKitOnly().then(() => { callBtn.disabled = false; updateOverlayPositions(); }).catch(() => {
                state = SessionState.ERROR; callBtn.disabled = false; stopCallResetOnly(); showCenterPrompt('启动失败', { variant:'danger', showSpinner:false });
            });
        } else {
            stopAndReset();
        }
    });
    exitBtn && exitBtn.addEventListener('click', () => { stopAndReset(); });
    if (interruptBtn) interruptBtn.addEventListener('click', sendInterrupt);

    callBtn.classList.add('start');
    callBtn.innerHTML = PHONE_SVG;
    // 初始化提示为“开始播放”
    callBtn.setAttribute('title', '开始播放');
    callBtn.setAttribute('aria-label', '开始播放');
    if (interruptBtn) interruptBtn.setAttribute('aria-label', '打断');
    if (exitBtn) exitBtn.setAttribute('aria-label', '退出');

    updateOverlayPositions();
    if (audioOverlay) {
        audioOverlay.addEventListener('click', () => {
            ensureVideoPlayingWithSound()
                .then(() => { audioOverlay.style.display = 'none'; })
                .catch(() => {});
        });
    }

    // 初次进入：移除旧提示 + 居中提示 + 隐藏画布
    hideOverlayButtons();
    (function(){
        const hint = document.getElementById('loadingHint'); if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
        const overlay = document.getElementById('loadingOverlay'); if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        const cvs = document.getElementById('videoCanvas'); if (cvs) cvs.style.visibility = 'hidden';
        showCenterPrompt('点击聊天按钮，开始聊天', { variant:'info', showSpinner:false });
        updateOverlayPositions();
        if (window.TemplateSelector) {
            window.TemplateSelector.init({
                onSelect: async (tplName) => {
                    // 仅选择模板，不自动开播；保留“开始播放”按钮
                    try {
                        state = SessionState.CONNECTING;
                        callBtn.disabled = true;
                        showCenterPrompt('正在连接...', { showSpinner:true });
                        await startCallLiveKitOnly();
                        callBtn.disabled = false;
                        updateOverlayPositions();
                    } catch (e) {
                        state = SessionState.ERROR;
                        callBtn.disabled = false;
                        stopCallResetOnly();
                        showCenterPrompt('启动失败', { variant:'danger', showSpinner:false });
                    }
                }
        });
        window.TemplateSelector.loadAndShow();
    }
    })();

    // 响应尺寸与视频元数据变化
    window.addEventListener('resize', updateOverlayPositions);
    if (video) {
        video.addEventListener('loadedmetadata', () => {
            isVideoReady = true;
            flushPendingAnswers();
            updateOverlayPositions();
            if (textInputBar) textInputBar.style.display = 'flex';
            updateOverlayPositions();
        });
    }
})();
