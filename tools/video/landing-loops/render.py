import json,sys,os,bisect,subprocess
from functools import lru_cache
from PIL import Image
FPS=30
W=os.path.dirname(os.path.abspath(__file__))
def load(base,ch):
    d=f'/home/claude/video/build/{base}/rec/{ch}'
    j=json.load(open(d+'/frames.json'));T0=j['t0']
    return d,[(f['t']-T0)/1000 for f in j['frames']],[f['file'] for f in j['frames']]
CAPS={}
def cap(ch):
    base='desktop' if ch.startswith('d') else 'mobile'
    if ch not in CAPS: CAPS[ch]=load(base,ch)
    return CAPS[ch]
OUT=None  # (w,h,kind)
@lru_cache(maxsize=64)
def img(ch,idx):
    d,ts,fs=cap(ch)
    im=Image.open(d+'/'+fs[idx]).convert('RGB')
    w,h,kind=OUT
    if kind=='desktop':
        # extend top row (header) by 120px to reach 16:10, keep full app width incl. sidebar
        c=Image.new('RGB',(1920,1200));band=im.crop((0,0,1920,1)).resize((1920,120))
        c.paste(band,(0,0));c.paste(im,(0,120));im=c
    if im.size!=(w,h): im=im.resize((w,h),Image.LANCZOS)
    return im
def seg_frames(s):
    ch=s['cap'];d,ts,fs=cap(ch);out=[]
    for a,b,sp in s['pieces']:
        n=round((b-a)/sp*FPS)
        for k in range(n):
            t=a+k*sp/FPS
            out.append((ch,max(0,bisect.bisect_right(ts,t)-1)))
    return out
def build(spec,loopxf):
    segs=[seg_frames(s) for s in spec]
    seq=[]  # list of (a,b,alpha) a,b = (ch,idx)
    for i,fr in enumerate(segs):
        if i==0: seq=[(f,None,0) for f in fr];continue
        n=round(spec[i-1].get('xf',0)*FPS)
        for k in range(n):
            a=seq[len(seq)-n+k][0];al=(k+1)/(n+1)
            seq[len(seq)-n+k]=(a,fr[k],al)
        seq+= [(f,None,0) for f in fr[n:]]
    D=round(loopxf*FPS)
    head=seq[:D];body=seq[D:]
    for k in range(D):
        idx=len(body)-D+k;a=body[idx][0];al=(k+1)/(D+1)
        body[idx]=(a,head[k][0],al)
    return body
def render(name,spec,loopxf,size,kind):
    global OUT;OUT=(size[0],size[1],kind);img.cache_clear()
    seq=build(spec,loopxf)
    mp=f'{W}/master/{name}.mkv'
    p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{size[0]}x{size[1]}','-r',str(FPS),'-i','-','-c:v','libx264rgb','-qp','0','-preset','ultrafast',mp],stdin=subprocess.PIPE)
    log=[]
    for i,(a,b,al) in enumerate(seq):
        im=img(*a)
        if b is not None and al>0: im=Image.blend(im,img(*b),al)
        if i==0: im.save(f'{W}/master/{name}-first.png')
        p.stdin.write(im.tobytes()); log.append((a,b,round(al,2)))
    p.stdin.close();p.wait()
    json.dump(log,open(f'{W}/master/{name}.log.json','w'))
    print(name,len(seq),'frames',len(seq)/FPS,'s')
if __name__=='__main__':
    specs=json.load(open(sys.argv[1]))
    only=sys.argv[2:] 
    for name,v in specs.items():
        if only and name not in only: continue
        render(name,v['segs'],v.get('loopxf',0.5),tuple(v['size']),v['kind'])
