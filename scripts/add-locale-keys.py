import json,sys
# usage: addkeys.py file.json json-of-keys
p=sys.argv[1]; new=json.loads(sys.argv[2])
d=json.load(open(p))
d.update(new)
open(p,'w').write(json.dumps(dict(sorted(d.items())),ensure_ascii=False,indent=2)+"\n")
