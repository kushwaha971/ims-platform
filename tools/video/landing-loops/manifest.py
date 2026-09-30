import json,subprocess,os
O='/home/claude/repo/frontend/public/media/landing'
def probe(f):
    j=json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate:format=duration,size','-of','json',f],capture_output=True,text=True).stdout)
    v=[s for s in j['streams'] if s['codec_type']=='video'][0]
    return v['width'],v['height'],round(float(j['format']['duration']),2),int(j['format']['size']),any(s['codec_type']=='audio' for s in j['streams'])
def avclevel(f):
    return int(subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=level','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip())
D={
'hero-desktop':("YourKhata on a computer: the dashboard with To collect and To pay totals, then Ramesh Traders' account where a ₹1,200 'You gave' entry is saved, then a GST tax invoice being filled in, then the issued invoice INV/26-27/0011.",
 "Dashboard, a money-owed entry, a GST bill and the finished invoice in one loop: ₹1,200 'You gave' updates the balance, and a 2-item bill totals ₹1,465 with CGST/SGST split automatically."),
'hero-mobile':("YourKhata on a phone: the dashboard, then a ₹1,200 'You gave' entry saved to Ramesh Traders' account, then the GST bill totals and the issued invoice.",
 "The same records and GST billing on mobile: note money owed in a few taps and issue a ₹1,465 tax invoice with CGST and SGST shown."),
'feat-khata':("Opening Ramesh Traders from the customer list and recording 'You gave ₹1,200' with a note; the balance updates to ₹1,200.",
 "Record money owed in seconds; the running balance updates the moment you save."),
'feat-reminder':("A customer statement, the Send reminder dialog with a ready WhatsApp message, and the Aging report bucketing dues by 0-30, 31-60, 61-90 and 90+ days.",
 "Send a statement or WhatsApp reminder from the customer's page and see who owes what, by age, on the Aging report."),
'feat-bill':("Filling a GST tax invoice for Ramesh Traders with two items; CGST and SGST are calculated automatically to a ₹1,465 grand total, then the issued invoice with Share on WhatsApp and Print options.",
 "GST invoices with CGST/SGST worked out for you, ready to print or share on WhatsApp."),
'feat-stock':("The Items list with a low-stock filter, an item's stock card and movements, and a stock adjustment for damaged goods.",
 "Track items and stock levels, spot low stock, and post stock adjustments."),
'feat-purchase':("Recording a purchase bill from Gupta Wholesale with GST, marking it paid, and paying the supplier against an open bill.",
 "Enter purchase bills with input GST and record supplier payments against them."),
'feat-reports':("The Reports hub, the Day book listing every entry with running cash and bank, and the GST summary with output tax, ITC and net GST payable.",
 "Day book and GST summary built from your everyday entries."),
'demo-desktop-720':("Full narrated walkthrough of YourKhata's Shop & billing module on desktop, in Hinglish with burned-in captions: login, customer accounts, reminders, stock, GST billing, purchases, expenses, reports, import and team.",
 "About {DDUR}-minute guided tour of every Shop & billing workflow on desktop."),
'demo-mobile':("Full narrated walkthrough of YourKhata's Shop & billing module on a phone, in Hinglish with burned-in captions: sign-up, shop setup, customer accounts, reminders, payments, stock, GST bill, purchases, expenses and reports.",
 "About {MDUR}-minute guided tour of Shop & billing on mobile."),
}
# per-variant overrides for alt where mobile footage differs
ALT_M={'feat-stock':"The Items list on a phone, filtered to low stock, then the Sugar 1kg stock card with reorder point and stock movements.",
 'feat-purchase':"Entering a purchase bill from Gupta Wholesale on a phone, then marking ₹2,100 paid to the supplier with the Paid now sheet.",
 'feat-khata':"Opening Ramesh Traders on a phone and recording 'You gave ₹1,200', then 'You got ₹500'; the running balance goes to ₹1,200 and then ₹700.",
 'feat-reminder':"On a phone: More actions, then Send reminder with a prefilled WhatsApp message, then the Aging report of dues by age.",
 'feat-bill':"Adding items to a GST bill on a phone; CGST and SGST fill in automatically to a ₹1,465 total, then the issued invoice with Share on WhatsApp.",
 'feat-reports':"On a phone: the Reports hub, the Day book with opening and closing cash, and the GST summary."}
