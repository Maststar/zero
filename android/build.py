#!/usr/bin/env python3
"""Build an Android APK using official SDK tools and a supplied signing key."""
import argparse,pathlib,subprocess,zipfile,shutil,os
p=argparse.ArgumentParser();p.add_argument('--tools',required=True);p.add_argument('--platform',required=True);p.add_argument('--keystore',required=True);p.add_argument('--password-file',required=True);p.add_argument('--output',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parent;tools=pathlib.Path(a.tools).resolve();platform=pathlib.Path(a.platform).resolve();out=pathlib.Path(a.output).resolve();work=root/'build';work.mkdir(exist_ok=True)
for name in ['classes','generated','dex']:
 target=work/name
 if target.exists():shutil.rmtree(target)
 target.mkdir()
assets=root/'app/src/main/assets/web'
if assets.exists():shutil.rmtree(assets)
shutil.copytree(root.parent/'web',assets)
def run(args):subprocess.run([str(x) for x in args],check=True)
run([tools/'aapt2','compile','--dir',root/'app/src/main/res','-o',work/'resources.zip'])
run([tools/'aapt2','link','-o',work/'resources.apk','--manifest',root/'app/src/main/AndroidManifest.xml','-I',platform,'--java',work/'generated','--min-sdk-version','26','--target-sdk-version','35',work/'resources.zip'])
sources=list((root/'app/src/main/java').rglob('*.java'))+list((work/'generated').rglob('*.java'))
run(['java','com.sun.tools.javac.Main','-source','8','-target','8','-encoding','UTF-8','-classpath',platform,'-d',work/'classes',*sources])
with zipfile.ZipFile(work/'classes.jar','w') as z:
 for f in (work/'classes').rglob('*.class'):z.write(f,f.relative_to(work/'classes'))
run(['java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--lib',platform,'--min-api','26','--output',work/'dex',work/'classes.jar'])
shutil.copyfile(work/'resources.apk',work/'unsigned.apk')
with zipfile.ZipFile(work/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
 for f in (work/'dex').glob('*.dex'):z.write(f,f.name)
 for f in (root/'app/src/main/assets').rglob('*'):
  if f.is_file():z.write(f,'assets/'+str(f.relative_to(root/'app/src/main/assets')))
run([tools/'zipalign','-f','-p','4',work/'unsigned.apk',work/'aligned.apk'])
out.parent.mkdir(parents=True,exist_ok=True)
run(['java','-jar',tools/'lib/apksigner.jar','sign','--ks',pathlib.Path(a.keystore).resolve(),'--ks-key-alias','zero','--ks-pass','file:'+str(pathlib.Path(a.password_file).resolve()),'--out',out,work/'aligned.apk'])
run(['java','-jar',tools/'lib/apksigner.jar','verify','--verbose',out]);run([tools/'zipalign','-c','4',out]);print('Built',out,'('+str(out.stat().st_size)+' bytes)')
