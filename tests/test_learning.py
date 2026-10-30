import os, sys, tempfile, unittest, json, base64, io
from pathlib import Path
from unittest.mock import patch, Mock
from datetime import timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
DATA = tempfile.TemporaryDirectory(prefix='math-learning-test-')
os.environ.update(MATH_DATA_DIR=DATA.name,MATH_COOKIE_SECURE='0',MATH_ADMIN_PASSWORD='Learning-test-2026',MATH_AI_API_KEY='isolated-fake-key')
import app
from PIL import Image

RESULT={'title':'导数计算','chapter':'一元函数微分学','tags':['导数与微分'],'answer':'$12$','solution':'使用幂函数求导公式，得到 $3x^2$。','ocr_text':''}
class LearningTests(unittest.TestCase):
    def setUp(self):
        self.db=app.connect_db()
        self.db.execute('DELETE FROM entries')
        self.db.execute('DELETE FROM ai_usage')
        for k,v in [('ai_enabled','1'),('ai_daily_limit','80'),('ai_hourly_limit','30'),('ai_auto_solve','0'),('ai_auto_ocr','0')]: app.set_setting(self.db,k,v)
        self.db.commit()
        self.uid=self.db.execute("SELECT id FROM users WHERE username='admin'").fetchone()['id']
    def tearDown(self): self.db.close()
    def entry(self,**overrides):
        payload={'subject':'analysis','status':'reviewing','problem':'求导数','solution':'手写解析','attachments':[],**overrides}
        eid=app.insert_entry(self.db,app.build_entry_payload(payload),self.uid)
        self.db.commit()
        return eid
    def test_manual_solution_cannot_opt_out_of_auto_analysis(self):
        eid=self.entry()
        with patch.object(app.AI_EXECUTOR,'submit') as submit:
            app.maybe_start_ai(eid)
        row=self.db.execute('SELECT * FROM entries WHERE id=?',(eid,)).fetchone()
        self.assertEqual(row['ai_status'],'pending')
        self.assertTrue(row['ai_job_token'])
        submit.assert_called_once()
        self.assertTrue(app.get_ai_config(self.db)['auto_solve'])
        self.assertTrue(app.get_ai_config(self.db)['auto_ocr'])
    def test_worker_saves_metadata_without_overwriting_manual_solution(self):
        eid=self.entry()
        self.db.execute("UPDATE entries SET ai_job_token='job',ai_status='pending' WHERE id=?",(eid,));self.db.commit()
        with patch.object(app,'do_solve',return_value=(RESULT,'test-model')): app.ai_solve_worker(eid,'job')
        row=self.db.execute('SELECT * FROM entries WHERE id=?',(eid,)).fetchone()
        self.assertEqual((row['title'],row['chapter'],row['ai_status'],row['solution']),('导数计算','一元函数微分学','done','手写解析'))
        self.assertEqual(json.loads(row['tags']),['导数与微分'])
    def test_late_worker_cannot_overwrite_newer_edit(self):
        eid=self.entry()
        self.db.execute("UPDATE entries SET ai_job_token='old' WHERE id=?",(eid,));self.db.commit()
        def new_edit(*args):
            self.db.execute("UPDATE entries SET ai_job_token='new',title='新题',ai_status='pending' WHERE id=?",(eid,));self.db.commit()
            return RESULT,'model'
        with patch.object(app,'do_solve',side_effect=new_edit): app.ai_solve_worker(eid,'old')
        row=self.db.execute('SELECT * FROM entries WHERE id=?',(eid,)).fetchone()
        self.assertEqual((row['title'],row['ai_status'],row['ai_metadata_version']),('新题','pending',0))
    def test_blank_output_retries_once_and_reserves_quota(self):
        eid=self.entry()
        self.db.execute("UPDATE entries SET ai_job_token='job' WHERE id=?",(eid,));self.db.commit()
        with patch.object(app,'do_solve',side_effect=[app.AIError('AI 返回了空内容'),(RESULT,'model')]) as solve:
            app.ai_solve_worker(eid,'job')
        self.assertEqual(solve.call_count,2)
        self.assertTrue(solve.call_args.args[1]['disable_thinking'])
        self.assertEqual(self.db.execute('SELECT ai_status FROM entries WHERE id=?',(eid,)).fetchone()[0],'done')
        self.assertEqual(self.db.execute("SELECT count(*) FROM ai_usage WHERE kind='solve_retry'").fetchone()[0],1)
    def test_image_with_typed_text_still_gets_ocr(self):
        out=io.BytesIO();Image.new('RGB',(20,20),'white').save(out,format='PNG')
        image='data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()
        eid=self.entry(attachments=[{'data':image,'kind':'problem','name':'test.png'}])
        row=self.db.execute('SELECT * FROM entries WHERE id=?',(eid,)).fetchone()
        response={**RESULT,'knowledge_points':['导数与微分'],'ocr_text':'图片中的完整题干'}
        with patch.object(app,'call_ai',return_value=(json.dumps(response,ensure_ascii=False),'vision',{})) as call:
            result,model=app.do_solve(row,app.get_ai_config(self.db))
        self.assertEqual(result['ocr_text'],'图片中的完整题干')
        self.assertTrue(any(part['type']=='image_url' for part in call.call_args.args[1][1]['content']))
    def test_image_requires_real_ocr_and_metadata(self):
        response=json.dumps({**RESULT,'knowledge_points':['导数与微分']},ensure_ascii=False)
        with self.assertRaises(app.AIError): app.parse_analysis_json(response,'analysis',True)
        with self.assertRaises(app.AIError): app.parse_analysis_json('{"answer":"1","solution":"x"}','analysis',False)
        self.assertEqual(len(app.image_content(['题干'],['image']*8)),9)
    def test_learning_scores_empty_states_and_user_isolation(self):
        first=self.entry(tags=['导数与微分'],chapter='一元函数微分学')
        second=self.entry(tags=['导数与微分'],status='mastered',chapter='一元函数微分学')
        self.entry(tags=['待评估知识点'])
        self.db.execute('INSERT INTO reviews(id,entry_id,reviewed_at,result,interval_days) VALUES(?,?,?,?,?)',('r1',first,app.now_utc(),'hard',2))
        self.db.commit()
        summary=app.learning_summary(self.db,self.uid,app.today_local())
        topic=next(t for t in summary['knowledge'] if t['name']=='导数与微分')
        self.assertEqual((topic['mastery'],topic['count'],topic['assessed']),(70,2,2))
        self.assertIsNone(next(t for t in summary['knowledge'] if t['name']=='待评估知识点')['mastery'])
        self.assertEqual(len(summary['activity']),119)
        self.assertEqual(summary['activity'][-1]['reviewed'],1)
        other=app.learning_summary(self.db,'another-user',app.today_local())
        self.assertEqual((other['total'],other['knowledge']),(0,[]))
    def test_learning_routes_require_login(self):
        client=app.app.test_client()
        self.assertEqual(client.get('/api/learning').status_code,401)
        self.assertEqual(client.get('/learning').status_code,302)

if __name__=='__main__':
    unittest.main()
