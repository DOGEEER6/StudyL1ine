"""Build a competition ZIP with a fresh reachable-only Git clone and demo media."""
import argparse, hashlib, json, os, re, shutil, stat, subprocess, tempfile, zipfile
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SECRET=re.compile(rb'(?:sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')

def git(root,*args):return subprocess.check_output(['git','-C',str(root),*args],stderr=subprocess.STDOUT).decode('utf-8').strip()

def scan_history(repo):
    objects=git(repo,'rev-list','--objects','--all').splitlines()
    # Read each reachable object in one batch; inspect only blobs and never print contents.
    p=subprocess.Popen(['git','-C',str(repo),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    checked=0
    for item in objects:
        oid=item.split(' ',1)[0];p.stdin.write((oid+'\n').encode());p.stdin.flush()
        header=p.stdout.readline().decode().split();size=int(header[2]);raw=p.stdout.read(size);p.stdout.read(1)
        if header[1]=='blob':
            assert not SECRET.search(raw),'Potential credential in historical blob '+oid
            checked+=1
    p.stdin.close();p.stdout.close();assert p.wait()==0
    return checked

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--media-dir',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
    assert not git(ROOT,'status','--porcelain'),'Commit all intended source changes before packaging'
    media=args.media_dir.resolve();output=args.output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='math-notes-submission-') as folder:
        package=Path(folder)/'数学错题本-参赛作品';package.mkdir()
        source=package/'源码'
        subprocess.run(['git','clone','--no-local','--no-hardlinks','--branch','main',str(ROOT),str(source)],check=True,capture_output=True)
        git(source,'remote','remove','origin')
        git(source,'config','core.hooksPath','.githooks')
        git(source,'fsck','--full','--no-dangling')
        assert git(source,'rev-parse','HEAD')==git(ROOT,'rev-parse','HEAD')
        assert not git(source,'status','--porcelain')
        blobs=scan_history(source)
        copies={
          '数学错题本-手机完整演示.mp4':'演示资料/手机完整功能演示.mp4',
          '数学错题本-手机宣传海报-v2.png':'演示资料/手机宣传海报.png',
          '演示视频-封面.jpg':'演示资料/视频封面.jpg',
          '演示视频-分镜预览.jpg':'演示资料/分镜预览.jpg',
          '数学错题本-原创配乐.wav':'演示资料/原创配乐.wav',
          '演示视频-制作素材.zip':'演示资料/视频制作素材.zip',
          '演示视频-说明.txt':'演示资料/视频说明.txt'}
        if (media/'数学错题本-参赛作品介绍.pdf').is_file():
            copies['数学错题本-参赛作品介绍.pdf']='作品介绍.pdf'
        for src,dst in copies.items():
            target=package/dst;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(media/src,target)
        (package/'开始评审.md').write_text('''# 数学错题本 · 参赛作品

欢迎评审。本包包含可运行源码、实际 Git 仓库及演示资料；不是只有视频或设计稿。

在线体验入口：math.dogeeer.cn 。测试账号：test；密码：12345678。测试号已准备独立的题目、图片、解析、复习和 AI 对话资料，保持普通用户权限。

如包内有 `作品介绍.pdf`，可先阅读其中的项目说明、操作方法、亮点、AI 测试落地、关键技术、界面图片和发表 / 获奖情况。

1. 先看 `演示资料/手机完整功能演示.mp4`：2 分 36 秒，1080×1920、60 帧，含原创配乐、中文字幕、用户端与管理端功能。
2. 读 `源码/submission/参赛作品说明.md` 和 `技术实现.md`，了解功能、实现与边界。
3. 按 `源码/submission/评审部署与验证.md` 创建 Python 虚拟环境并安装 `requirements-review.txt`。
4. 在 `源码/` 执行 `python review.py`，打开 http://127.0.0.1:8787 。示例账号 `demo`，密码 `Demo-video-2026`；示例数据及预置 AI 在本机运行，不调用真实云模型。
5. 要测试真实 AI 请求，请使用 `python review.py --mode live`，按部署指南取得新建本地管理员密码，再配置自己的模型服务。首次安装依赖需要联网；未配置 AI 不妨碍手工题库、复习、科目、统计和打印功能。
6. 在 `源码/` 可用 `git log --oneline --decorate` 查看历史，`.git/` 已随包保留。为避免误推送，提交副本不配置原服务器远程地址。

## 文件说明

- `源码/`：完整应用及 Git 仓库、评审入口、示例题图、视频制作脚本、验证脚本、文档和第三方依赖声明。
- `演示资料/`：演示影片、手机海报、封面、分镜、原创配乐和制作素材。
- `作品清单.json`：源码提交、标签、扫描范围与版本信息。
- `文件校验清单.sha256`：检查每个文件是否在传输或解压时损坏。

提交包应用版本为 v2.2.0。Git 历史中的 `history:` 提交由已有发布备份恢复，不伪装成当时逐行提交；具体来源和恢复边界见 `源码/docs/VERSION_CONTROL.md`。

本包不含真实 `.env`、API Key、数据库、用户图片、服务器证书或虚拟环境。首次启动生成独立体验数据。演示视频采用真实界面、合成题库和预置 AI 输出制作，不表示实际云模型的响应速度或准确率。

如赛事另有署名表、报名表、篇幅、命名或提交格式要求，请在参赛平台按要求填写。本包未代填个人身份、队伍或主办方要求的信息。
''',encoding='utf-8')
        manifest={'project':'数学错题本（Math Notes）','app_version':'2.2.0','source_commit':git(source,'rev-parse','HEAD'),'branch':'main','commit_count':int(git(source,'rev-list','--count','HEAD')),'tags':git(source,'tag','--list').splitlines(),'git_repository_included':True,'remote_configured':False,'reachable_blobs_scanned':blobs,'demo':'synthetic questions; preset AI; no production user data','runtime':'Python 3.11+; see 源码/submission/评审部署与验证.md','video':{'width':1080,'height':1920,'fps':60,'seconds':156}}
        (package/'作品清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        files=sorted(p for p in package.rglob('*') if p.is_file())
        (package/'文件校验清单.sha256').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(package).as_posix()+'\n' for p in files),encoding='utf-8')
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for p in sorted(package.rglob('*')):
                if not p.is_file():continue
                relative=p.relative_to(package).as_posix()
                assert not any(part in {'review-demo-data','review-live-data','render-data','render-cache','__pycache__','.venv'} for part in p.relative_to(package).parts)
                if '.git' not in p.relative_to(package).parts:
                    assert p.name!='.env' and p.suffix.lower() not in {'.db','.sqlite','.pem','.key'},relative
                info=zipfile.ZipInfo(package.name+'/'+relative);info.create_system=3
                mode=0o755 if p.suffix=='.sh' or p.name=='pre-commit' else 0o644
                info.external_attr=(stat.S_IFREG|mode)<<16;info.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(info,p.read_bytes())
        digest=hashlib.sha256(output.read_bytes()).hexdigest()
        output.with_suffix(output.suffix+'.sha256').write_text(digest+'  '+output.name+'\n',encoding='utf-8')
        print(json.dumps({'file':str(output),'bytes':output.stat().st_size,'sha256':digest,'commit_count':manifest['commit_count'],'blobs_scanned':blobs},ensure_ascii=False))

if __name__=='__main__':main()
