# cuts.py specs.json name... -> check/cuts-<name>.jpg : the source frame at every piece start/end (the frames a cut shows)
import json,sys,bisect
from PIL import Image,ImageDraw
s=json.load(open(sys.argv[1]))
for n in sys.argv[2:]:
    ims=[]
    for sg in s[n]['segs']:
        ch=sg['cap'];base='desktop' if ch.startswith('d') else 'mobile'
        d=f'/home/claude/video/build/{base}/rec/{ch}';j=json.load(open(d+'/frames.json'));T=j['t0']
        ts=[(f['t']-T)/1000 for f in j['frames']]
        for a,b,sp in sg['pieces']:
            for t in (a,b-0.01):
                i=max(0,bisect.bisect_right(ts,t)-1); ims.append((f'{ch} {t:.2f} f{i}',d+'/'+j['frames'][i]['file']))
    mob=s[n]['kind']=='mobile'; tw,th=(160,346) if mob else (400,225)
    S=Image.new('RGB',(tw*min(len(ims),10),(th+14)*((len(ims)+9)//10)),'white');D=ImageDraw.Draw(S)
    for k,(lab,f) in enumerate(ims):
        x=(k%10)*tw;y=(k//10)*(th+14);S.paste(Image.open(f).convert('RGB').resize((tw,th)),(x,y+14));D.text((x+2,y+1),lab,fill='red')
    S.save(f'check/cuts-{n}.jpg',quality=80);print(f'check/cuts-{n}.jpg')
