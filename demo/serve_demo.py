"""Isolated promotional demo. No production data, API keys or network AI calls."""
import os, sys, json, uuid, time, io, base64
from pathlib import Path
from datetime import timedelta
ROOT=Path(__file__).resolve().parents[1]
DATA=Path(__file__).parent/'render-data'
os.environ.update(MATH_DATA_DIR=str(DATA),MATH_COOKIE_SECURE='0',MATH_ADMIN_USER='demo',MATH_ADMIN_PASSWORD='Demo-video-2026',MATH_AI_API_KEY='demo-only-not-a-real-key')
sys.path.insert(0,str(ROOT))
import app as a
from PIL import Image, ImageDraw, ImageFont

# This fixture is a demonstration adapter, never imported by the real app.
problem=r'求极限：$\displaystyle\lim_{x\to0}\frac{\sin x-x\cos x}{x^3}$。'
solution=r'由泰勒公式：$\sin x=x-\frac{x^3}{6}+o(x^3)$，$x\cos x=x-\frac{x^3}{2}+o(x^3)$。相减得 $\frac{x^3}{3}+o(x^3)$，故原极限为 $\boxed{\frac13}$。'
def demo_ai(config,messages,model=None):
    time.sleep(0.7)
    text=json.dumps(messages,ensure_ascii=False)
    if config.get('structured_output'):
        result={'title':'泰勒展开求极限','chapter':'一元函数微分学','knowledge_points':['泰勒公式','等价无穷小'],'ocr_text':problem,'answer':r'$\frac13$','solution':solution}
        if '禁止解题' in text: result.pop('answer'); result.pop('solution')
        return json.dumps(result,ensure_ascii=False),'demo-preview',{}
    if '只' in text and 'OCR' in text: return problem,'demo-preview',{}
    return r'这里不能直接把两项分别替换为 $x$，因为首阶项相减后恰好抵消。需要保留三阶项：$$\sin x-x\cos x=\frac{x^3}{3}+o(x^3).$$因此用三阶泰勒展开更合适。你可以先比较两项的最低阶，再决定展开到哪一阶。','demo-preview',{}
a.call_ai=demo_ai
db=a.connect_db(); uid=db.execute("SELECT id FROM users WHERE username='demo'").fetchone()[0]
for key,value in [('ai_enabled','1'),('ai_model','demo-preview'),('ai_daily_limit','500'),('ai_hourly_limit','500'),('ai_min_interval','0')]: a.set_setting(db,key,value)
if not db.execute('SELECT count(*) FROM entries').fetchone()[0]:
    fixtures=[('analysis','泰勒展开求极限',problem,solution,'一元函数微分学',['泰勒公式','等价无穷小']),
              ('linear','矩阵的秩与线性相关',r'设 $A^2=A$，证明 $r(A)+r(I-A)=n$。',r'由 $A(I-A)=0$，结合像空间的直和分解，可得 $r(A)+r(I-A)=n$。','矩阵',['矩阵的秩','线性相关性']),
              ('analysis','分部积分的选择',r'求 $\int x\ln x\,dx$。',r'取 $u=\ln x$，$dv=x\,dx$，得 $\frac{x^2}{2}\ln x-\frac{x^2}{4}+C$。','一元函数积分学',['分部积分法']),
              ('analysis','导数与单调区间',r'讨论函数 $f(x)=x^3-3x$ 的单调性。',r'$f\prime(x)=3x^2-3$，据导数符号可判断单调区间。','一元函数微分学',['单调性与极值']),
              ('linear','齐次方程组基础解系',r'求齐次方程组 $Ax=0$ 的基础解系。',r'对系数矩阵做初等行变换，确定自由变量，再写出基础解系。','线性方程组',['高斯消元法','解的结构']),
              ('analysis','幂级数收敛半径',r'求幂级数 $\sum_{n=1}^{\infty}x^n/n$ 的收敛区间。',r'比值法得到半径为 $1$，并分别讨论端点。','无穷级数',['幂级数'])]
    for i in range(36):
        subject,title,p,s,c,tags=fixtures[i%len(fixtures)]; status=['wrong','reviewing','mastered','unsolved','mastered','reviewing'][i%6]
        day=a.today_local()-timedelta(days=i//2);stamp=day.isoformat()+'T09:30:00Z'; eid=uuid.uuid4().hex
        db.execute('INSERT INTO entries(id,user_id,subject,status,title,problem,solution,chapter,tags,occurred_at,created_at,updated_at,next_review_at,ai_status,ai_metadata_version,starred) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(eid,uid,subject,status,title,p,s,c,json.dumps(tags,ensure_ascii=False),str(day),stamp,stamp,None if status=='mastered' else str(a.today_local()),'done',1,int(i%7==0)))
        if i%5:
            result=['again','hard','easy','good'][i%4]
            db.execute('INSERT INTO reviews(id,entry_id,reviewed_at,result,interval_days) VALUES(?,?,?,?,?)',(uuid.uuid4().hex,eid,stamp,result,3))
    db.commit()
db.commit();db.close()
DATA.mkdir(exist_ok=True)
im=Image.new('RGB',(1050,620),'#fffdf9'); d=ImageDraw.Draw(im)
font=lambda n:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',n)
d.text((70,55),'数学分析 · 每日一题',font=font(44),fill='#233a55')
d.line((70,125,980,125),fill='#b7cce5',width=3)
d.text((70,180),'用泰勒公式求下列极限：',font=font(40),fill='#27394a')
d.text((100,290),'lim   (sin x − x cos x) / x³',font=font(52),fill='#122b48')
d.text((105,360),'x → 0',font=font(32),fill='#536e8a')
d.text((70,500),'提示：注意分子中首阶项的抵消。',font=font(30),fill='#657b91')
im.save(DATA/'demo-question.png')
a.app.run(host='127.0.0.1',port=8879,threaded=True)
