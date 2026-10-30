import os,sys,tempfile,unittest,uuid,importlib.util,json,base64,io
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
DATA=tempfile.TemporaryDirectory(prefix='review-copy-test-')
os.environ.update(MATH_DATA_DIR=DATA.name,MATH_ADMIN_PASSWORD='Copy-fixture-2026',MATH_COOKIE_SECURE='0')
import app
from PIL import Image
spec=importlib.util.spec_from_file_location('copy_review',ROOT/'scripts/copy-review-data.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ReviewCopyTests(unittest.TestCase):
    def setUp(self):
        self.db=app.connect_db();self.db.execute('DELETE FROM entries');self.db.execute('DELETE FROM ai_usage');self.db.execute('DELETE FROM subjects');self.db.execute("DELETE FROM users WHERE role='user'")
        self.sid=self.db.execute("SELECT id FROM users WHERE role='admin'").fetchone()[0];self.tid=uuid.uuid4().hex
        self.db.execute("INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,'user',?)",(self.tid,'test','old-hash',app.now_utc()))
        image=io.BytesIO();Image.new('RGB',(24,24),'white').save(image,'PNG')
        payload=app.build_entry_payload({'subject':'analysis','status':'reviewing','problem':'原题','solution':'原解析','tags':['知识点'],'attachments':[{'kind':'problem','data':'data:image/png;base64,'+base64.b64encode(image.getvalue()).decode()}]})
        self.eid=app.insert_entry(self.db,payload,self.sid)
        self.db.execute('INSERT INTO reviews(id,entry_id,reviewed_at,result,note) VALUES(?,?,?,?,?)',(uuid.uuid4().hex,self.eid,app.now_utc(),'good','完整备注'))
        self.db.execute('INSERT INTO ai_messages(id,entry_id,role,content,created_at) VALUES(?,?,?,?,?)',(uuid.uuid4().hex,self.eid,'assistant','原对话内容',app.now_utc()))
        self.db.execute('INSERT INTO ai_usage(id,user_id,entry_id,kind,created_at) VALUES(?,?,?,?,?)',(uuid.uuid4().hex,self.sid,self.eid,'solve',app.now_utc()));self.db.commit()
    def tearDown(self):self.db.close()
    def test_full_copy_preserves_data_and_isolates_images(self):
        original=dict(self.db.execute('SELECT * FROM entries WHERE id=?',(self.eid,)).fetchone())
        result=module.clone(Path(DATA.name),'admin','test','Fixture-pass-2026',True)
        self.assertTrue(result['learning_summary_equal']);self.assertEqual(result['counts']['reviews'],1);self.assertEqual(result['counts']['ai_messages'],1)
        target=self.db.execute('SELECT * FROM entries WHERE user_id=?',(self.tid,)).fetchone()
        self.assertNotEqual(target['id'],self.eid);self.assertEqual(target['solution'],'原解析')
        a=json.loads(original['attachments'])[0];b=json.loads(target['attachments'])[0]
        self.assertNotEqual(a['url'],b['url']);self.assertEqual((app.UPLOAD_DIR/Path(a['url']).name).read_bytes(),(app.UPLOAD_DIR/Path(b['url']).name).read_bytes())
        self.assertEqual(dict(self.db.execute('SELECT * FROM entries WHERE id=?',(self.eid,)).fetchone()),original)
        user=self.db.execute('SELECT * FROM users WHERE id=?',(self.tid,)).fetchone();self.assertEqual(user['role'],'user');self.assertTrue(app.verify_code('Fixture-pass-2026',user['password_hash']))
    def test_existing_target_data_is_never_replaced(self):
        self.db.execute('UPDATE entries SET user_id=? WHERE id=?',(self.tid,self.eid));self.db.commit()
        with self.assertRaisesRegex(AssertionError,'not empty'):module.clone(Path(DATA.name),'admin','test','Fixture-pass-2026',True)
    def test_dry_run_does_not_copy(self):
        result=module.clone(Path(DATA.name),'admin','test','',False)
        self.assertEqual(result['mode'],'dry-run');self.assertEqual(self.db.execute('SELECT count(*) FROM entries WHERE user_id=?',(self.tid,)).fetchone()[0],0)

if __name__=='__main__':unittest.main()
