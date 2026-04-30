# 谍报战主题 UI 重构计划

## 需求概述
在 `origin/feature-1.0` 分支上重构游戏 UI，实现谍报战主题视觉风格：
- 使用 Seedream 生成地下情报站主题背景
- 所有游戏元素融合进背景，无独立容器边框
- 元素伪装成桌面物品：纸质卡片、打字机按键

## 当前状态分析

### 项目结构
```
/workspace/
├── apps/web/src/
│   ├── App.tsx          # 主应用，包含首页/房间/Demo页面
│   ├── components/
│   │   ├── Board.tsx    # 5x5 牌盘组件
│   │   ├── RolePanel.tsx
│   │   └── ActivityLog.tsx
│   └── styles.css       # 主样式文件（需要大幅重构）
└── apps/web/public/     # 静态资源目录
```

### 当前样式架构
- 使用 CSS 变量定义颜色系统（--red, --blue, --neutral, --assassin）
- 主要容器：`.hero-page`, `.shell`, `.hero-card`, `.panel`, `.board-section`
- 卡片样式：`.card` + `.card--{owner}` 状态类
- 按钮样式：`.primary-action`, `.ghost`

### 需要修改的文件
1. `apps/web/src/styles.css` - 主样式文件，完全重构
2. `apps/web/src/components/Board.tsx` - 牌盘组件，移除容器感
3. `apps/web/src/App.tsx` - 可能需要调整布局结构
4. 新增背景图片资源

## 实施方案

### 阶段 1：背景图片生成与集成

#### 1.1 生成背景图片
使用 Seedream API 生成地下情报站主题背景：
```bash
# 背景图 prompt（已验证可生成）
cd /data/user/skills/byted-seedream-image-generate
ARK_API_KEY="ark-03e2ff64-adff-4006-a896-f301cc998e04-425c0" \
python scripts/seedream_image_generate.py \
  -p "Retro espionage underground room, wooden desk with scattered classified documents, old typewriter, rotary telephone, green desk lamp glow, leather chair, wall map with red and blue pins, coffee cup, cigarette smoke, ink bottles, file folders, warm amber lighting, dark green and mahogany tones, vintage 1940s spy agency atmosphere" \
  -s 1920x1080 --no-watermark --version 4.0
```

#### 1.2 背景图片存储策略
由于 Seedream URL 有 24 小时时效限制，采用以下方案：
- **方案 A（推荐）**：图片存储在图床/CDN，代码中引用 URL
- **方案 B**：本地存储，需要定期刷新

### 阶段 2：样式重构

#### 2.1 CSS 变量系统重构
```css
:root {
  /* 谍报战色调 */
  --spy-dark: #1a1612;
  --spy-wood: #3d2b1f;
  --spy-lamp: #d4a84b;
  --spy-paper: #f5e6c8;
  --spy-paper-dark: #c4a882;
  --spy-red: #8b2500;
  --spy-blue: #1e3a5f;
  --spy-ink: #1a1a1a;

  /* 透明叠加 */
  --overlay-glass: rgba(26, 22, 18, 0.75);
  --overlay-paper: rgba(245, 230, 200, 0.08);
}
```

#### 2.2 背景设置
```css
body {
  background:
    url('/spy-bg.jpg') center/cover no-repeat fixed,
    var(--spy-dark);
}

/* 纸质纹理叠加 */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  background: url('data:image/svg+xml,...'); /* 纸张噪点纹理 */
  pointer-events: none;
  opacity: 0.15;
}
```

### 阶段 3：UI 元素伪装设计

#### 3.1 牌盘卡片（纸质效果）
```css
.card {
  background:
    linear-gradient(135deg, rgba(245, 230, 200, 0.12), rgba(196, 168, 130, 0.08)),
    var(--overlay-paper);
  border: 1px solid rgba(196, 168, 130, 0.3);
  border-radius: 4px; /* 纸张边缘不规则感 */
  box-shadow:
    2px 3px 8px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(4px);
  transform: rotate(-0.5deg); /* 轻微倾斜，随机化 */
}

/* 红队 - 红色墨水印章 */
.card--red {
  background:
    radial-gradient(circle at 30% 70%, rgba(139, 37, 0, 0.15), transparent 50%),
    var(--overlay-paper);
  border-bottom: 2px solid var(--spy-red);
}

/* 蓝队 - 蓝色墨水印章 */
.card--blue {
  background:
    radial-gradient(circle at 70% 30%, rgba(30, 58, 95, 0.2), transparent 50%),
    var(--overlay-paper);
  border-bottom: 2px solid var(--spy-blue);
}

/* 已翻开的卡片 - 像被翻阅过的文件 */
.card--red[style*="revealed"],
.card--blue[style*="revealed"] {
  opacity: 0.5;
  transform: rotateY(180deg) scale(0.95);
}
```

