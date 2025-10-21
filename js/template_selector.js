// 独立模板选择模块（IIFE，全局导出 window.TemplateSelector）
(function(){
    'use strict';

    const PANEL_ID = 'templateGrid';
    let container = null;
    let options = { onSelect: null };
    let currentTemplate = null;
    let isLoading = false;

    function ensureContainer() {
        if (!container) {
            container = document.getElementById(PANEL_ID);
        }
        if (!container) {
            console.warn('[TemplateSelector] 未找到容器 #' + PANEL_ID);
            return false;
        }
        return true;
    }

    function normalizeTemplatesPayload(data) {
        // 兼容返回：
        // 1) { templates: [...] } 或 { templates: { name: info, ... } }
        // 2) 直接数组 [...]
        // 3) 直接字典 { name: info, ... }
        let templates = [];
        let current = data?.current?.name 
            || data?.current_name 
            || data?.current 
            || data?.current_template 
            || null;

        if (Array.isArray(data?.templates)) {
            templates = data.templates;
        } else if (data?.templates && typeof data.templates === 'object') {
            templates = Object.values(data.templates);
        } else if (Array.isArray(data)) {
            templates = data;
        } else if (data && typeof data === 'object') {
            // /templates 返回的字典：{ name: info, ... }
            templates = Object.values(data);
        }
        return { templates, current };
    }

    function safeStr(x){ try { return String(x||'').trim(); } catch(e){ return ''; } }
    function resolvePreview(item){
        const keys = ['preview_image','preview','image','cover','thumb'];
        for (const k of keys) {
            const v = item && item[k];
            if (v) return safeStr(v);
        }
        // 兜底：没有预览则用透明占位
        return '';
    }

    function setLoading(loading){
        isLoading = !!loading;
        if (!ensureContainer()) return;
        container.innerHTML = `
            <div class="tpl-header">选择模板开始播放</div>
            <div class="tpl-list ${loading ? 'loading' : ''}">
                ${loading ? '<div class="tpl-loading">正在加载模板...</div>' : ''}
            </div>
        `;
    }

    function renderTemplates(items, currentName){
        if (!ensureContainer()) return;
        currentTemplate = currentName || null;
        const listEl = container.querySelector('.tpl-list');
        if (!listEl) return;
        listEl.classList.remove('loading');
        listEl.innerHTML = '';

        if (!items || !items.length) {
            listEl.innerHTML = `<div class="tpl-empty">暂无可用模板</div>`;
            return;
        }

        // 新增：统一设置当前高亮卡片的工具函数
        function setCurrentCard(cardEl, name){
            try {
                const cards = container.querySelectorAll('.tpl-card');
                cards.forEach(c => c.classList.remove('current'));
                if (cardEl) cardEl.classList.add('current');
                currentTemplate = name;
            } catch(e) {}
        }

        for (const t of items) {
            const name = safeStr(t.name || t.template || t.id);
            const title = safeStr(t.title || t.display_name || name);
            const desc = safeStr(t.description || t.desc || '');
            const thumb = resolvePreview(t);
            const card = document.createElement('div');
            card.className = 'tpl-card' + (name && name === currentTemplate ? ' current' : '');

            card.innerHTML = `
                <div class="thumb">${thumb ? `<img src="${thumb}" alt="${title}"/>` : `<div class="no-thumb"></div>`}</div>
                <div class="meta">
                    <div class="name">${title}</div>
                    ${desc ? `<div class="desc">${desc}</div>` : ''}
                    <div class="actions">
                        <button class="play-btn">选择模板</button>
                    </div>
                </div>
            `;

            const playBtn = card.querySelector('.play-btn');

            // 点击卡片高亮当前
            card.addEventListener('click', () => {
                setCurrentCard(card, name);
            });

            playBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    playBtn.disabled = true;
                    // 立即反馈：高亮并隐藏选择面板
                    setCurrentCard(card, name);
                    hide();
                    // 立即启动播放（不等待后端切换完成）
                    if (options.onSelect && typeof options.onSelect === 'function') {
                        // 不 await，避免阻塞模板切换请求
                        options.onSelect(name);
                    }
                    // 异步通知后端切换模板（不阻塞前端跳转）
                    fetch('/templates/select', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ template_name: name })
                    }).then(r => r.ok ? r : Promise.reject(new Error('切换失败')))
                      .catch(e => {
                          console.warn('[TemplateSelector] 后端模板切换失败', e);
                      });
                } catch(e) {
                    console.warn('[TemplateSelector] 选择失败', e);
                    // 显示错误提示（简化处理）
                    try {
                        playBtn.disabled = false;
                        playBtn.textContent = '重试选择并播放';
                    } catch(_) {}
                }
            });

            listEl.appendChild(card);
        }
    }

    async function loadTemplates(){
        try {
            setLoading(true);
            const resp = await fetch('/templates', { method: 'GET', cache: 'no-store' });
            const data = await resp.json();
            let { templates, current } = normalizeTemplatesPayload(data);

            // 若当前模板未提供，额外尝试获取 /templates/current
            if (!current) {
                try {
                    const r2 = await fetch('/templates/current', { method:'GET', cache:'no-store' });
                    if (r2.ok) {
                        const j2 = await r2.json();
                        current = j2?.current_template || current || null;
                    }
                } catch (_) {}
            }
            renderTemplates(templates, current);
        } catch(e) {
            console.warn('[TemplateSelector] 加载模板失败', e);
            if (ensureContainer()) {
                const listEl = container.querySelector('.tpl-list');
                if (listEl) listEl.innerHTML = `<div class="tpl-error">加载模板失败，请稍后重试</div>`;
            }
        } finally {
            isLoading = false;
        }
    }

    function show(){
        if (!ensureContainer()) return;
        container.classList.add('visible');
        container.setAttribute('aria-hidden', 'false');
        // 新增：复位所有卡片按钮，避免一次点击后永久禁用
        try {
            const btns = container.querySelectorAll('.tpl-card .play-btn');
            btns.forEach(btn => {
                btn.disabled = false;
                btn.textContent = '选择模板';
            });
        } catch(e) {}
    }

    function hide(){
        if (!ensureContainer()) return;
        container.classList.remove('visible');
        container.setAttribute('aria-hidden', 'true');
    }

    function init(opts){
        options = Object.assign({ onSelect: null }, opts || {});
        if (!ensureContainer()) return;
        container.innerHTML = `
            <div class="tpl-header">选择模板开始播放</div>
            <div class="tpl-list"></div>
        `;
    }

    async function loadAndShow(){
        await loadTemplates();
        show();
    }

    // 导出
    window.TemplateSelector = {
        init,
        loadTemplates,
        loadAndShow,
        show,
        hide,
    };
})();