"""Build the reviewed eight-page Chinese competition introduction PDF."""
from pathlib import Path
import argparse
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor,Color,white
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph,Table,TableStyle
from reportlab.lib.utils import ImageReader

ROOT=Path(__file__).resolve().parents[1]
pdfmetrics.registerFont(TTFont('YaHei','C:/Windows/Fonts/msyh.ttc',subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiBold','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
pdfmetrics.registerFontFamily('YaHei',normal='YaHei',bold='YaHeiBold',italic='YaHei',boldItalic='YaHeiBold')
W,H=595.2756,841.8898; M=44; CW=W-2*M
INK=HexColor('#17324f');BLUE=HexColor('#2476dc');MUTED=HexColor('#61758b');LINE=HexColor('#dce7f2');PALE=HexColor('#edf5ff')
screens=ROOT/'demo/screens'
screens=(screens if screens.exists() else ROOT.parents[0]/'work/math-notes/preview-data')
ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True);ap.add_argument('--screens',type=Path);args=ap.parse_args()
if args.screens:screens=args.screens
args.output.parent.mkdir(parents=True,exist_ok=True)
c=canvas.Canvas(str(args.output),pagesize=(W,H),pageCompression=1)
c.setTitle('数学错题本 - 参赛作品介绍');c.setAuthor('数学错题本');c.setSubject('项目详情、使用方式、亮点、AI测试落地、关键技术、界面图片与发表情况')
page=0

def txt(x,y,s,size=11,color=INK,bold=False):
    c.setFont('YaHeiBold' if bold else 'YaHei',size);c.setFillColor(color);c.drawString(x,y,s)
def para(s,x,y,width=CW,size=10.5,leading=18,color=INK,bold=False):
    style=ParagraphStyle('p',fontName='YaHeiBold' if bold else 'YaHei',fontSize=size,leading=leading,textColor=color,wordWrap='CJK',spaceAfter=0)
    p=Paragraph(s,style);_,height=p.wrap(width,1000)
    assert y-height>42,f'Paragraph overflow on page {page}: {s[:25]}'
    p.drawOn(c,x,y-height);return y-height
def box(x,y,w,h,fill=PALE,stroke=None,radius=9):
    c.setFillColor(fill);c.setStrokeColor(stroke or fill);c.roundRect(x,y,w,h,radius,stroke=bool(stroke),fill=1)
def base(title,section):
    global page
    page+=1;c.setFillColor(white);c.rect(0,0,W,H,stroke=0,fill=1)
    txt(M,H-38,'数学错题本  /  Math Notes',9,BLUE,True)
    txt(W-M-92,H-38,'参赛作品介绍',9,MUTED)
    c.setStrokeColor(LINE);c.line(M,H-51,W-M,H-51)
    txt(M,H-86,section,9,BLUE,True)
    txt(M,H-119,title,25,INK,True)
    c.setStrokeColor(LINE);c.line(M,44,W-M,44)
    txt(M,28,'math.dogeeer.cn  |  应用版本 v2.2.0',8,MUTED)
    txt(W-M-40,28,f'{page:02d} / 08',8,MUTED)
    return H-145
def end():c.showPage()
def h2(s,y):txt(M,y,s,14,BLUE,True);return y-15
def table(headers,rows,y,widths=None,size=9.5):
    style=ParagraphStyle('cell',fontName='YaHei',fontSize=size,leading=15,textColor=INK,wordWrap='CJK')
    data=[[Paragraph(str(v),style) for v in headers]]+[[Paragraph(str(v),style) for v in row] for row in rows]
    t=Table(data,colWidths=widths or [CW/len(headers)]*len(headers),hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor('#dfeeff')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,0),(-1,-1),.5,LINE),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,HexColor('#f7faff')])]))
    _,height=t.wrap(CW,900);assert y-height>50,f'Table overflow page {page}'
    t.drawOn(c,M,y-height);return y-height
def image(name,x,y,w,h):
    p=screens/(name+'.png');assert p.exists(),p
    from PIL import Image
    im=Image.open(p).convert('RGB');im=im.crop((0,0,im.width-15,im.height))
    iw,ih=im.size;scale=min(w/iw,h/ih);dw,dh=iw*scale,ih*scale
    box(x-4,y-4,w+8,h+8,HexColor('#f7faff'),LINE,10)
    c.drawImage(ImageReader(im),x+(w-dw)/2,y+(h-dh)/2,dw,dh)