#### 3.2 打字机风格按钮
```css
button:not(.ghost) {
  background: linear-gradient(180deg, #c9b896, #a89070);
  border: 1px solid #5c4a32;
  border-radius: 50%;
  box-shadow:
    0 4px 0 #3d2b1f,
    0 6px 8px rgba(0, 0, 0, 0.3);
  color: var(--spy-ink);
  font-family: 'Courier New', monospace;
  font-weight: bold;
  text-transform: uppercase;
  padding: 0.75rem 1.25rem;
  transition: transform 80ms, box-shadow 80ms;
}

button:not(.ghost):active {
  transform: translateY(3px);
  box-shadow:
    0 1px 0 #3d2b1f,
    0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 主按钮 - 红色印章效果 */
.primary-action {
  background:
    radial-gradient(circle at center, var(--spy-red), #5c1800);
  border-color: #3d1000;
  color: var(--spy-paper);
}
```

#### 3.3 面板区域（文件夹效果）
```css
.panel {
  background:
    linear-gradient(180deg, rgba(245, 230, 200, 0.1), rgba(196, 168, 130, 0.06)),
    var(--overlay-glass);
  border: 1px solid rgba(196, 168, 130, 0.25);
  border-radius: 2px;
  box-shadow:
    4px 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
}

/* 文件夹标签 */
.panel::before {
  content: attr(data-label);
  position: absolute;
  top: -12px;
  left: 16px;
  padding: 2px 12px;
  background: var(--spy-paper);
  color: var(--spy-ink);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-radius: 2px;
}
```

#### 3.4 输入框（打字机纸带效果）
```css
input {
  background:
    linear-gradient(180deg, var(--spy-paper), #e6d5b0);
  border: 1px solid #8b7355;
  border-radius: 0;
  padding: 0.6rem 0.8rem;
  color: var(--spy-ink);
  font-family: 'Courier New', monospace;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

input::placeholder {
  color: #8b7355;
  font-style: italic;
}
```

#### 3.5 顶部状态栏（打字机输出条效果）
```css
.game-topbar {
  background:
    linear-gradient(180deg, #2a231c, #1a1612);
  border: 1px solid #3d2b1f;
  border-radius: 0;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* 状态标签 - 印章效果 */
.turn-pill,
.view-badge {
  background: var(--spy-paper);
  color: var(--spy-ink);
  border: 1px solid #8b7355;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
}
```

### 阶段 4：融合效果增强

#### 4.1 移除容器感
```css
/* 所有面板半透明，融入背景 */
.hero-card,
.panel,
.board-section {
  background: var(--overlay-glass);
  border: 1px solid rgba(196, 168, 130, 0.2);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
}
```

#### 4.2 卡片悬停效果
```css
.card:not([disabled]):hover {
  transform: translateY(-2px) rotate(0deg);
  box-shadow:
    4px 6px 16px rgba(0, 0, 0, 0.5);
  background:
    linear-gradient(180deg, rgba(245, 230, 200, 0.2), rgba(245, 230, 200, 0.1)),
    var(--overlay-paper);
}
```

#### 4.3 动画效果
```css
@keyframes paper-appear {
  from {
    opacity: 0;
    transform: translateY(8px) rotate(-1deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) rotate(0deg);
  }
}

.card {
  animation: paper-appear 300ms ease-out;
  animation-fill-mode: both;
}

.card:nth-child(odd) { animation-delay: calc(var(--i, 0) * 30ms); }
.card:nth-child(even) { animation-delay: calc(var(--i, 0) * 30ms + 15ms); }
```

## 具体文件修改清单

### 1. styles.css（完全重构）
- 重写 CSS 变量系统
- 重写背景样式
- 重写所有组件样式
- 添加纸质纹理效果
- 添加打字机字体

### 2. Board.tsx（微调）
- 移除固定边框效果
- 添加卡片随机倾斜
- 保留原有逻辑

### 3. App.tsx（可选）
- 评估是否需要结构调整
- 可能需要调整布局结构

### 4. 新增资源
- 背景图片存储策略
- 可选：添加 SVG 图标（印章、回形针等装饰）

## 实现步骤

1. **分支切换**
   ```bash
   git checkout origin/feature-1.0
   git checkout -b feature/spy-theme
   ```

2. **背景图片集成**
   - 选择图片存储方案
   - 更新 CSS 背景引用

3. **样式重构**
   - 按阶段完成 CSS 重写
   - 测试各组件显示效果

4. **融合效果调试**
   - 调整透明度
   - 测试卡片悬停效果
   - 确保无容器感

5. **测试验证**
   - 桌面端 (1600x900)
   - 移动端 (390x844)
   - 所有游戏状态

## 验证清单

- [ ] 背景图片正确显示
- [ ] 牌盘 5x5 完整可见
- [ ] 纸质卡片效果自然融入背景
- [ ] 打字机按钮风格一致
- [ ] 面板半透明，无明显容器边框
- [ ] 移动端首屏正常
- [ ] 动画效果流畅
- [ ] 红蓝阵营颜色区分清晰
- [ ] 整体氛围符合地下情报站风格
