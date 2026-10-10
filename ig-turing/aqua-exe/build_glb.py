"""Rebuild naviphone.glb: recolor red body pixels -> pearl pink, downsize textures. Original is untouched in assets-original/."""
import struct,json,io,sys,numpy as np
from PIL import Image
SRC='assets-original/naviphone.original.glb'; DST='public/models/naviphone.glb'
f=open(SRC,'rb');f.read(12)
cl,_=struct.unpack('<II',f.read(8));j=json.loads(f.read(cl))
bl,_=struct.unpack('<II',f.read(8));b=f.read(bl)
BASE={0,4,8,12}                      # baseColor maps (from material inspection)
MR={1,5,9,13}; NORMAL={3,7,11,15}; EMIS={2,6,10,14}
def recolor(im):
    a=np.asarray(im.convert('RGB'),dtype=np.float32)/255
    r,g,bb=a[...,0],a[...,1],a[...,2]
    mx=a.max(-1);mn=a.min(-1);d=mx-mn+1e-6
    h=np.where(mx==r,((g-bb)/d)%6,np.where(mx==g,(bb-r)/d+2,(r-g)/d+4))*60
    s=d/(mx+1e-6);v=mx
    # distance from crimson hue (~350deg), wrapped
    dh=np.abs(((h-350)+180)%360-180)
    sm=lambda x:np.clip(x,0,1)**2*(3-2*np.clip(x,0,1))
    m=(1-sm((dh-14)/22))*sm((s-0.22)/0.15)*sm((v-0.12)/0.1)   # soft red-only mask
    # target: pearl pink #F4B8D4 (hue~329). keep shading via value, lift & desaturate
    nh=np.full_like(h,329.0);ns=np.clip(s*0.36,0,1);nv=np.clip(v*1.55+0.12,0,1)
    c=nv*ns;x=c*(1-np.abs((nh/60)%2-1));mm=nv-c
    # hue 300..360 sector -> (c,0,x)
    R=c+mm;G=mm;B=x+mm
    new=np.stack([R,G,B],-1)
    out=a*(1-m[...,None])+new*m[...,None]
    print('  recolored %.1f%% of pixels'%(100*m.mean()))
    return Image.fromarray((out*255).astype(np.uint8))
def enc(i,im):
    if i in BASE:  sz=2048;im=im.resize((sz,sz),Image.LANCZOS);buf=io.BytesIO();im.convert('RGB').save(buf,'JPEG',quality=90);return buf.getvalue(),'image/jpeg'
    if i in MR:    im=im.convert('RGB').resize((1024,1024),Image.LANCZOS);buf=io.BytesIO();im.save(buf,'JPEG',quality=90);return buf.getvalue(),'image/jpeg'
    if i in NORMAL:im=im.convert('RGB').resize((1024,1024),Image.LANCZOS);buf=io.BytesIO();im.save(buf,'JPEG',quality=95);return buf.getvalue(),'image/jpeg'
    im=im.convert('RGB').resize((2048,2048),Image.LANCZOS);buf=io.BytesIO();im.save(buf,'PNG',optimize=True);return buf.getvalue(),'image/png'
repl={}
for i,imd in enumerate(j['images']):
    bv=j['bufferViews'][imd['bufferView']];o=bv.get('byteOffset',0)
    im=Image.open(io.BytesIO(b[o:o+bv['byteLength']]));im.load()
    print('image',i,im.size,im.mode,'->',end=' ')
    if i in BASE: im=recolor(im)
    else: print()
    data,mime=enc(i,im);repl[imd['bufferView']]=data;imd['mimeType']=mime
nb=bytearray()
for k,bv in enumerate(j['bufferViews']):
    o=bv.get('byteOffset',0);data=repl.get(k,b[o:o+bv['byteLength']])
    while len(nb)%4: nb.append(0)
    bv['byteOffset']=len(nb);bv['byteLength']=len(data);nb+=data
while len(nb)%4: nb.append(0)
j['buffers'][0]['byteLength']=len(nb)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((4-len(js)%4)%4)
out=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(nb))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(nb),0x004E4942)+bytes(nb)
open(DST,'wb').write(out);print('wrote',DST,len(out)//1024,'KB')
