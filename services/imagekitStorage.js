const PUBLIC_KEY = String(process.env.IMAGEKIT_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = String(process.env.IMAGEKIT_PRIVATE_KEY || '').trim();
const URL_ENDPOINT = String(process.env.IMAGEKIT_URL_ENDPOINT || '').trim().replace(/\/$/, '');
const UPLOAD_TIMEOUT_MS = Math.max(10000, Number(process.env.IMAGEKIT_UPLOAD_TIMEOUT_MS || 60000));
const DELETE_TIMEOUT_MS = Math.max(5000, Number(process.env.IMAGEKIT_DELETE_TIMEOUT_MS || 15000));

function isConfigured() { return Boolean(PUBLIC_KEY && PRIVATE_KEY && URL_ENDPOINT); }
function assertConfigured() {
  if (!isConfigured()) {
    const e = new Error('ImageKit storage is not configured. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT.');
    e.code='IMAGEKIT_NOT_CONFIGURED'; throw e;
  }
}
function safeSegment(v) { return String(v||'').trim().replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,120); }
function safeFolder(v) { return String(v||'').split('/').map(safeSegment).filter(Boolean).join('/').slice(0,240); }
function extFromMime(mime) { return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'})[String(mime||'').toLowerCase()] || 'bin'; }
function resolveFileName(name,mime){ const n=safeSegment(name)||`upload.${extFromMime(mime)}`; return n.includes('.')?n:`${n}.${extFromMime(mime)}`; }
function signal(ms){ const c=new AbortController(); const timer=setTimeout(()=>c.abort(),ms); return {signal:c.signal,clear:()=>clearTimeout(timer)}; }
async function uploadBuffer({buffer,fileName: originalFileName,folder,contentType,tags=[]}){
  assertConfigured(); if(!Buffer.isBuffer(buffer)||!buffer.length) throw new Error('Empty file buffer');
  const s=signal(UPLOAD_TIMEOUT_MS);
  try{
    const form=new FormData();
    form.append('file',new Blob([buffer],{type:contentType||'application/octet-stream'}));
    form.append('fileName',resolveFileName(originalFileName,contentType)); form.append('folder',`iptv/${safeFolder(folder)}`);
    form.append('useUniqueFileName','true'); form.append('overwriteFile','false'); if(tags.length) form.append('tags',tags.map(safeSegment).join(','));
    const auth=Buffer.from(`${PRIVATE_KEY}:`).toString('base64');
    const r=await fetch('https://upload.imagekit.io/api/v1/files/upload',{method:'POST',headers:{Authorization:`Basic ${auth}`},body:form,signal:s.signal});
    const text=await r.text(); let body={}; try{body=JSON.parse(text)}catch{}
    if(!r.ok) throw new Error(`ImageKit upload failed (${r.status}): ${String(body?.message||text).slice(0,500)}`);
    if(!body.url||!body.fileId) throw new Error('ImageKit returned an incomplete upload response');
    return {url:String(body.url),fileId:String(body.fileId),filePath:String(body.filePath||''),name:String(body.name||''),width:Number(body.width||0)||null,height:Number(body.height||0)||null,size:Number(body.size||buffer.length),mime:contentType||body.mime||''};
  }finally{s.clear()}
}
async function deleteFile(fileId){
  if(!isConfigured()||!fileId)return false; const s=signal(DELETE_TIMEOUT_MS);
  try{
    const auth=Buffer.from(`${PRIVATE_KEY}:`).toString('base64');
    const r=await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(String(fileId))}`,{method:'DELETE',headers:{Authorization:`Basic ${auth}`},signal:s.signal});
    if(r.status===404)return true; if(!r.ok) throw new Error(`ImageKit delete failed (${r.status})`); return true;
  }finally{s.clear()}
}
function isImageKitUrl(v){return /^https?:\/\/[^/]+\.imagekit\.io\//i.test(String(v||''));}
module.exports={isConfigured,assertConfigured,uploadBuffer,deleteFile,isImageKitUrl,URL_ENDPOINT};
