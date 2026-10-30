"""Regression checks using a temporary, isolated database."""
import os
import tempfile
with tempfile.TemporaryDirectory(prefix='math-notes-qa-') as data:
    os.environ['MATH_DATA_DIR'] = data
    os.environ['MATH_COOKIE_SECURE'] = '0'
    os.environ['MATH_ADMIN_PASSWORD'] = 'Isolated-test-2026'
    import app
    client = app.app.test_client()
    assert client.get('/api/entries').status_code == 401
    assert client.get('/api/health').json['version'] == '1.8.0'
    login = client.post('/api/login', json={'username':'admin','password':'Isolated-test-2026'})
    assert login.status_code == 200, login.json
    csrf = client.get('/api/me').json['csrf']
    headers = {'X-CSRF-Token':csrf}
    assert client.post('/api/entries', json={}).status_code == 403
    payload = {'subject':'analysis','status':'wrong','problem':r'求 $x^2$ 的导数', 'solution':r'$2x$', 'difficulty':3,'attachments':[]}
    created = client.post('/api/entries', json=payload, headers=headers)
    assert created.status_code == 201, created.json
    entry = created.json
    entry_id = entry['id']
    assert client.get('/api/entries?solutions=0').json['entries'][0]['solution'] == ''
    assert client.get('/api/entries?subject=linear').json['total'] == 0
    assert client.get('/api/entries?ids=' + ','.join([entry_id] * 205)).status_code == 200
    updated = client.put('/api/entries/'+entry_id, json={**payload,'status':'reviewing'}, headers=headers)
    assert updated.status_code == 200
    review = client.post('/api/entries/'+entry_id+'/review', json={'result':'good','note':'回归检查'}, headers=headers)
    assert review.status_code == 200 and review.json['entry']['review_count'] == 1
    for path in ['/', '/login', '/admin', '/print', '/static/css/notebook.css', '/static/js/app.js']:
        response = client.get(path)
        assert response.status_code in (200,302), (path,response.status_code)
    db = app.connect_db()
    db.execute("DELETE FROM entries WHERE id=?", (entry_id,))
    db.commit()
    db.close()
    print('PASS: auth/CSRF, create/edit, practice hiding, filtering, 205 IDs, review, pages/assets')
