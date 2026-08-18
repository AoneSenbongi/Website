(()=>{'use strict';
const N={U:[0,1,0],D:[0,-1,0],R:[1,0,0],L:[-1,0,0],F:[0,0,1],B:[0,0,-1]};
const C={U:'#fff',D:'#ffd500',R:'#e53935',L:'#ff8a00',F:'#22b14c',B:'#1976ff'};
const KEY={S:'L',D:'F',F:'R',J:'B',K:'D',L:'U'};
const CYCLE=['D','R','F','U','L','B'];
const VIEW={D:{top:'B',left:'L',center:'D',right:'R',bottom:'F'},R:{top:'U',left:'D',center:'R',right:'F',bottom:'B'},F:{top:'U',left:'R',center:'F',right:'L',bottom:'D'},U:{top:'F',left:'L',center:'U',right:'R',bottom:'B'},L:{top:'U',left:'F',center:'L',right:'B',bottom:'D'},B:{top:'U',left:'R',center:'B',right:'L',bottom:'D'}};
const $=id=>document.getElementById(id), centerLabel=$('centerLabel'), prev=$('prevView'), next=$('nextView');
function add(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]]} function mul(v,s){return[v[0]*s,v[1]*s,v[2]*s]} function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]} function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]} function unit(i,v){const a=[0,0,0];a[i]=v;return a} function key(p,n){return p.join(',')+'|'+n.join(',')} function ax(v){return v.findIndex(x=>x!==0)}
function rot(v,a,t){let o=[...v];t=((t%4)+4)%4;for(let i=0;i<t;i++)o=add(cross(a,o),mul(a,dot(a,o)));return o}
function solved(){const a=[];for(const[f,n]of Object.entries(N)){const q=ax(n),ts=[0,1,2].filter(i=>i!==q);for(const x of[-1,0,1])for(const y of[-1,0,1])a.push({pos:add(n,add(unit(ts[0],x),unit(ts[1],y))),normal:[...n],color:f});}return a}
let stickers=solved(), center='D';
function state(){const m=new Map();for(const s of stickers)m.set(key(s.pos,s.normal),s.color);return m}
function cells(face,m){const n=N[face],q=ax(n),ts=[0,1,2].filter(i=>i!==q),out=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++){const p=add(n,add(unit(ts[0],c-1),unit(ts[1],1-r)));out.push(m.get(key(p,n))||face)}return out}
function draw(id,face,m){const el=$(id);el.textContent='';for(const f of cells(face,m)){const d=document.createElement('div');d.className='sticker';d.style.background=C[f]||'#777';el.appendChild(d)}}
function render(){const v=VIEW[center],m=state();draw('face-top',v.top,m);draw('face-left',v.left,m);draw('face-center',v.center,m);draw('face-right',v.right,m);draw('face-bottom',v.bottom,m);centerLabel.textContent=center}
function turn(face,inverse){const a=N[face],q=ax(a),fixed=a[q],t=inverse?1:3;for(const s of stickers){if(s.pos[q]!==fixed)continue;s.pos=rot(s.pos,a,t);s.normal=rot(s.normal,a,t)}render()}
function step(d){const i=CYCLE.indexOf(center);center=CYCLE[(i+d+CYCLE.length)%CYCLE.length];render()}
document.addEventListener('keydown',e=>{if(e.repeat)return;const k=e.key.toUpperCase();if(k==='E'){e.preventDefault();step(-1);return}if(k==='I'){e.preventDefault();step(1);return}const f=KEY[k];if(!f)return;e.preventDefault();turn(f,e.shiftKey)});
prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));render();
})();
