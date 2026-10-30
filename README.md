# 数学错题本 · math-notes

### 1.8.0 · 2026-10-27

- 统一纸白与深绿界面，减少装饰文案，增大题目、解析和表单字号。
- 首页增加学科切换；手机增加「错题本 / 复习 / 记一题 / 我的」底栏。
- 手机录入、详情、复习和对话改为全屏页面，适配安全区与软键盘；返回键先关闭当前页面。
- 修复草稿保存后被定时器重新写入、账号共用草稿、编辑旧题清除新题草稿、快速切换时图片处理串入其他编辑器的问题。草稿按账号隔离，并明确只保留文字。
- 修复长解析复习滚动、评分后滚动位置跳回顶部、题目标题公式未渲染、超过 200 个 ID 的查询参数数量不匹配，以及手机搜索框挤压的问题。
- 可运行 `python check_release.py` 在临时数据库验证登录、CSRF、录题、编辑、练习模式、筛选、复习和页面资源。

一个给自己用的工科数学分析 / 线性代数错题与难题收集工具。  
线上地址：**https://math.dogeeer.cn**

原题、错因、解答、图片和复习记录都收在一条按日期排列的时间线上。练习时可以隐藏解答，复盘时再展开；打印练习卷时可以选择「含解答」或「无解答」。

## 功能

- **两条时间线**：工科数学分析 / 线性代数，按记录日期自动分组，月分隔 + 日期节点。
- **原题留档**：文字 + 图片；支持直接粘贴截图、拖拽上传；LaTeX 公式用 `$...$` / `$$...$$`。
- **含解答 / 无解答**：顶部「练习模式」会把解答从接口和页面里一起隐藏，避免手滑看到答案；单题「对答案」按需展开。
- **简洁录入**：只选学科 / 状态，贴原题或图片；标题、章节、标签由系统自动整理，不再手动填写。解析用「上传解析」开关控制。
- **AI 自动解析**：保存时如果没有手写解答、也没有解答图片，后台调用 AI 生成答案和完整解析；生成中、失败可在卡片上看到，可重试。
- **AI 图片 OCR**：题目没有文字时自动识别题目图片并保存识别结果；编辑器里也有「AI 识别图片」按钮。
- **直接问 AI**：每道题详情里有独立对话，会带上原题、OCR、已有解答和最近对话；对话保存在服务器。
- **复习时间线**：新题自动安排「明天」复习；每次复习按「忘记 / 模糊 / 掌握 / 熟练」安排下一次，详情里保留完整复习日志。
- **练习卷**：按当前筛选或勾选题目，一键生成 A4 练习卷；可含解答或不含解答，浏览器打印即可另存 PDF。
- **统计与足迹**：总题数、待复习、学科分布、连续记录天数、近 17 周学习热力图、知识点标签。
- **搜索与筛选**：全文搜索、学科、状态、待复习、标签、排序。
- **账号体系**：用户名 + 密码登录；注册需要管理员生成的一次性邀请码，每个账号有独立题库、复习记录、AI 对话和导出数据。
- **数据安全**：PBKDF2 密码哈希、30 天会话、CSRF、登录 / 注册限速；每日自动服务器备份；JSON 导入导出；图片上传校验与压缩。
- **移动端**：时间线、筛选抽屉、编辑表单、复习弹窗都适配手机。

## 线上使用

1. 打开 https://math.dogeeer.cn ，登录或注册。
2. 初始管理员账号是 `admin`，密码由服务器 `.env` 的 `MATH_ACCESS_CODE` 初始化（首次迁移后可在「设置 → 账号」修改）。普通用户注册需要邀请码；管理员在 `/admin` 的「邀请码」卡片生成。登录页点「获取邀请码」会显示微信 `k1696783681`。
3. 点「记录一道题」：只填学科、状态、原题（文字或图片）；需要手写解析时勾选「上传解析」，不勾选就由 AI 自动生成。
4. 第二天开始，侧栏「今日复习」会出现到期的题；点进去先回忆，再展开答案，选择掌握程度。
5. 想练手时，点右上「练习卷」或「选题」勾选后生成无解答练习卷。
6. 想启用 AI：管理员打开 https://math.dogeeer.cn/admin ，选择服务商预设（OpenAI / DeepSeek / OpenRouter / SiliconFlow / Moonshot / 自定义），填写 Base URL、模型和 API Key，先点「测试连接」，再保存。
7. 详情里的「直接问 AI」会打开独立对话窗口，可以连续追问，适合微信式的一问一答；长回答在窗口内滚动，不会挤坏详情页。

