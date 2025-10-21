/**
 * LiveKit 兼容性处理脚本
 * 处理不同版本LiveKit库的兼容性问题
 */

(function() {
    'use strict';
    
    // LiveKit库可能的全局变量名
    const POSSIBLE_LIVEKIT_NAMES = [
        'LiveKit',
        'LivekitClient', 
        'livekit',
        'Livekit',
        'LIVEKIT'
    ];
    
    // 检查并标准化LiveKit库
    function normalizeLiveKit() {
        // 如果已经有标准的LiveKit，直接返回
        if (window.LiveKit && typeof window.LiveKit.Room === 'function') {
            console.log('LiveKit库已正确加载');
            return true;
        }
        
        // 尝试找到可用的LiveKit库
        for (const name of POSSIBLE_LIVEKIT_NAMES) {
            const lib = window[name];
            if (lib && typeof lib.Room === 'function') {
                window.LiveKit = lib;
                console.log(`LiveKit库映射成功: ${name} -> LiveKit`);
                return true;
            }
        }
        
        console.error('未找到可用的LiveKit库');
        return false;
    }
    
    // 验证LiveKit库的完整性
    function validateLiveKit() {
        if (!window.LiveKit) return false;
        
        const requiredClasses = ['Room', 'Track', 'RoomEvent', 'DataPacket_Kind'];
        const requiredEnums = ['Track.Kind'];
        
        for (const className of requiredClasses) {
            if (!window.LiveKit[className]) {
                console.error(`LiveKit缺少必需的类: ${className}`);
                return false;
            }
        }
        
        // 检查嵌套的枚举
        if (!window.LiveKit.Track || !window.LiveKit.Track.Kind) {
            console.error('LiveKit缺少Track.Kind枚举');
            return false;
        }
        
        console.log('LiveKit库验证通过');
        return true;
    }
    
    // 主初始化函数
    function initializeLiveKit() {
        if (normalizeLiveKit() && validateLiveKit()) {
            // 触发自定义事件，通知LiveKit已准备就绪
            const event = new CustomEvent('livekitReady', {
                detail: { version: window.LiveKit.version || 'unknown' }
            });
            document.dispatchEvent(event);
            return true;
        }
        
        // 如果失败，触发错误事件
        const errorEvent = new CustomEvent('livekitError', {
            detail: { message: 'LiveKit库初始化失败' }
        });
        document.dispatchEvent(errorEvent);
        return false;
    }
    
    // 导出到全局
    window.LiveKitCompatibility = {
        normalize: normalizeLiveKit,
        validate: validateLiveKit,
        initialize: initializeLiveKit
    };
    
    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeLiveKit);
    } else {
        // 延迟执行，确保LiveKit库已加载
        setTimeout(initializeLiveKit, 100);
    }
    
})();