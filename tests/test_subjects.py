"""Subject behavior, account isolation, export/import and legacy migration."""
import os, sys, tempfile, unittest, sqlite3, json, uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
DATA=tempfile.TemporaryDirectory(prefix='math-subject-test-')
os.environ.update(MATH_DATA_DIR=DATA.name,MATH_COOKIE_SECURE='0',MATH_ADMIN_PASSWORD='Subjects-test-2026')
import app
from subjects import expand_legacy_subject_column


class SubjectTests(unittest.TestCase):
    def setUp(self):
        self.db=app.connect_db()
        self.db.execute('DELETE FROM entries'); self.db.execute('DELETE FROM subjects')
        self.db.execute("DELETE FROM users WHERE role='user'")
        self.uid=self.db.execute("SELECT id FROM users WHERE username='admin'").fetchone()[0]
        self.other=uuid.uuid4().hex
        self.db.execute("INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,'user',?)",(self.other,'other',app.hash_code('Subjects-test-2026'),app.now_utc()))
        self.db.commit()
        self.client=app.app.test_client(); self.second=app.app.test_client()
        for client,name in [(self.client,'admin'),(self.second,'other')]:
            client.post('/api/login',json={'username':name,'password':'Subjects-test-2026'})
        self.headers={'X-CSRF-Token':self.client.get('/api/me').json['csrf']}
        self.second_headers={'X-CSRF-Token':self.second.get('/api/me').json['csrf']}
        self.jobs=patch.object(app,'maybe_start_ai'); self.jobs.start()
    def tearDown(self):
        self.jobs.stop(); self.db.close()
    def add(self,name='概率论与数理统计'):
        response=self.client.post('/api/subjects',json={'name':name},headers=self.headers)
        self.assertEqual(response.status_code,201,response.json)
        return response.json['subject']['id']
    def entry(self,sid='analysis'):
        response=self.client.post('/api/entries',json={'subject':sid,'status':'wrong','problem':'测试题干','solution':'自己的解析','chapter':'随机变量','tags':['期望']},headers=self.headers)
        self.assertEqual(response.status_code,201,response.json)
        return response.json
    def test_add_rename_filter_stats_learning_and_owner_isolation(self):
        sid=self.add(); entry=self.entry(sid)
        self.entry('analysis')
        self.assertEqual(entry['subject_label'],'概率论与数理统计')
        self.assertEqual(self.client.get('/api/entries?subject='+sid).json['total'],1)
        self.assertEqual(self.client.get('/api/stats').json['by_subject'][sid],1)
        learning=self.client.get('/api/learning').json
        self.assertEqual(learning['by_subject'][sid],1)
        self.assertTrue(any(s['id']==sid for s in learning['subjects']))
        renamed=self.client.put('/api/subjects/'+sid,json={'name':'概率统计'},headers=self.headers)
        self.assertEqual(renamed.status_code,200)
        self.assertEqual(self.client.get('/api/entries/'+entry['id']).json['subject_label'],'概率统计')
        self.assertFalse(any(s['id']==sid for s in self.second.get('/api/subjects').json['subjects']))
        self.assertEqual(self.second.put('/api/subjects/'+sid,json={'name':'越权改名'},headers=self.second_headers).status_code,404)
        self.assertEqual(self.second.post('/api/entries',json={'subject':sid,'problem':'越权题'},headers=self.second_headers).status_code,400)
        self.assertEqual(self.second.get('/api/entries?subject='+sid).status_code,404)
    def test_builtin_rename_preserves_entry_review_and_other_account(self):
        entry=self.entry()
        self.client.post('/api/entries/'+entry['id']+'/review',json={'result':'good'},headers=self.headers)
        response=self.client.put('/api/subjects/analysis',json={'name':'高等数学'},headers=self.headers)
        self.assertEqual(response.status_code,200)
        stored=self.client.get('/api/entries/'+entry['id']).json
        self.assertEqual((stored['subject'],stored['subject_label'],stored['review_count']),('analysis','高等数学',1))
        self.assertEqual(self.second.get('/api/subjects').json['subjects'][0]['name'],'工科数学分析')
    def test_validation_csrf_duplicates_and_limit(self):
        self.assertEqual(app.app.test_client().get('/api/subjects').status_code,401)
        self.assertEqual(self.client.post('/api/subjects',json={'name':'英语'}).status_code,403)
        for name in ['',None,{},'x'*25]:
            self.assertEqual(self.client.post('/api/subjects',json={'name':name},headers=self.headers).status_code,400)
        sid=self.add('  English   II  ')
        self.assertEqual(self.client.post('/api/subjects',json={'name':'english II'},headers=self.headers).status_code,409)
        self.assertEqual(self.client.put('/api/subjects/'+sid,json={'name':'线性代数'},headers=self.headers).status_code,409)
        for i in range(47):
            self.db.execute('INSERT INTO subjects (user_id,id,name,created_at) VALUES(?,?,?,?)',(self.uid,'s_'+uuid.uuid4().hex,'科目'+str(i),app.now_utc()))
        self.db.commit()
        self.assertEqual(self.client.post('/api/subjects',json={'name':'超过限制'},headers=self.headers).status_code,400)
        self.assertEqual(self.client.put('/api/subjects/'+sid,json={'name':'英语'},headers=self.headers).status_code,200)
    def test_custom_ai_uses_actual_name_and_preserves_chapter(self):
        sid=self.add('大学物理'); entry=self.entry(sid)
        row=self.db.execute('SELECT * FROM entries WHERE id=?',(entry['id'],)).fetchone()
        result={'title':'牛顿第二定律','chapter':'质点动力学','knowledge_points':['牛顿第二定律'],'ocr_text':''}
        with patch.object(app,'call_ai',return_value=(json.dumps(result,ensure_ascii=False),'fake',{})) as call:
            parsed,_=app.do_solve(row,{'model':'fake'})
        messages=json.dumps(call.call_args.args[1],ensure_ascii=False)
        self.assertIn('学科：大学物理',messages)
        self.assertIn('未预设目录',messages)
        self.assertEqual(parsed['chapter'],'质点动力学')
        self.assertEqual(parsed['solution'],'')
        self.assertIn('学科：大学物理',app.entry_context(row))
    def test_export_import_preserves_names_without_renaming_recipient(self):
        sid=self.add(); self.entry(sid)
        self.client.put('/api/subjects/analysis',json={'name':'高等数学'},headers=self.headers)
        self.entry('analysis')
        exported=self.client.get('/api/export').json
        self.assertEqual(len(exported['subjects']),3)
        # Cross-account import already uses unique IDs, so use synthetic new IDs as a backup from another server would.
        for entry in exported['entries']: entry['id']=uuid.uuid4().hex
        response=self.second.post('/api/import',json=exported,headers=self.second_headers)
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.json['imported'],2,response.json)
        names=[s['name'] for s in self.second.get('/api/subjects').json['subjects']]
        self.assertIn('高等数学',names); self.assertIn('工科数学分析',names)
        imported=self.second.get('/api/entries').json['entries']
        self.assertEqual({e['subject_label'] for e in imported},{'概率论与数理统计','高等数学'})


