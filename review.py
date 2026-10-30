"""Portable, loopback-only competition preview, with isolated app data."""
import argparse, os, runpy
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description='Math Notes competition preview (local machine only)')
    parser.add_argument('--mode',choices=['demo','live'],default='demo',help='demo: seeded data and preset AI; live: normal app with empty independent database')
    parser.add_argument('--port',type=int,default=8787)
    parser.add_argument('--data-dir',type=Path)
    args=parser.parse_args()
    if not 1<=args.port<=65535:parser.error('port must be 1..65535')
    root=Path(__file__).resolve().parent
    data=(args.data_dir or root/('review-demo-data' if args.mode=='demo' else 'review-live-data')).resolve()
    data.mkdir(parents=True,exist_ok=True)
    # These settings are process-local and never alter the production startup scripts.
    os.environ.update(MATH_DATA_DIR=str(data),MATH_COOKIE_SECURE='0')
    os.environ.pop('MATH_ENRICH_EXISTING',None)
    print(f'Local review: http://127.0.0.1:{args.port}',flush=True)
    print('Data directory: '+str(data),flush=True)
    if args.mode=='demo':
        os.environ.update(MATH_DEMO_DATA_DIR=str(data),MATH_DEMO_PORT=str(args.port))
        print('Demo login: demo / Demo-video-2026 (sample data, preset AI, no cloud requests)',flush=True)
        runpy.run_path(str(root/'demo/serve_demo.py'),run_name='__main__')
    else:
        import app
        password_file=data/'admin_password.txt'
        if password_file.exists():print('Initial local administrator account is stored in '+str(password_file),flush=True)
        print('Normal app mode. Configure your own AI service in /admin to enable real AI processing.',flush=True)
        from waitress import serve
        serve(app.app,host='127.0.0.1',port=args.port,threads=8)

if __name__=='__main__':main()