def account(y,compact=False):
    height=76 if compact else 96
    box(M,y-height,CW,height,PALE)
    txt(M+15,y-24,'在线体验  math.dogeeer.cn',15,BLUE,True)
    c.linkURL('https://math.dogeeer.cn',(M+15,y-32,W-M-15,y-9),relative=0,thickness=0)
    txt(M+15,y-47,'测试账号：test     密码：12345678',11,INK,True)
    if not compact:txt(M+15,y-70,'已准备 16 道题及关联图片、解析、复习记录和 AI 对话。',9,MUTED)
    return y-height

# 1. Cover
y=base('数学错题本','作品概况  /  PROJECT OVERVIEW')
txt(M,y-10,'从一道错题，到一次真正的复习',18,BLUE,True)
y=para('面向自主学习的轻量 Web 系统，将文字题目、题图、解析、知识点与复习反馈收进个人题库，在手机上完成记录、练习、复盘与学习情况查看。',M,y-31,CW,11,20)-18
for i,(label,value) in enumerate([('应用形态','手机 / 桌面 Web'),('核心对象','错题与难题学习'),('实现状态','已部署，可在线体验')]):
    x=M+i*174;txt(x,y,label,8.5,MUTED);txt(x,y-20,value,10,INK,True)
image('03-home',94,205,166,374);image('24-learning-top',335,205,166,374)
txt(104,184,'图 1  题目概述时间线',9,MUTED);txt(346,184,'图 2  学习状况概览',9,MUTED)
account(158)
end()

# 2. Details and use
y=base('项目详情及使用方式','01  /  项目详情与操作')
y=para('作品面向需要长期整理错题、重复练习和追踪薄弱知识点的学习者。目前预设数学分析与线性代数目录，也支持按账号新增其他科目。底部导航为“错题本、复习、记一题、学习状况、我的”。',M,y)-17
y=table(['功能模块','可使用的功能'],[
('记录与整理','文字 / 公式录题、图片上传、裁剪旋转、OCR、极简标题、章节与知识点归类。'),
('题库与检索','概述题卡展开收起、详情、编辑、删除、星标，以及全文、科目、状态、标签筛选。'),
('练习与复习','隐藏解答自测、点击对答案、单题或到期复习、四档掌握反馈、备注及下次复习安排。'),
('学习与管理','饼图、柱图、热力图、知识点掌握；科目新增 / 改名、JSON 导入导出、练习卷和备份。')],y,[90,CW-90])-22
y=h2('建议体验步骤',y)
steps=[('登录与浏览','打开 math.dogeeer.cn，使用 test / 12345678 登录。先查看已有题目，再点击卡片展开与收起。'),('记录一道题','点击底栏中间“记一题”，输入文字或上传图片。图片可裁剪旋转；已有解析可一并填写或上传。'),('练习与复习','切换“自己练习”隐藏解答，准备好后对答案；在题目详情进入复习，记录掌握程度与备注。'),('查看与调整','在“学习状况”查看图表和知识点；在“我的”新增 / 编辑科目。需要时搜索题目或选题生成练习卷。')]
for i,(title,body) in enumerate(steps,1):
    txt(M,y-15,f'{i:02d}',12,BLUE,True);y=para('<b>'+title+'</b>　'+body,M+33,y,CW-33,10,17)-12
y=para('测试号为普通用户，学习数据与原账号独立。管理后台的模型、用户、邀请码和公告模块由管理员维护，相关界面在本介绍中展示。',M,y-2,CW,9,16,MUTED)
end()

