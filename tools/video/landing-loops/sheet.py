import json,sys,os
from PIL import Image,ImageDraw
base=sys.argv[1]; ch=sys.argv[2]; step=float(sys.argv[3]); t0s=float(sys.argv[4]) if len(sys.argv)>4 else 0; t1s=float(sys.argv[5]) if len(sys.argv)>5 else 1e9
d=f'/home/claude/video/build/{base}/rec/{ch}'
j=json.load(open(d+'/frames.json')); T0=j['t0']; fr=j['frames']
pick=[];nxt=t0s
for i,f in enumerate(fr):
    t=(f['t']-T0)/1000
    if t<t0s or t>t1s: continue
    if t>=nxt: pick.append((i,t,f['file'])); nxt=t+step
mob=base=='mobile'
tw,th=(390,211) if not mob else (156,338)
cols=5 if not mob else 10
rows=(len(pick)+cols-1)//cols
S=Image.new('RGB',(cols*tw,rows*(th+14)),'white');D=ImageDraw.Draw(S)
for k,(i,t,fn) in enumerate(pick):
    im=Image.open(d+'/'+fn).convert('RGB').resize((tw,th))
    x=(k%cols)*tw;y=(k//cols)*(th+14)
    S.paste(im,(x,y+14));D.text((x+2,y+1),f'{i} t={t:.1f}',fill='red')
out=f'/home/claude/video/work/landing/sheets/{ch}_{t0s:g}.jpg';S.save(out,quality=80);print(out,len(pick),'total',(fr[-1]['t']-T0)/1000)
