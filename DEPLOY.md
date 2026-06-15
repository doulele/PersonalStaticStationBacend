# 部署指南 — StaticTool Node.js 后端

> 主站：http://wellwin.top/  
> 当前工具：http://wellwin.top/staticTool/home（前端端口 3000）  
> 后端端口：**3001**（仅 127.0.0.1 监听，不对外暴露）

---

## ⚠️ 安全警告

**`.env` 文件包含腾讯云密钥、API Key 等敏感信息，严禁：**
- 提交到 Git（已加入 `.gitignore`）
- 通过 Xftp 直接上传到服务器
- 发送给任何人

✅ **正确做法**：先在服务器上手动创建 `.env`，再把内容粘贴进去。

---

## 一、服务器环境准备

以下操作需要 **Xshell SSH 登录服务器** 或通过 **宝塔面板** 完成。

### 1. 安装 Node.js（宝塔面板）

1. 宝塔面板 → 软件商店 → 搜索 **"Node.js版本管理器"** → 安装
2. 安装后进入设置，选择 **Node v18.20.0 或更高版本**  
   > 本项目使用 ES Module（`"type": "module"`），Node 16 可运行但建议 v18+。

### 2. 确认 npm 可用（Xshell）

```bash
node -v    # 确认版本 ≥ v18
npm -v     # 确认 npm 可用
```

### 3. 安装 PM2（Xshell）

```bash
npm install -g pm2
pm2 -v    # 确认安装成功
```

---

## 二、上传后端代码

### 上传方式：Xftp（拖拽上传）

1. 打开 **Xftp**，连接到服务器
2. 定位到服务器目录 `/www/wwwroot/node/staticTool/`
3. **从本地项目中，选中以下文件/文件夹上传**：

```
✅ 上传：
   app.js
   package.json
   package-lock.json
   ecosystem.config.cjs
   config/
   routes/
   services/
   middlewares/

❌ 不要上传：
   .env          ← 含密钥，必须在服务器上手动创建
   node_modules/ ← 上传后重新 npm install
   .gitignore    ← 不需要
   DEPLOY.md     ← 不需要
```

> 💡 **技巧**：先在本地把 `.env` 临时移出项目目录，上传完毕后再移回来，这样就不会误上传。

### 上传后安装依赖（Xshell）

```bash
cd /www/wwwroot/node/staticTool
npm install
```

安装完成后检查目录应包含：
```
/www/wwwroot/node/staticTool/
├── app.js
├── package.json
├── ecosystem.config.js
├── node_modules/     ← npm install 生成的
├── config/
├── routes/
├── services/
└── middlewares/
```

---

## 三、创建 .env 环境变量文件（⚠️ 关键步骤）

**在服务器上手动创建，不要从本地上传！**

### 方式一：宝塔面板文件管理（推荐，可视化操作）

1. 宝塔面板 → 文件 → 进入 `/www/wwwroot/node/staticTool/`
2. 点击 **新建文件** → 文件名填 `.env`
3. 将下面内容粘贴进去（替换为真实密钥）：

```env
PORT=3001

# 腾讯云 OCR（必填，彩票拍照识别）
TENCENT_SECRET_ID=你的腾讯云SecretId
TENCENT_SECRET_KEY=你的腾讯云SecretKey

# DeepSeek API Key（可选，启用后提高彩票号码解析准确率）
# 获取地址：https://platform.deepseek.com/api_keys
DEEPSEEK_API_KEY=你的DeepSeek_API_Key

# RollToolsApi 彩票查询 API（可选）
# 申请地址：https://www.mxnzp.com/
MXNZP_APP_ID=你的MXNZP_APP_ID
MXNZP_APP_SECRET=你的MXNZP_APP_SECRET
```

4. 保存文件

### 方式二：Xshell 命令行创建

```bash
cd /www/wwwroot/node/staticTool
vi .env
# 按 i 进入编辑模式，粘贴内容，按 Esc 再输入 :wq 保存退出
```

### 验证 .env 已生效

```bash
cd /www/wwwroot/node/staticTool
node -e "require('dotenv').config(); console.log('PORT:', process.env.PORT)"
# 应输出: PORT: 3001
```

---

## 四、配置 Nginx（宝塔面板操作）

### ⚠️ 注意生效顺序

Nginx 的 `location` 匹配有优先级：当访问 `/staticTool/api/health` 时，如果存在 `location ^~ /staticTool/` 规则，会先匹配到静态文件的规则，导致 API 请求被当作静态文件处理（返回 404）。

**关键**：API 代理的 location 必须 **写在静态文件 location 之前**。

### 步骤：

1. 宝塔面板 → 网站 → **wellwin.top** → **配置文件**
2. 在 `server { }` 块内，找到原有的 `/staticTool/` 静态文件配置（类似下面这样）：

```nginx
location ^~ /staticTool/ {
    root /www/wwwroot/...;
    # 静态文件配置...
}
```

3. **在这个 location 之前**，新增 API 代理配置：

```nginx
# =============================================
# StaticTool 后端 API 代理（端口 3001）
# ⚠️ 必须写在 /staticTool/ 静态文件 location 之前
# =============================================
location ^~ /staticTool/api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;
}
```