CAP_M={'feat-stock':"See stock levels and low-stock items on your phone.",'feat-purchase':"Record purchase bills and supplier payments from your phone."}
assets=[]
names=['hero-desktop','hero-mobile']+[f'feat-{f}-{p}' for f in ['khata','reminder','bill','stock','purchase','reports'] for p in ['desktop','mobile']]
for n in names:
    key=n if n.startswith('hero') else n.rsplit('-',1)[0]
    alt,cap=D[key]
    if n.endswith('-mobile') and key in ALT_M: alt=ALT_M[key]
    if n.endswith('-mobile') and key in CAP_M: cap=CAP_M[key]
    srcs=[]
    for ext,mime in [('webm','video/webm; codecs=vp9'),('mp4',None)]:
        f=f'{O}/{n}.{ext}'
        if not os.path.exists(f): continue
        if mime is None: mime='video/mp4; codecs=avc1.4D40%02X'%avclevel(f)
        w,h,d,b,a=probe(f); srcs.append({'src':f'/media/landing/{n}.{ext}','type':mime,'bytes':b})
    if not srcs: continue
    assets.append({'id':n,'kind':'hero' if n.startswith('hero') else 'feature','device':'mobile' if 'mobile' in n else 'desktop',
      'width':w,'height':h,'duration':d,'fps':30,'loop':True,'audio':False,'sources':srcs,
      'bytes':sum(s['bytes'] for s in srcs),
      'poster':{'webp':f'/media/landing/{n}-poster.webp','jpg':f'/media/landing/{n}-poster.jpg',
                'bytes':{'webp':os.path.getsize(f'{O}/{n}-poster.webp'),'jpg':os.path.getsize(f'{O}/{n}-poster.jpg')}},
      'alt':alt,'caption':cap})
for n,vtt in [('demo-desktop-720','demo-desktop-720.vtt'),('demo-mobile','demo-mobile.vtt')]:
    f=f'{O}/{n}.mp4'
    if not os.path.exists(f): continue
    w,h,d,b,a=probe(f); alt,cap=D[n]
    cap=cap.replace('{DDUR}',str(round(d/60))).replace('{MDUR}',str(round(d/60)))
    assets.append({'id':n,'kind':'demo','device':'mobile' if 'mobile' in n else 'desktop','width':w,'height':h,'duration':d,'fps':30,'loop':False,'audio':a,
      'sources':[{'src':f'/media/landing/{n}.mp4','type':'video/mp4; codecs=avc1.4D40%02X, mp4a.40.2'%avclevel(f),'bytes':b}],'bytes':b,
      'poster':{'webp':f'/media/landing/{n}-poster.webp','jpg':f'/media/landing/{n}-poster.jpg','bytes':{'webp':os.path.getsize(f'{O}/{n}-poster.webp'),'jpg':os.path.getsize(f'{O}/{n}-poster.jpg')}},
      'captions':{'src':f'/media/landing/{vtt}','srclang':'hi-Latn','label':'Hinglish','burnedIn':True},
      'alt':alt,'caption':cap})
m={'version':1,'generated':'2026-09-29','note':'Silent loops cut from real YourKhata UI recordings (K-c logo build). Posters equal each loop\'s first frame. Emails are blurred in source; the UPI handle sharmastore.demo@example is seeded demo data (demo business Sharma General Store).','assets':assets}
json.dump(m,open(f'{O}/manifest.json','w'),indent=2,ensure_ascii=False)
print(len(assets),'assets')
for a in assets: print(a['id'],a['width'],a['height'],a['duration'],[s['bytes'] for s in a['sources']],a['poster']['bytes'])