# 3. Highlights
y=base('项目亮点','02  /  设计与使用价值')
y=para('作品将“收集错题”进一步延伸为可执行的学习过程。亮点体现在流程衔接、内容保留、数据依据和手机端操作。',M,y,CW,11,19)-22
cards=[('学习流程贯通','记录、归类、自测、复习与学习反馈相互关联。知识点可直接跳回相关题目，便于将薄弱项转成下一次练习。'),('保留原有解题思路','有自己的文字解析或解析图片时，AI 仅识别题干并归类；没有自带解析时才生成参考解答，保留原图和用户内容。'),('统计有实际依据','知识点掌握度来自题目状态和复习评分，并显示有评估记录的覆盖情况；学习图表反映题库中的实际记录。'),('手机操作更轻便','“记一题”位于底栏中间；首页默认小卡片，长题按需展开；全屏弹窗、软键盘和安全区适配常用手机操作。'),('科目可随学习调整','内部科目 ID 与显示名称分离。用户可新增、改名，已有题目、筛选和学习统计同步显示，复习历史继续保留。'),('轻量、自托管、可维护','使用 Flask、SQLite 和原生前端，公式资源本地托管；支持数据备份、隔离测试、Git 追溯与可配置 AI 服务。')]
cw=(CW-16)/2; top=y
for i,(title,body) in enumerate(cards):
    x=M+(i%2)*(cw+16);yy=top-(i//2)*140
    box(x,yy-126,cw,126,HexColor('#f3f8ff'),LINE)
    txt(x+14,yy-27,title,12,BLUE,True)
    para(body,x+14,yy-42,cw-28,9.7,16)
y=top-438
txt(M,y,'记录  →  识别归类  →  自测练习  →  复习反馈  →  查看薄弱项',11,BLUE,True)
para('设计目标是减少整理和查找的重复劳动，帮助学习者形成持续复盘的习惯；不以图表分数替代真实考试成绩。',M,y-19,CW,10,18)
end()

# 4. AI and testing
y=base('AI 测试技术的落地使用','03  /  AI 能力与测试实践')
y=h2('AI 在真实业务中的使用',y)
y=table(['场景','实际落地方式'],[
('图片识别','通过可配置的视觉模型转写题干、条件与公式，保存 OCR 文本并保留原图。'),
('自动整理','保存题目后后台处理，提取极简标题、章节及 1-4 个知识点，用于检索和学习统计。'),
('解析与追问','未提供解析时生成参考答案与步骤；已有解析只做识别归类。追问携带原题、已有解答与历史消息。')],y,[82,CW-82])-20
y=h2('围绕 AI 行为进行可验证的测试',y)
y=para('研发中使用 AI 辅助代码编写与测试用例设计；是否正确仍由脚本、接口与实际页面验证。测试重点覆盖模型输出的结构、业务规则、任务一致性与权限，而不是只检查“是否有一段回答”。',M,y,CW,10,17)-12
y=table(['测试层次','落地内容与结果'],[
('规则与隔离测试','使用临时数据库和模型调用替身，验证自带解析不生成新答案、图片 OCR、字段完整性、重试与额度、过期任务不覆盖新编辑。'),
('接口与数据测试','科目、归属隔离、导入导出、数据库迁移、登录 / CSRF、练习隐藏解答与复习。已有科目 6 项、学习与 AI 策略 13 项检查通过。'),
('真实调用与交互','曾用文字题、图片题、自带解析题抽样验证已配置服务；另做手机录题、裁剪、筛选、图表与科目操作检查。')],y,[82,CW-82],9.1)-17
y=para('另新增 3 项评审数据复制检查，验证原内容保留、图片隔离与不覆盖已有目标题库。评审账号已完成登录、图片访问和管理员权限拒绝检查。',M,y,CW,9.6,17)-12
box(M,y-65,CW,65,PALE)
para('<b>说明：</b>本项目调用外部可配置模型，未自行训练 OCR 或大语言模型。视频采用预置演示结果；在线真实 AI 效果与速度取决于服务与额度，识别及参考解析应核对。未宣称标准测试集准确率或学习效果提升比例。',M+12,y-10,CW-24,9,15,MUTED)
end()

# 5. Technologies
y=base('项目涉及的关键技术','04  /  架构、数据与可靠性')
layers=[('手机 / 桌面浏览器','原生 JavaScript · 响应式 CSS · Canvas 图片编辑 · KaTeX 公式'),('Flask / Waitress 应用','账号与权限 · 题库 / 附件 / 复习 · 同源 JSON 接口 · 学习汇总'),('AI 后台队列与服务适配','结构化 JSON · 并发限制 · 任务令牌 · 重试 / 额度 · 文本与视觉模型'),('SQLite 与文件存储','用户隔离 · 复习 / 对话 / 科目 · 本地图片 · 备份与事务迁移')]
for title,desc in layers:
    box(M,y-53,CW,53,PALE,LINE)
    txt(M+13,y-21,title,11,BLUE,True);txt(M+13,y-40,desc,8.7,MUTED)
    y-=66
y-=5
y=table(['关键技术','作用'],[
('Flask + 原生前端','后端提供接口、鉴权与数据操作；前端负责题卡、编辑器、练习、复习、图表和管理界面。'),
('Canvas + Pillow + KaTeX','浏览器裁剪旋转，服务端验证与压缩图片；LaTeX 公式在浏览器中本地渲染。'),
('SQLite 与事务','题目、复习、对话和科目存储；科目升级保留索引与关联记录，并检查外键。'),
('任务令牌与结构化输出','防止旧任务覆盖新编辑，验证识别 / 解析结果字段，显示处理与失败状态并允许重试。'),
('权限与数据保护','PBKDF2 密码哈希、会话、CSRF、用户归属校验、图片限制、AI 凭据服务端保存。')],y,[116,CW-116],9.3)-18
para('工程交付：源码与 Git 历史可追溯，提供评审启动器和自动检查脚本。真实用户数据、环境密钥与证书不进入参赛源码包；第三方组件声明与许可文件随包保留。',M,y,CW,9.7,17)
end()

# 6. Screens, collection
y=base('界面展示：记录、识别与复习','05  /  项目相关图片 · 图 3-5')
y=para('以下为实际系统界面的手机截图，使用合成示例题目。截图展示功能与操作布局，不表示模型实时响应速度。',M,y,CW,10,17)-18
names=[('11-image-upload','图 3  图片录题','支持题图上传，录入时即可整理图片；文字与公式也可直接输入。'),('12-crop-before','图 4  裁剪与旋转','按题目区域调整选区，支持左右旋转、重置和取消，应用后随题目保存。'),('20-review-answer','图 5  复习与掌握反馈','先回忆再看解析，按四档评价记录掌握情况，可填写备注。')]
iw=146; gap=(CW-3*iw)/2
for i,(name,title,body) in enumerate(names):
    x=M+i*(iw+gap);image(name,x,244,iw,329)
    txt(x,222,title,10,BLUE,True);para(body,x,204,iw,9.2,16)
box(M,76,CW,75,PALE)
para('<b>内容保留原则：</b>题图、识别文字与用户解析共同留档。已有解析的题目只自动识别归类，题目详情也支持继续追问与查看复习记录。',M+14,134,CW-28,10,18)
end()

# 7. Screens, learning
y=base('界面展示：学习状况与科目','06  /  项目相关图片 · 图 6-8')
y=para('学习状况集中展示当前题库的记录情况；科目管理服务于录题、筛选与统计，使用同一套科目定义。',M,y,CW,10,17)-18
names=[('24-learning-top','图 6  掌握分布','题量、已掌握、待复习和知识点概览；饼图显示题目状态分布。'),('26-learning-heatmap','图 7  足迹与知识点','热力图查看逐日活动；知识点列表显示评估情况并可进入相关题目。'),('30-subject-added','图 8  自定义科目','科目按账号保存。新增或编辑名称后，相关入口同步更新。')]
for i,(name,title,body) in enumerate(names):
    x=M+i*(iw+gap);image(name,x,244,iw,329)
    txt(x,222,title,10,BLUE,True);para(body,x,204,iw,9.2,16)
box(M,76,CW,75,PALE)
para('<b>统计口径：</b>近两周柱状图统计录题和复习次数，热力图展示近 17 周活动；掌握度来自题目状态与最新复习评分，未评估内容有明确标记。',M+14,134,CW-28,10,18)
end()

# 8. Publication and provenance, explicit user declarations
y=base('发表情况、获奖与项目基础','07  /  声明及评审入口')
items=[('此前发表 / 宣传情况','本项目曾在微信朋友圈进行宣传与展示。'),('此前获奖情况','截至本次参赛材料整理，项目尚未获奖。'),('是否基于其他项目优化','无。本作品为独立建设的项目，不属于在其他项目基础上优化后提交的作品。'),('通用组件与 AI 使用','实现中使用 Flask、Waitress、Pillow、KaTeX 等通用组件，并接入可配置 AI 服务；研发中使用 AI 辅助编码与测试设计。相应依赖、测试与能力边界已在前文说明。')]
for title,body in items:
    txt(M,y-9,title,12,BLUE,True);y=para(body,M,y-24,CW,10.5,19)-24
y=h2('评审可直接在线体验',y)
y=account(y-3)-18
y=para('测试账号已复制项目原有的 16 道题及关联学习资料，题目、图片与记录独立保存。评审可浏览、搜索、展开题卡、查看学习状况并进行普通用户功能体验。管理后台界面可结合演示视频与源码说明了解。',M,y,CW,10,18)-16
y=para('交付材料包括：完整应用源码与 Git 仓库、部署及验证文档、156 秒手机端功能演示、界面图片、海报和配乐。参赛源码包保留版本记录，线上体验数据单独存放。',M,y,CW,10,18)-16
para('资料来源：本项目源码、自动检查记录、界面截图及项目提交者确认的信息。图 1-8 为系统界面截图，题目与统计采用示例数据；测试账号为普通评审账号。',M,y,CW,8.7,15,MUTED)
end();c.save()
print(str(args.output))