### 管理后台

`/admin` 现在是五个模块：

- **概览**：用户数、题目数、图片数、题库占用、数据盘剩余、AI 状态、可用邀请码。
- **AI 引擎**：模型连接、API Key、自动解析、用量与失败排查。
- **用户管理**：查看每个账号的题目数、图片数、AI 解析数、空间占用和最近活跃时间；点「查看题目」可以展开该用户的题目、图片和解析。
- **邀请码**：生成、复制、撤销一次性注册邀请码。
- **公告**：编辑首页弹窗公告和顶部横幅公告，两种形式可单独开启；修改后版本号变化，用户会重新看到。

用户管理是只读的，不会修改或删除用户数据。空间占用按每个用户实际引用的原图和缩略图统计；总占用与未关联图片也会在概览里显示。

### 直连入口

- 应用仍只监听 `127.0.0.1:8787`，由 Docker 容器 `math-direct` 中的 Caddy 提供 `https://dogeeer.cn:10000` TLS 入口。
- Caddy 使用 `/etc/nginx/ssl/cert.pem` 和 `cert.key`，容器重启策略为 `unless-stopped`。
- Cloudflare 在 `math.dogeeer.cn` 上创建了 302 Redirect Rule，跳转到 `https://dogeeer.cn:10000`，路径和查询参数保留。
- `math.dogeeer.cn` 已从 Cloudflare Tunnel 的 ingress 中移除；Tunnel 只保留 wish / bot / qq 等子域名。
- 证书文件更新后需要重启 `math-direct` 容器，让 Caddy 重新读取证书。

### 安全与 AI 额度

- 登录有按 IP 和用户名的失败次数限制；连续失败会短时锁定。
- 所有修改请求使用 CSRF token；会话 Cookie 为 HttpOnly、SameSite=Lax、Secure。
- 响应带 CSP、HSTS、X-Frame-Options、nosniff、Referrer-Policy 等安全头。
- 上传图片限制大小和像素，防止超大图/解压炸弹。
- AI 调用按用户记录到 `ai_usage`，默认限制：过去 24 小时 **80 次**、最近 1 小时 **30 次**、两次请求至少间隔 **3 秒**。
- 管理员可在 `/admin` 的 AI 引擎里调整额度；`0` 表示不限制。
- 单次输出 token 上限 4096；题干、OCR 文本、对话历史和追问内容都会截断，避免超长 prompt 消耗。
- 自动解析、手动解析、OCR、追问都会走同一套额度；额度用完时不会浪费一次模型请求。

### AI 自动解析规则

- 保存时「上传解析」留空（不勾选），或勾选但没有手写解答 / 解答图片时，会自动生成解析。
- 只有「没有手写解答、没有解答图片」的题才会自动生成；手写了解答或上传了解答图片时不会调用 AI。
- 第一次在管理页保存并启用 AI 时，会自动重试最近 10 道尚未解析的题（包括已经上传但当时还没配置 AI 的题）。
- 题目没有文字、只有图片时，会先尝试 OCR；OCR 结果同时保存到 `ocr_text`，并填入题目（仅当题目为空）。
- AI 解析结果单独保存在 `ai_answer` / `ai_solution`，不会覆盖你手写的答案和解答；详情里会标记「AI」。
- 每道题的追问保存在 `ai_messages`，可单独清空。
- API Key 保存在服务器 `DATA_DIR/ai_key`（权限 600），不返回给浏览器，也不会进 JSON 导出。也可以用环境变量 `MATH_AI_API_KEY` 注入（环境变量优先）。
- 支持任意 OpenAI 兼容的 `/chat/completions` 接口；视觉模型用于 OCR，若服务商不支持视觉，文字题仍可正常解析。

### 公式写法

- 行内：`$a^2+b^2=c^2$`
- 独立一行：`$$\int_0^1 x^2\,dx=\frac13$$`
- 矩阵：`$$\begin{pmatrix}a&b\\c&d\end{pmatrix}$$`
- 编辑器上方有快捷按钮，也可以直接粘贴题目截图。

