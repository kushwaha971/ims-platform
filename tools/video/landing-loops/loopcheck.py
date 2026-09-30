import sys,subprocess,numpy as np
f=sys.argv[1]
out=subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=width,height','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip().split(',')
w,h=int(out[0]),int(out[1])
raw=subprocess.run(['ffmpeg','-v','error','-i',f,'-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
a=np.frombuffer(raw,np.uint8).reshape(-1,h,w).astype(np.int16)
d=np.abs(np.diff(a,axis=0)).mean(axis=(1,2))
wrap=np.abs(a[-1]-a[0]).mean()
means=a.mean(axis=(1,2))
print(f"{f.split('/')[-1]}: frames={len(a)} wrap_diff={wrap:.2f} median_step={np.median(d):.2f} p95_step={np.percentile(d,95):.2f} max_step={d.max():.2f}@{d.argmax()} min_luma={means.min():.0f}")