4. **删除旧的代理配置**（如果存在以下 4 个，统一都合并到 `/staticTool/api/` 下了）：

```nginx
location ^~ /api-fund/ { ... }    ← 删除
location ^~ /api-push2/ { ... }   ← 删除
location ^~ /api-qt/ { ... }      ← 删除
location ^~ /api-ifzq/ { ... }    ← 删除
```

5. 保存配置 → **重载 Nginx**

---

## 五、启动后端服务（Xshell）

```bash
cd /www/wwwroot/node/staticTool

# 1. 先手动测试（确认没有报错）
node app.js
# 如果输出 "[StaticTool Backend] Server running on http://localhost:3001" 则正常
# 按 Ctrl+C 停止

# 2. 使用 PM2 启动（守护进程，自动重启）
pm2 start ecosystem.config.cjs

# 3. 查看状态
pm2 status
# 应显示 statictool-api → online

# 4. 设置 PM2 开机自启
pm2 save
pm2 startup
# 按提示复制粘贴生成的 sudo 命令执行
```

### 验证

```bash
# 1. 直接访问后端
curl http://127.0.0.1:3001/health
# 应返回: {"status":"ok","timestamp":"..."}

# 2. 通过 Nginx 代理访问（模拟前端调用）
curl http://wellwin.top/staticTool/api/health
# 应返回: {"status":"ok","timestamp":"..."}

# 3. 测试 OCR 接口（需要一张 base64 图片，实际使用时前端调用）
curl http://wellwin.top/staticTool/api/lottery/latest
# 应返回 JSON 数据
```

### 日志查看

```bash
pm2 logs statictool-api        # 实时日志
pm2 logs statictool-api --lines 50  # 最近 50 行
```

---

## 六、日常更新流程

当你修改了本地代码需要更新服务器时：

### 1. 上传更新文件（Xftp）
直接拖拽覆盖对应的文件（如修改了 `routes/lottery.js` 就只上传这个文件）。

### 2. 重启服务（Xshell）
```bash
pm2 restart statictool-api
```

### 3. 如果更新了 package.json 依赖
```bash
cd /www/wwwroot/node/staticTool
npm install
pm2 restart statictool-api
```

---

## 七、故障排查

| 现象 | 可能原因 | 解决 |
|---|---|---|
| `502 Bad Gateway` | 后端没启动 | `pm2 status` 查看状态，`pm2 restart statictool-api` |
| API 返回 404 | Nginx location 顺序不对 | 检查 API 代理是否在静态文件 location **之前** |
| `curl 127.0.0.1:3001/health` 正常但域名访问 404 | Nginx 配置未重载 | 宝塔面板重载 Nginx |
| `module not found` 错误 | 上传了旧 node_modules | 删除 `node_modules`，重新 `npm install` |
| PM2 启动失败 | .env 不存在 | 确认 `/www/wwwroot/node/staticTool/.env` 已创建 |
| OCR 返回 "未配置" | .env 中密钥未填写 | 检查 TENCENT_SECRET_ID / TENCENT_SECRET_KEY |

---

## 八、常用管理命令速查

```bash
pm2 status                  # 查看所有服务状态
pm2 logs statictool-api     # 查看实时日志
pm2 restart statictool-api  # 重启后端
pm2 stop statictool-api     # 停止后端
pm2 delete statictool-api   # 从 PM2 移除（需要重新 start）
pm2 monit                   # 实时监控 CPU/内存
pm2 flush                   # 清空日志
```

---

## 九、端口与架构总览

```
用户浏览器
    ↓
https://wellwin.top
    ↓
Nginx (宝塔)
    ├── /staticTool/       → 静态文件（前端，端口 3000）
    └── /staticTool/api/   → 反向代理 → 127.0.0.1:3001（Node.js 后端）
                                        ↑
                                  PM2 守护进程
```

- **3000 端口**：前端静态页面（已有）
- **3001 端口**：后端 API 服务（本次部署）
- **3001 仅监听 127.0.0.1**，外部无法直接访问，安全

---

## 十、API 路径对照

| 旧路径 | 新路径 | 用途 |
|---|---|---|
| `/api-fund/js/...` | `/staticTool/api/fund/...` | 天天基金数据 |
| `/api-push2/...` | `/staticTool/api/push2/...` | 东方财富行情 |
| `/api-qt/...` | `/staticTool/api/qt/...` | 腾讯实时行情 |
| `/api-ifzq/...` | `/staticTool/api/ifzq/...` | 腾讯K线数据 |
| `fund.eastmoney.com/pingzhongdata/` (JSONP) | `/staticTool/api/fund/history/:code` | 基金历史净值 |
| `fundgz.1234567.com.cn/js/` (JSONP) | `/staticTool/api/fund/estimate/:code` | 基金实时估值 |
| `mxnzp.com/api/lottery/...` | `/staticTool/api/lottery/...` | 彩票开奖查询 |
| - | `/staticTool/api/ocr/parse-lottery` | 彩票 OCR 识别+解析 |
