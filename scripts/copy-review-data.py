"""Clone an owned account's learning data into an empty ordinary review account.
Run on the server with explicit authorization. Never imports the application.
Passwords are read from stdin and never logged; database/backups stay server-side.
"""
import argparse,base64,hashlib,json,os,re,secrets,shlex,shutil,sqlite3,sys,uuid,zipfile
from datetime import datetime,timezone,date
from pathlib import Path
from zoneinfo import ZoneInfo

def clone(data_dir,source_name,target_name,password,apply=False):
    db=sqlite3.connect(data_dir/'math.db',timeout=30);db.row_factory=sqlite3.Row
    try:
        return _clone(db,data_dir,source_name,target_name,password,apply)
    finally:
        db.close()

def _clone(db,data_dir,source_name,target_name,password,apply):
    db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA busy_timeout=30000')
    source=db.execute('SELECT * FROM users WHERE username=? COLLATE NOCASE',(source_name,)).fetchone()
    target=db.execute('SELECT * FROM users WHERE username=? COLLATE NOCASE',(target_name,)).fetchone()
    assert source,'Source account not found'
    assert source_name.casefold()!=target_name.casefold(),'Source and target must differ'
    if target:
        assert target['role']=='user','Target must be an ordinary account'
        assert db.execute('SELECT count(*) FROM entries WHERE user_id=?',(target['id'],)).fetchone()[0]==0,'Target is not empty; refusing to replace data'
        assert db.execute('SELECT count(*) FROM subjects WHERE user_id=?',(target['id'],)).fetchone()[0]==0,'Target has subject definitions; refusing to replace data'
    assert not db.execute("SELECT 1 FROM entries WHERE user_id=? AND ai_status IN ('pending','generating') LIMIT 1",(source['id'],)).fetchone(),'Wait for AI jobs to finish'
    rows=db.execute('SELECT * FROM entries WHERE user_id=? ORDER BY rowid',(source['id'],)).fetchall()
    if not apply:
        db.close();return {'source':source_name,'target':target_name,'entries':len(rows),'target_exists':bool(target),'mode':'dry-run'}
    assert len(password)>=8,'Review password must have at least 8 characters'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    backup=data_dir/'backups'/('math-notes-'+stamp+'-review-copy.zip');backup.parent.mkdir(exist_ok=True)
    snapshot=backup.with_suffix('.db')
    dest=sqlite3.connect(snapshot);db.backup(dest);dest.close();snapshot.chmod(0o600)
    with zipfile.ZipFile(backup,'w',zipfile.ZIP_DEFLATED) as z:
        z.write(snapshot,'math.db')
        for p in (data_dir/'uploads').glob('*.webp'):z.write(p,'uploads/'+p.name)
    backup.chmod(0o600);snapshot.unlink()
    made=[];mapping={};filemap={};counts={'entries':0,'reviews':0,'ai_messages':0,'subjects':0,'ai_usage':0,'image_files':0}
    def insert(table,obj):
        cols=list(obj);db.execute('INSERT INTO '+table+' ('+','.join('"'+k+'"' for k in cols)+') VALUES ('+','.join('?' for _ in cols)+')',[obj[k] for k in cols])
    def images(raw):
        items=json.loads(raw or '[]')
        for item in items:
            for key in ['url','thumb']:
                url=item.get(key)
                if not url:continue
                match=re.fullmatch(r'/uploads/([0-9a-f]{32})(_thumb)?\.webp',url)
                assert match,'Unexpected attachment path'
                old,thumb=match.groups();new=filemap.setdefault(old,uuid.uuid4().hex)
                original=data_dir/'uploads'/Path(url).name
                copied=data_dir/'uploads'/(new+('_thumb' if thumb else '')+'.webp')
                assert original.is_file(),'Missing source attachment'
                if not copied.exists():
                    shutil.copyfile(original,copied);made.append(copied)
                    assert hashlib.sha256(original.read_bytes()).digest()==hashlib.sha256(copied.read_bytes()).digest()
                item[key]='/uploads/'+copied.name
        return json.dumps(items,ensure_ascii=False)
    try:
        db.execute('BEGIN IMMEDIATE')
        rows=db.execute('SELECT * FROM entries WHERE user_id=? ORDER BY rowid',(source['id'],)).fetchall()
        assert not any(r['ai_status'] in ('pending','generating') for r in rows),'Source changed: AI job started'
        if target:
            assert db.execute('SELECT count(*) FROM entries WHERE user_id=?',(target['id'],)).fetchone()[0]==0,'Target changed'
        tid=target['id'] if target else uuid.uuid4().hex
        salt=secrets.token_bytes(16);digest=hashlib.pbkdf2_hmac('sha256',password.encode(),salt,240000)
        enc=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
        ph='pbkdf2_sha256$240000$'+enc(salt)+'$'+enc(digest)
        if target:db.execute('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',(ph,tid))
        else:insert('users',{'id':tid,'username':target_name,'password_hash':ph,'role':'user','session_version':1,'created_at':datetime.now(timezone.utc).isoformat(),'last_login_at':None})
        for row in rows:
            obj=dict(row);eid=uuid.uuid4().hex;mapping[row['id']]=eid
            obj.update(id=eid,user_id=tid,attachments=images(row['attachments']),ai_job_token='')
            insert('entries',obj);counts['entries']+=1
            copied=db.execute('SELECT * FROM entries WHERE id=?',(eid,)).fetchone()
            for key in row.keys():
                if key not in ('id','user_id','attachments','ai_job_token'):assert copied[key]==row[key],key
            for table in ['reviews','ai_messages']:
                for child in db.execute('SELECT * FROM '+table+' WHERE entry_id=? ORDER BY rowid',(row['id'],)).fetchall():
                    obj=dict(child);obj.update(id=uuid.uuid4().hex,entry_id=eid);insert(table,obj);counts[table]+=1
        for table in ['subjects','ai_usage']:
            for row in db.execute('SELECT * FROM '+table+' WHERE user_id=? ORDER BY rowid',(source['id'],)).fetchall():
                obj=dict(row);obj['user_id']=tid
                if table=='ai_usage':obj.update(id=uuid.uuid4().hex,entry_id=mapping.get(obj['entry_id']))
                insert(table,obj);counts[table]+=1
        # Match all user-facing aggregates before committing the transaction.
        sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
        from learning import learning_summary
        today=datetime.now(ZoneInfo('Asia/Shanghai')).date()
        assert learning_summary(db,source['id'],today)==learning_summary(db,tid,today),'Learning summaries differ'
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        for row in rows:assert dict(db.execute('SELECT * FROM entries WHERE id=?',(row['id'],)).fetchone())==dict(row),'Source changed'
        db.commit();counts['image_files']=len(made)
        return {'source':source_name,'target':target_name,'counts':counts,'target_role':'user','learning_summary_equal':True,'source_unchanged':True,'backup':backup.name}
    except Exception:
        db.rollback()
        for p in made:p.unlink(missing_ok=True)
        raise
    finally:db.close()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--target',required=True);ap.add_argument('--data-dir',type=Path);ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    data=args.data_dir
    if data is None:
        root=Path(__file__).resolve().parents[1]
        for line in (root/'.env').read_text().splitlines():
            if line.strip().startswith('MATH_DATA_DIR='):data=Path(shlex.split(line.split('=',1)[1])[0])
    assert data is not None,'Specify --data-dir'
    password=sys.stdin.readline().rstrip('\r\n') if args.apply else ''
    print(json.dumps(clone(data.resolve(),args.source,args.target,password,args.apply),ensure_ascii=False))

if __name__=='__main__':main()