class LegacyMigrationTests(unittest.TestCase):
    def test_rebuild_preserves_all_columns_indexes_reviews_messages_and_cascades(self):
        db=sqlite3.connect(':memory:'); db.row_factory=sqlite3.Row
        schema=(ROOT/'schema.sql').read_text(encoding='utf-8').replace('subject         TEXT NOT NULL,',"subject         TEXT NOT NULL CHECK (subject IN ('analysis', 'linear')),")
        db.executescript(schema)
        db.execute("INSERT INTO entries(id,subject,title,occurred_at,created_at,updated_at,ai_job_token) VALUES('entry','analysis','原题','2026-10-01','now','now','token')")
        db.execute("INSERT INTO reviews(id,entry_id,reviewed_at,result) VALUES('review','entry','now','good')")
        db.execute("INSERT INTO ai_messages(id,entry_id,role,content,created_at) VALUES('msg','entry','user','保留对话','now')")
        db.commit()
        original=tuple(db.execute('SELECT * FROM entries').fetchone())
        expand_legacy_subject_column(db)
        self.assertEqual(tuple(db.execute('SELECT * FROM entries').fetchone()),original)
        self.assertEqual(db.execute('SELECT count(*) FROM reviews').fetchone()[0],1)
        self.assertEqual(db.execute('SELECT content FROM ai_messages').fetchone()[0],'保留对话')
        self.assertEqual(db.execute('PRAGMA foreign_keys').fetchone()[0],1)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertTrue(db.execute("SELECT 1 FROM sqlite_master WHERE name='idx_entries_subject'").fetchone())
        db.execute("UPDATE entries SET subject='s_custom' WHERE id='entry'"); db.commit()
        expand_legacy_subject_column(db) # idempotent
        db.execute("DELETE FROM entries WHERE id='entry'"); db.commit()
        self.assertEqual(db.execute('SELECT count(*) FROM reviews').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT count(*) FROM ai_messages').fetchone()[0],0)
        db.close()

if __name__=='__main__': unittest.main()
