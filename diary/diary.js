const entries=JSON.parse(document.querySelector('#entries').textContent);
const dates=document.querySelector('#dates');
let current=0;
for(const [index,entry] of entries.entries()){
  const button=document.createElement('button');button.type='button';button.textContent=entry.date.replaceAll('-',' / ');button.setAttribute('aria-label',entry.date);button.addEventListener('click',()=>show(index));dates.append(button);
}
function show(index){
  current=index;const entry=entries[index];
  document.querySelector('#empty').hidden=!!entry;
  document.querySelector('#newer').disabled=!entry||index===0;
  document.querySelector('#older').disabled=!entry||index===entries.length-1;
  if(!entry)return;
  document.querySelector('#entry-date').textContent=entry.date.replaceAll('-',' / ');
  document.querySelector('#entry-date').dateTime=entry.date;
  document.querySelector('#entry-text').textContent=entry.text;
  const music=document.querySelector('#music');music.hidden=!entry.music;
  if(entry.music){music.href=entry.music;music.textContent=(entry.song||'音楽を聴く')+' ↗';}else music.removeAttribute('href');
  const photo=document.querySelector('#background');photo.hidden=!entry.photo;
  if(entry.photo)photo.src=entry.photo;else photo.removeAttribute('src');
  document.querySelector('#entry').classList.toggle('has-photo',!!entry.photo);
  [...dates.children].forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','date');else button.removeAttribute('aria-current');});
  dates.children[index]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
}
document.querySelector('#newer').addEventListener('click',()=>show(current-1));
document.querySelector('#older').addEventListener('click',()=>show(current+1));
show(0);
