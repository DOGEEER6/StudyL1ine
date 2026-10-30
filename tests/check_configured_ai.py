"""Two synthetic end-to-end jobs using the server's existing configured provider."""
import os, sys, json, sqlite3, tempfile, base64
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
source=Path(os.environ['MATH_DATA_DIR'])
db=sqlite3.connect(f'file:{source / "math.db"}?mode=ro',uri=True)
settings=db.execute("SELECT key,value FROM settings WHERE key LIKE 'ai_%'").fetchall()
db.close()
key=os.environ.get('MATH_AI_API_KEY') or (source/'ai_key').read_text(encoding='utf-8').strip()
with tempfile.TemporaryDirectory(prefix='math-live-ai-test-') as tmp:
    os.environ.update(MATH_DATA_DIR=tmp,MATH_AI_API_KEY=key,MATH_COOKIE_SECURE='0',MATH_ADMIN_PASSWORD='Synthetic-test-2026')
    os.environ.pop('MATH_ENRICH_EXISTING',None)
    import app
    db=app.connect_db()
    for k,v in settings: app.set_setting(db,k,v)
    db.commit()
    uid=db.execute("SELECT id FROM users WHERE role='admin'").fetchone()['id']
    fixture=root/'tests/auto-ocr-test.png'
    image='data:image/png;base64,'+base64.b64encode(fixture.read_bytes()).decode()
    examples=[{'subject':'analysis','problem':'计算函数 f(x)=x^3 在 x=2 处的导数，并说明使用的求导法则。','solution':'我算出了 12，想检查。','attachments':[]}, {'subject':'analysis','problem':'','solution':'','attachments':[{'data':image,'kind':'problem','name':'synthetic-test.png'}]}]
    ids=[]
    for example in examples:
        eid=app.insert_entry(db,app.build_entry_payload({'status':'unsolved',**example}),uid)
        db.commit();ids.append(eid);app.maybe_start_ai(eid)
    app.AI_EXECUTOR.shutdown(wait=True)
    ok=True
    for index,eid in enumerate(ids):
        row=db.execute('SELECT * FROM entries WHERE id=?',(eid,)).fetchone()
        print(json.dumps({'case':'text' if index==0 else 'image','status':row['ai_status'],'title':row['title'],'chapter':row['chapter'],'tags':json.loads(row['tags']),'ocr_chars':len(row['ocr_text']),'answer':row['ai_answer'][:120],'error':row['ai_error']},ensure_ascii=False),flush=True)
        ok &= row['ai_status']=='done' and row['ai_metadata_version']==1 and bool(row['tags']) and (index==0 or bool(row['ocr_text']))
    db.close()
    if not ok: raise SystemExit(1)
