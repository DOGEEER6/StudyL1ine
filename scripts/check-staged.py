"""Reject sensitive staged files and common credential formats before a commit."""
import re, subprocess, sys
from pathlib import PurePosixPath

names=subprocess.check_output(['git','diff','--cached','--name-only','--diff-filter=ACMR','-z']).decode().split('\0')
bad=[]
key=re.compile(rb'(?:sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
for name in filter(None,names):
    path=PurePosixPath(name); base=path.name.lower()
    protected=any(p in {'data','uploads','backups','logs','releases','.venv','__pycache__'} or p.endswith('-data') for p in path.parts)
    protected=protected or (base.startswith('.env') and base!='.env.example') or base in {'secret_key','ai_key','admin_password.txt','initial_code.txt','nul'} or base.startswith('caddyfile') or bool(re.search(r'\.(?:db(?:-.*)?|sqlite\w*|pem|key|p12|zip|tar\.gz)$',base))
    if protected:
        bad.append(name+' (protected path)');continue
    raw=subprocess.check_output(['git','show',':'+name])
    if key.search(raw): bad.append(name+' (potential credential)')
if bad:
    print('Commit blocked. Remove credentials/runtime data from the staged changes:',file=sys.stderr)
    for name in bad: print(' - '+name,file=sys.stderr)
    sys.exit(1)