## 服务器部署

项目在服务器上的目录：`/home/dogeeer/math-notes`。  
进程：Waitress，监听 `127.0.0.1:8787`，由 Cloudflare Tunnel 暴露到 `math.dogeeer.cn`。

```bash
cd /home/dogeeer/math-notes
./start.sh          # 启动
./stop.sh           # 停止
./backup.sh         # 立即备份（数据库 + 图片）
tail -f logs/app.log
```

- 图片、数据库、备份都放在 23T 数据盘的 `MATH_DATA_DIR`，不写系统盘：
  `/media/dogeeer/5ce3aa76-1cbb-468f-ae81-9945ec0fc3aa1/filedist/math-notes-data`
- `start.sh` 会检查 `MATH_DATA_DIR` 与 `/` 是否同一块磁盘；如果数据盘没挂载，会拒绝启动而不是把图片写进系统盘。
- 开机自启和每日 03:30 备份已写入 `crontab -l`。
- 备份在 `DATA_DIR/backups/`，保留最近 20 个 zip；每个 zip 含 `math.db` 与 `uploads/`。
- 密码重置（管理员）：

```bash
cd /home/dogeeer/math-notes
.venv/bin/python app.py reset-password admin '新的密码'
```

- `.env` 里的 `MATH_ACCESS_CODE` 只在**第一次创建管理员**时作为初始密码；之后修改 `.env` 不会覆盖数据库里的密码，请用上面的 `reset-password`。
- 邀请码是一次性的，保存在 `invite_codes` 表；管理员可在 `/admin` 生成、复制、撤销未使用的邀请码。注册成功后邀请码标记为已使用，不能重复使用。

### 首次安装 / 重装

```bash
cd /home/dogeeer/math-notes
cp .env.example .env
# 编辑 .env，设置 MATH_ACCESS_CODE 和 MATH_DATA_DIR（23T 数据盘）
chmod 600 .env
./install.sh
./start.sh
```

### Cloudflare Tunnel

`~/.cloudflared/config.yml` 已加入：

```yaml
  - hostname: math.dogeeer.cn
    service: http://127.0.0.1:8787
```

DNS 记录：`math.dogeeer.cn` CNAME → `ea8a56a0-7b6e-4f97-88b9-f86ba6a15fb2.cfargotunnel.com`。  
改完配置后重启 cloudflared：

```bash
pkill -TERM -x cloudflared
nohup /usr/local/bin/cloudflared tunnel --config /home/dogeeer/.cloudflared/config.yml run dogeeer-wish >> /home/dogeeer/.cloudflared/tunnel.log 2>&1 &
```

## 本地开发

```bash
cd math-notes
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
MATH_COOKIE_SECURE=0 MATH_ACCESS_CODE=test1234 .venv/bin/python app.py run --port 8787
```

打开 `http://127.0.0.1:8787`。生产环境通过 HTTPS 访问，`.env` 里保持 `MATH_COOKIE_SECURE=1`。

## 目录

```
app.py              Flask 应用、API、AI 代理、鉴权、上传、备份
serve.py            Waitress 生产入口（信任本地 Cloudflare Tunnel 的转发头）
schema.sql          SQLite 表结构
templates/          login / index / admin / print / 错误页
static/css/         app.css 基础组件 + minimal.css 浅色界面 + print.css
static/js/          时间线、编辑器、复习、设置、AI 管理、登录注册、打印
static/vendor/      KaTeX（本地托管，不依赖 CDN）
DATA_DIR/math.db        SQLite 数据库（不随代码发布）
DATA_DIR/uploads/       题目/解答图片
DATA_DIR/backups/       自动与手动备份
start.sh stop.sh backup.sh watchdog.sh install.sh
```

## 数据说明

- 所有内容保存在自己的服务器上，不经过第三方 SaaS。
- JSON 导出包含全部题目、解答和复习记录；服务器备份还包含图片。
- 导入采用「合并」策略：相同 ID 跳过，不会覆盖已有题目。
- 删除题目会同时删除它的本地图片，无法撤销；建议保留每日备份或先导出 JSON。
