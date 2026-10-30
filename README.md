# 数学错题本 · math-notes

### 2.0.1 · 2026-10-27

- 自动解析使用结构化 JSON 输出；当前 DeepSeek 模型使用 low 思考强度，输出预算设置为 4096，避免复杂旧题只产生思考内容而没有最终解析。空输出或不完整结果会自动重试一次，并正常计入原有额度。
- 发布后 18 道旧题均完成分类，17 道图片题均完成 OCR；用户数据和旧代码备份保留。

### 2.0.0 · 2026-10-27

- 手机底栏改为「错题本 / 复习 / 记一题 / 学习状况 / 我的」，记一题固定在中间。
- `/learning` 学习状况页：掌握分布饼图、近两周录题/复习柱状图、17 周热力图、知识点掌握列表、学科与搜索筛选；点知识点进入对应题目。
- 掌握度取最新复习评分和用户标记，显示评估覆盖数量，未评估不显示虚构分数。AI 只负责解题与归类。
- 新录入文字题、图片题均自动 AI 处理，不因手写解析而跳过。图片在同一次视觉请求中转写题干、解题并归类，生成极简知识点标题、课程章节和 1–4 个知识点标签。
- AI 队列最多两个并发任务，用任务令牌防止旧结果覆盖新编辑。失败保留题目并允许重试；模型/额度配置保留管理员控制。
- 发布时可用 `MATH_ENRICH_EXISTING=1 ./start.sh` 对最多 50 道旧题补分类；平时重启只恢复被中断的任务。遵守原有用户额度，不自动扩大额度。
- 验证：`python tests/test_learning.py`，`python check_release.py`，`node tests/image-editor.test.cjs`。`tests/check_configured_ai.py` 仅用两道合成示例和独立临时数据库验证已配置服务。

### 1.9.0 · 2026-10-27

- 题目和解析的图片缩略图新增「裁剪 / 旋转」，新上传和已有图片均可编辑。
- 拖动四角改变裁剪范围，拖动中间移动选区；支持左右 90° 旋转、重置和取消。手机返回键先关闭图片编辑。
- 「应用修改」只更新当前表单，点击「保存题目 / 保存修改」后才会上传保存；取消不修改已保存图片。
- 图片在浏览器本地处理；键盘方向键可移动 / 调整选区，Shift + 方向键按 1 像素精调。
- 修复「上传解析」开关的透明输入框覆盖保存按钮的问题。
- 裁剪几何回归：`node tests/image-editor.test.cjs`；接口与页面资源回归：`.venv/bin/python check_release.py`，使用隔离的临时数据库。

### 1.8.2 · 2026-10-27

- 按偏好改为浅蓝色主题：浅蓝标题区、蓝色主按钮与选中态；同步替换侧栏、解析、热力图和登录页的绿色。
- 保留暖黄色复习入口与学科区分，本次不新增功能。

### 1.8.1 · 2026-10-27

- 提高正文与背景对比，使用明亮的翠绿、白色和冷白底色。
- 首页增加鲜绿色标题区与暖黄色复习按钮；数学分析、线性代数分别使用绿、蓝标记。
- 同步调整手机首页、底栏、题目卡片、解析区和登录页的色彩。

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
- **简洁录入**：只选学科 / 状态，贴原题或图片；标题、章节、标签由系统自动整理，不再手动填写。AI 解析固定自动运行；可以另外补充自己的解析。
- **AI 自动解析**：文字题、图片题保存后都自动识别、解题并整理知识点，不因手写解答而跳过；处理中、失败和重试状态均可见。
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
3. 点「记录一道题」：只填学科、状态、原题（文字或图片）；需要时可勾选「补充自己的解析」；无论是否补充，都会自动 AI 解析。
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

- 题目文字或图片保存后，后台自动解析，用户无需也不能选择关闭这一步。
- 图片在视觉请求中自动转写到 `ocr_text`；原题没有文字时，同时填入 `problem`。有补充文字时保留补充文字，识别结果另存。
- 同一结果生成极简知识点标题、课程章节和 1–4 个知识点标签。知识点用于 `/learning` 统计和筛选。
- 手写答案、解析或解析图片是补充，不会跳过自动解析；AI 答案和解析独立保存，不覆盖手写内容。
- 后台最多两个并发任务；每次修改题干会生成新任务令牌，旧任务结果不能覆盖新编辑。重启后恢复中断任务。
- 服务不可用、额度不足或解析失败时保留原题并显示原因，允许重试；不扩大原有调用次数限制。
- 掌握度使用最新复习评分和手动状态，不由 AI 猜测；计算规则可在学习状况页展开查看。
- API Key 保存在服务器 `DATA_DIR/ai_key`（权限 600），不返回浏览器，不进入 JSON 导出；也可通过 `MATH_AI_API_KEY` 环境变量注入。
- 当前 DeepSeek 请求参数依据[官方接口文档](https://api-docs.deepseek.com/guides/thinking_mode/)。

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
