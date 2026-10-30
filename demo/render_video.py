"""Render a smooth 1080x1920 60 fps product film + original instrumental soundtrack.
UI assets are captures of the isolated demo, not fabricated app screens.
Requires Pillow, numpy, imageio-ffmpeg. No external music or media downloads.
"""
import argparse, json, math, subprocess, wave, sys, time
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

HERE=Path(__file__).resolve().parent
OUT=HERE.parents[1]/'outputs'
OUT.mkdir(exist_ok=True)
CACHE=HERE/'render-cache';CACHE.mkdir(exist_ok=True)
W,H,FPS=1080,1920,60
BLUE='#2476dc';INK='#102c4b';MUTED='#5b7390'
scenes=json.loads((HERE/'storyboard.json').read_text(encoding='utf-8'))
DURATION=sum(s['duration'] for s in scenes)

@lru_cache(None)
def font(n,bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc',n)
def text(draw,xy,s,n=32,fill=INK,bold=False): draw.text(xy,s,font=font(n,bold),fill=fill,stroke_width=0)
def wrap(s,n,width):
    lines=['']
    for ch in s:
        if font(n).getlength(lines[-1]+ch)>width: lines.append(ch)
        else: lines[-1]+=ch
    return lines
def ease(t):
    t=max(0,min(1,t));return t*t*t*(t*(t*6-15)+10)

@lru_cache(None)
def screen(name):
    raw=Image.open(HERE/'screens'/(name+'.png')).convert('RGB')
    # The browser's 15 px scrollbar is outside the responsive app client area.
    raw=raw.crop((0,0,raw.width-15,raw.height))
    return raw.resize((600,1350),Image.Resampling.LANCZOS)

mask=Image.new('L',(636,1430));md=ImageDraw.Draw(mask);md.rounded_rectangle((0,0,635,1429),radius=62,fill=255)
smask=Image.new('L',(600,1350));ImageDraw.Draw(smask).rounded_rectangle((0,0,599,1349),radius=18,fill=255)
body=Image.new('RGB',(636,1430),'#142c48');bd=ImageDraw.Draw(body)
bd.rounded_rectangle((2,2,633,1427),radius=61,outline='#476789',width=3)
bd.rounded_rectangle((9,9,626,1420),radius=55,fill='#fbfdff')
text(bd,(32,14),'9:41',18,bold=True);bd.rounded_rectangle((258,15,378,38),radius=11,fill='#132941')
for i in range(4): bd.rounded_rectangle((534+i*7,33-i*4,538+i*7,36),radius=1,fill='#243b52')
bd.rounded_rectangle((575,20,608,34),radius=4,outline='#243b52',width=2)
bd.rectangle((579,23,602,31),fill='#243b52')
bd.rounded_rectangle((230,1410,405,1416),radius=3,fill='#243b52')
shadow=Image.new('RGBA',(720,1510));sh=ImageDraw.Draw(shadow)
sh.rounded_rectangle((32,30,672,1460),radius=72,fill=(27,70,124,29))
shadow=shadow.filter(ImageFilter.GaussianBlur(18))

@lru_cache(None)
def phone(name):
    im=body.copy();im.paste(screen(name),(18,51),smask);return im

SCROLL={('24-learning-top','25-learning-bars'):528,('25-learning-bars','26-learning-heatmap'):528,('26-learning-heatmap','27-learning-topics'):446}
@lru_cache(None)
def scroll_asset(a,b):
    offset=round(SCROLL[(a,b)]*1.6)
    aa,bb=screen(a),screen(b)
    stitched=Image.new('RGB',(600,1136+offset),'white')
    stitched.paste(aa.crop((0,90,600,1226)),(0,0))
    stitched.paste(bb.crop((0,90,600,1226)),(0,offset))
    return stitched,offset

def scrolling_phone(a,b,p):
    long,offset=scroll_asset(a,b);pos=round(offset*ease(p))
    visible=screen(a).copy();visible.paste(long.crop((0,pos,600,pos+1136)),(0,90))
    result=body.copy();result.paste(visible,(18,51),smask);return result

@lru_cache(None)
def base_scene(index):
    s=scenes[index]
    # A restrained pale-blue paper background, with crisp typography and a few grid accents.
    arr=np.empty((H,W,3),dtype=np.uint8)
    for y in range(H):
        t=y/H;arr[y,:,:]=[int(245-11*t),int(249-5*t),int(255-2*t)]
    im=Image.fromarray(arr);d=ImageDraw.Draw(im)
    d.ellipse((650,510,1370,1230),outline='#dceafb',width=2)
    d.ellipse((-440,960,470,1870),outline='#dfecfb',width=2)
    for x in range(80,1050,72):
        for y in range(445,1840,72):d.ellipse((x,y,x+2,y+2),fill='#d9e7f8')
    d.rounded_rectangle((68,55,122,109),radius=14,fill=BLUE)
    text(d,(83,56),'∫',36,'white',True);text(d,(140,60),'数学错题本',32,bold=True)
    text(d,(790,68),'MOBILE DEMO',20,BLUE,True)
    d.line((72,135,1008,135),fill='#d5e4f5',width=2)
    label=f'{index:02d} / 17   ·   ' if 0<index<18 else '数学错题本   ·   '
    text(d,(72,159),label+s['section'],25,BLUE,True)
    title=s['title']; n=64
    while font(n,True).getlength(title)>936:n-=1
    text(d,(68,214),title,n,bold=True)
    for j,line in enumerate(wrap(s['subtitle'],30,936)):text(d,(72,309+j*43),line,30,MUTED)
    x=72
    for tag in s['tags']:
        tw=font(22).getlength(tag)+32
        d.rounded_rectangle((x,370,x+tw,410),radius=11,fill='#e0edfc')
        text(d,(x+16,373),tag,22,'#2162ad');x+=tw+12
    d.rounded_rectangle((72,1868,1008,1872),radius=2,fill='#d4e3f5')
    text(d,(72,1882),'math.dogeeer.cn',23,BLUE,True)
    text(d,(580,1886),'演示题目及 AI 结果为示例',20,MUTED)
    return im

def current_phone(s,t):
    shots=s['shots'];interval=s['duration']/len(shots)
    idx=min(len(shots)-1,int(t/interval));local=t-idx*interval
    if idx<len(shots)-1 and (shots[idx],shots[idx+1]) in SCROLL and local>interval-1.2:
        return scrolling_phone(shots[idx],shots[idx+1],(local-interval+1.2)/1.2),idx,local
    if idx and local<0.42 and (shots[idx-1],shots[idx]) not in SCROLL:
        p=ease(local/0.42)
        a=phone(shots[idx-1]);b=phone(shots[idx])
        # Masked screen dissolve with a short eased slide; phone frame stays stable.
        result=a.copy(); mixed=Image.blend(screen(shots[idx-1]),screen(shots[idx]),p)
        result.paste(mixed,(18,51),smask)
        return result,idx,local
    return phone(shots[idx]),idx,local

def render(index,t,global_t):
    s=scenes[index];im=base_scene(index).copy();d=ImageDraw.Draw(im)
    p,idx,local=current_phone(s,t)
    intro=ease(t/0.8)
    y=423+round((1-intro)*100+3*math.sin(t*1.2))
    x=222+round(3*math.sin(t*.65))
    # Soft shadow is kept behind the device, with no costly full-frame blur per frame.
    im.paste(shadow,(x-40,y-13),shadow)
    im.paste(p,(x,y),mask)
    d=ImageDraw.Draw(im)
    interval=s['duration']/len(s['shots'])
    # Visual tap cue precedes each real interface-state change.
    phase=t%interval
    taps={3:[(160,290),(320,800)],5:[(350,490),(225,735),(320,800)],8:[(335,800)],10:[(165,220),(105,425)]}
    if index in taps and interval-.62<phase<interval-.08 and idx<len(s['shots'])-1:
        z=(phase-(interval-.62))/.54
        source=taps[index][min(idx,len(taps[index])-1)]
        tx=x+18+round(source[0]*1.6);ty=y+51+round(source[1]*1.6)
        radius=round(15+30*ease(z))
        d.ellipse((tx-radius,ty-radius,tx+radius,ty+radius),outline='#70aaf2',width=max(1,round(5*(1-z))))
        d.ellipse((tx-8,ty-8,tx+8,ty+8),fill=BLUE)
    d.rounded_rectangle((72,1868,72+round(936*global_t/DURATION),1872),radius=2,fill=BLUE)
    if s.get('kind')=='outro':
        a=ease((t-3)/.7)
        if a>0:
            overlay=Image.new('RGBA',im.size,(240,247,255,round(242*a)))
            im=Image.alpha_composite(im.convert('RGBA'),overlay).convert('RGB');d=ImageDraw.Draw(im)
            text(d,(72,455),'下一道错题，',76,INK,True)
            text(d,(72,566),'认真收好。',94,INK,True)
            text(d,(76,770),'从拍照，到整理，再到真正掌握。',36,MUTED)
            d.rounded_rectangle((72,956,1008,1100),radius=30,fill=BLUE)
            text(d,(135,988),'math.dogeeer.cn',62,'white',True)
            text(d,(222,1150),'手机浏览器打开即可使用',38,INK)
            text(d,(76,1460),'AI 识别与参考解析请核对。',26,MUTED)
            text(d,(76,1510),'以你实际记录的复习表现统计掌握度。',26,MUTED)
    if s.get('kind')=='intro':
        # Fast opening title remains legible before the detailed walkthrough.
        d.rounded_rectangle((72,147,1007,410),radius=20,fill='#f3f8ff')
        text(d,(72,166),'让错题，',82,INK,True)
        text(d,(72,269),'真正变成进步。',82,BLUE,True)
    return im

def make_music(duration):
    sr=44100; audio=np.zeros((math.ceil((duration+1)*sr),2),dtype=np.float32)
    rng=np.random.default_rng(27);beat=60/108
    chords=[[50,57,62,65,69],[46,53,58,62,65],[53,60,65,69,72],[48,55,60,64,67]]
    def add(start,signal,gain=.1,pan=0):
        pos=round(start*sr)
        if pos>=len(audio):return
        end=min(len(audio),pos+len(signal));signal=signal[:end-pos]
        audio[pos:end,0]+=signal*gain*math.sqrt((1-pan)/2)
        audio[pos:end,1]+=signal*gain*math.sqrt((1+pan)/2)
    def tone(note,duration,kind='key'):
        t=np.arange(round(duration*sr))/sr;freq=440*2**((note-69)/12)
        if kind=='pad':
            env=(1-np.exp(-t*4))*np.exp(-t*.3)*np.minimum(1,(duration-t)/.6)
            return (np.sin(2*np.pi*freq*t)+.22*np.sin(2*np.pi*freq*2.003*t))*.6*env
        if kind=='bass':return np.sin(2*np.pi*freq*t)*np.exp(-t*3)*np.minimum(1,t/.008)*np.minimum(1,(duration-t)/.03)
        return (np.sin(2*np.pi*freq*t+.8*np.sin(2*np.pi*freq*2*t)*np.exp(-t*7))+.18*np.sin(2*np.pi*freq*3*t))*np.exp(-t*3.8)*np.minimum(1,t/.006)*np.minimum(1,(duration-t)/.04)
    bars=math.ceil(duration/(beat*4));motif=[0,2,3,2,1,2,4,3]
    for bar in range(bars):
        start=bar*beat*4;chord=chords[(bar//2)%4]
        intensity=.55 if bar<2 or bar>bars-4 else 1
        for j,note in enumerate(chord):add(start,tone(note+12,beat*4.4,'pad'),.037,(-.65+j*.3))
        for step in range(8):
            note=chord[motif[step]]+12+(12 if bar%8 in (5,6) and step>4 else 0)
            add(start+step*beat/2,tone(note,beat*.95),.095*intensity,(-.3 if step%2 else .3))
            if step%2==0:add(start+step*beat/2,tone(chord[0]-12,beat*.8,'bass'),.19*intensity)
        for b in range(4):
            t=np.arange(round(.28*sr))/sr
            kick=np.sin(2*np.pi*(43*t+10*(1-np.exp(-t*24))))*np.exp(-t*18)
            add(start+b*beat,kick,.22*intensity)
            if b%2:
                t=np.arange(round(.16*sr))/sr;noise=rng.normal(0,1,len(t));noise=np.concatenate(([0],np.diff(noise)))
                clap=(noise*.45+np.sin(2*np.pi*180*t)*.1)*np.exp(-t*32)*np.minimum(1,t/.002)
                add(start+b*beat,clap,.07*intensity,.08)
            for off in (0,.5):
                t=np.arange(round(.055*sr))/sr;noise=rng.normal(0,1,len(t));noise=np.concatenate(([0],np.diff(noise)))
                add(start+(b+off)*beat,noise*np.exp(-t*75),.013*intensity,(-.4 if off else .4))
    # Stereo delay, soft limiting, and intentional fades; no abrupt loop seam.
    delay=round(beat*.75*sr)
    audio[delay:,0]+=audio[:-delay,1]*.17;audio[delay:,1]+=audio[:-delay,0]*.13
    audio=np.tanh(audio*1.15)
    peak=float(np.max(np.abs(audio)));audio*=.78/max(peak,.001)
    n=round(duration*sr);audio=audio[:n]
    audio[:sr*2]*=np.linspace(0,1,sr*2)[:,None]
    audio[-sr*4:]*=np.linspace(1,0,sr*4)[:,None]
    path=OUT/'数学错题本-原创配乐.wav'
    with wave.open(str(path),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((audio*32767).astype('<i2').tobytes())
    return path

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
    # Preflight every screenshot and caption before starting a lengthy encode.
    for scene in scenes:
        for name in scene['shots']:screen(name)
        assert len(wrap(scene['subtitle'],30,936))<=2
    if args.preview:
        indices=[0,2,5,8,10,12,14,18]
        sheet=Image.new('RGB',(1080,960),'white')
        for k,i in enumerate(indices):
            frame=render(i,scenes[i]['duration']*.56,sum(s['duration'] for s in scenes[:i])+3)
            sheet.paste(frame.resize((270,480),Image.Resampling.LANCZOS),((k%4)*270,(k//4)*480))
        sheet.save(OUT/'演示视频-分镜预览.jpg',quality=94)
        render(0,2,2).save(OUT/'演示视频-封面.jpg',quality=95)
        print('Preview ready',flush=True);return
    music=make_music(DURATION)
    target=OUT/'数学错题本-手机完整演示.mp4'
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    cmd=[ffmpeg,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(music),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r',str(FPS),'-c:a','aac','-b:a','192k','-af','loudnorm=I=-18:TP=-1.5:LRA=8','-movflags','+faststart','-shortest',str(target)]
    log=(CACHE/'encode.log').open('w')
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
    elapsed=0;start=time.time();previous=None
    try:
        for i,s in enumerate(scenes):
            for k in range(round(s['duration']*FPS)):
                t=k/FPS;frame=render(i,t,elapsed+t)
                if previous is not None and t<.55:frame=Image.blend(previous,frame,ease(t/.55))
                process.stdin.write(frame.tobytes())
            previous=frame
            elapsed+=s['duration']
            print(f'{i+1}/{len(scenes)} {s["section"]}: {elapsed}s | render {time.time()-start:.1f}s',flush=True)
        process.stdin.close();code=process.wait();assert code==0,code
    except Exception:
        process.kill();raise
    finally:log.close()
    (OUT/'演示视频-说明.txt').write_text(f'数学错题本 · 手机完整功能演示\n{W}×{H}，{FPS}fps，{DURATION} 秒，H.264 + AAC。\n真实界面采集，示例账号与预置 AI 结果；过程经剪辑，不表示真实 AI 处理速度。\n背景音乐由本次脚本原创合成，不含第三方采样；无旁白，含中文功能字幕。\n已覆盖账号、时间线、文字图片录题、裁剪旋转、识别归类、解析策略、AI 追问、自测、复习、搜索筛选、学习图表、知识点、科目、练习卷、导入导出备份和管理员模块。\nAI 结果请核对；掌握统计来自题目状态与复习评分。\n\n分镜：\n'+'\n'.join(f'{i+1:02d}. {s["section"]} — {s["title"]}' for i,s in enumerate(scenes)),encoding='utf-8')
    print(target,flush=True)

if __name__=='__main__':main()
