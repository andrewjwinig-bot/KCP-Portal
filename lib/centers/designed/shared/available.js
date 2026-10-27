/* Shared by every designed centre page (render.ts injects it after the page's
   own script): the on-demand leasing flyer (jsPDF) and the Available Space
   table, both built from SUITES — which the rent roll has already synced — so a
   suite that goes vacant on the roll appears here, and one that leases leaves. */
/* ---------- Leasing flyer (generated on demand) ---------- */
// Filled per centre from the portal by render.ts (name, address, live GLA,
// leading tenants off the synced roll, the leasing contact, flyer photos).
const PROPERTY=/*@PROPERTY@*/{};
// A suite's short label: "Suite 30" from addr text; a plan id otherwise
// (`addr: true` on Lafayette Hill means "the street line", not text).
const addrText=s=>typeof s.addr==="string"?s.addr.replace(/ ·.*/,""):"";
const shortLabel=s=>addrText(s)||s.id;
let _jspdf=null;
function loadJsPDF(){
  if(_jspdf)return _jspdf;
  _jspdf=new Promise((res,rej)=>{const sc=document.createElement("script");
    sc.src="/centers/_shared/jspdf-2.5.1.umd.min.js";
    sc.onload=()=>res(window.jspdf.jsPDF);sc.onerror=()=>{_jspdf=null;rej(new Error("jsPDF failed to load"))};document.head.append(sc)});
  return _jspdf;
}
const pngURL=async src=>{const i=await loadImg(src),c=document.createElement("canvas");c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext("2d").drawImage(i,0,0);return {url:c.toDataURL("image/png"),r:i.naturalHeight/i.naturalWidth}};
const loadImg=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
async function coverJPEG(src,w,h,fy=.5){const i=await loadImg(src),c=document.createElement("canvas");c.width=w;c.height=h;
  const r=Math.max(w/i.naturalWidth,h/i.naturalHeight),dw=i.naturalWidth*r,dh=i.naturalHeight*r;
  c.getContext("2d").drawImage(i,(w-dw)/2,Math.min(0,Math.max(h-dh,h/2-dh*fy)),dw,dh);return c.toDataURL("image/jpeg",.88)}
async function planWithSuite(s,aspect){
  let vb=ov.viewBox.baseVal,img=await loadImg(plan.querySelector("img").getAttribute("src"));
  let cw=vb.width,ch=vb.height;if(aspect&&vb.height*aspect<vb.width)cw=vb.height*aspect;else if(aspect)ch=vb.width/aspect;
  const scx=s.cx??s.x+s.w/2,scy=s.cy??s.y+s.h/2;
  const ox=Math.min(Math.max(scx-cw/2,vb.x),vb.x+vb.width-cw),oy=Math.min(Math.max(scy-ch/2,vb.y),vb.y+vb.height-ch);
  const W=1400,H=Math.round(W*ch/cw),k=W/cw,c=document.createElement("canvas");c.width=W;c.height=H;
  const g=c.getContext("2d"),sx=img.naturalWidth/vb.width;g.drawImage(img,(ox-vb.x)*sx,(oy-vb.y)*sx,cw*sx,ch*sx,0,0,W,H);
  vb={x:ox,y:oy,width:cw,height:ch};
  [].concat(s.pts||[`${s.x},${s.y} ${s.x+s.w},${s.y} ${s.x+s.w},${s.y+s.h} ${s.x},${s.y+s.h}`]).forEach(p=>{
    g.beginPath();p.trim().split(/\s+/).forEach((q,n)=>{const[x,y]=q.split(",").map(Number);const X=(x-vb.x)*k,Y=(y-vb.y)*k;n?g.lineTo(X,Y):g.moveTo(X,Y)});g.closePath();
    g.fillStyle="rgba(51,85,128,.62)";g.fill();g.lineWidth=5;g.strokeStyle="#0b1220";g.stroke()});
  const cx=((s.cx??s.x+s.w/2)-vb.x)*k,cy=((s.cy??s.y+s.h/2)-vb.y)*k;
  const lbl=shortLabel(s);let fs=44;g.font=`700 ${fs}px Helvetica, Arial, sans-serif`;
  const tw=g.measureText(lbl).width,room=s.w*k*0.86;if(tw>room)fs=Math.max(16,Math.floor(fs*room/tw));g.font=`700 ${fs}px Helvetica, Arial, sans-serif`;
  g.textAlign="center";g.textBaseline="middle";g.fillStyle="#fff";g.fillText(lbl,cx,cy);
  return {url:c.toDataURL("image/jpeg",.9),ratio:H/W}
}
const FONTS={XB:"/centers/_shared/fonts/BarlowCondensed-ExtraBold.ttf",MD:"/centers/_shared/fonts/BarlowCondensed-Medium.ttf",RG:"/centers/_shared/fonts/BarlowCondensed-Regular.ttf",LT:"/centers/_shared/fonts/BarlowCondensed-Light.ttf"};
let _fontData=null;
function loadFonts(){
  if(_fontData)return _fontData;
  _fontData=Promise.all(Object.entries(FONTS).map(async([k,u])=>{const b=new Uint8Array(await (await fetch(u)).arrayBuffer());let s="";for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return [k,u.split("/").pop(),btoa(s)]})).catch(e=>{_fontData=null;throw e});
  return _fontData;
}
async function buildFlyer(s){
  const [jsPDF,fonts]=await Promise.all([loadJsPDF(),loadFonts()]);
  const d=new jsPDF({unit:"pt",format:"letter",orientation:"landscape"}),W=792,H=612;
  fonts.forEach(([k,file,b64])=>{d.addFileToVFS(file,b64);d.addFont(file,"BC"+k,"normal")});
  const F=(k,sz)=>{d.setFont("BC"+k,"normal");d.setFontSize(sz)};
  const NAVY=[15,23,42],BLUE=[44,92,150],WHITE=[255,255,255],SILVER=[203,213,225],INK=[15,23,42];
  const suiteLabel=addrText(s)||(/^\d+$/.test(s.id)?s.id+" "+PROPERTY.street:"Unit "+s.id);
  const P=PROPERTY;
  // ---- icons (white strokes, 30pt box) ----
  const arc=(cx,cy,r,a0,a1,n=18)=>{const pts=[];for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}return pts};
  const poly=(pts,close)=>{for(let i=1;i<pts.length;i++)d.line(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);if(close)d.line(pts.at(-1)[0],pts.at(-1)[1],pts[0][0],pts[0][1])};
  const ICON={
    area:(x,y)=>{poly([[x+2,y+30],[x+30,y+30],[x+30,y+2]],true);poly([[x+14,y+30],[x+30,y+14]]);for(let i=1;i<5;i++)d.line(x+30-i*6,y+30,x+30-i*6,y+26)},
    parking:(x,y)=>{d.circle(x+16,y+16,15,"S");F("XB",19);d.setTextColor(...WHITE);d.text("P",x+16,y+23,{align:"center"})},
    pin:(x,y)=>{poly(arc(x+16,y+12,10,Math.PI*0.8,Math.PI*2.2));poly([[x+8,y+18.5],[x+16,y+31],[x+24,y+18.5]]);d.circle(x+16,y+12,3.5,"S");d.line(x+2,y+31,x+30,y+31)},
    bag:(x,y)=>{poly([[x+4,y+11],[x+28,y+11],[x+30,y+31],[x+2,y+31]],true);poly(arc(x+16,y+11,7,Math.PI,Math.PI*2))},
    car:(x,y)=>{poly([[x+3,y+22],[x+3,y+16],[x+8,y+8],[x+24,y+8],[x+29,y+16],[x+29,y+22]],true);d.circle(x+9,y+24,3,"S");d.circle(x+23,y+24,3,"S")},
    store:(x,y)=>{poly([[x+3,y+12],[x+6,y+3],[x+26,y+3],[x+29,y+12]],true);poly([[x+5,y+12],[x+5,y+30],[x+27,y+30],[x+27,y+12]]);poly([[x+13,y+30],[x+13,y+20],[x+19,y+20],[x+19,y+30]])}
  };
  const header=(txt,y0=0,h=40,col=NAVY)=>{d.setFillColor(...col);d.rect(0,y0,W,h,"F");F("LT",19);d.setTextColor(...WHITE);
    const tw=d.getTextWidth(txt)+txt.length*5.2;d.text(txt,W/2,y0+h/2+6.5,{align:"center",charSpace:5.2});
    d.setDrawColor(...SILVER);d.setLineWidth(.7);d.line(24,y0+h/2,W/2-tw/2-14,y0+h/2);d.line(W/2+tw/2+10,y0+h/2,W-24,y0+h/2)};
  const footer=async()=>{const fy=H-46;d.setFillColor(...NAVY);d.rect(0,fy,W,46,"F");
    try{const lg=await pngURL(PROPERTY.logo);d.addImage(lg.url,"PNG",30,fy+14,128,128*lg.r)}catch(e){}
    d.setDrawColor(...WHITE);d.setLineWidth(1);
    const cell=(x,icon,l1,l2)=>{icon(x,fy+13);F("RG",10.5);d.setTextColor(...WHITE);d.text(l1,x+28,fy+(l2?21:27));if(l2)d.text(l2,x+28,fy+33)};
    const ph=(x,y)=>{d.roundedRect(x+3,y+2,13,20,2.5,2.5,"S");d.line(x+7,y+18,x+12,y+18)};
    const pn=(x,y)=>{poly(arc(x+9,y+7,6.5,Math.PI*0.8,Math.PI*2.2));poly([[x+3.8,y+11],[x+9,y+20],[x+14.2,y+11]]);d.circle(x+9,y+7,2,"S")};
    const ml=(x,y)=>{d.rect(x+1,y+5,18,13,"S");poly([[x+1,y+5],[x+10,y+12],[x+19,y+5]])};
    cell(210,ph,P.contact.name,P.contact.phone);cell(380,pn,P.office[0],P.office[1]);cell(570,ml,P.contact.email,P.web)};
  const photo=async(src,x,y,w,h,fy=.5)=>{try{d.addImage(await coverJPEG(src,Math.round(w*2.2),Math.round(h*2.2),fy),"JPEG",x,y,w,h)}catch(e){}};
  // ================= PAGE 1 : property =================
  header(P.flyerTag||"RETAIL LEASING OPPORTUNITY");
  await photo(P.flyerHero,0,40,W,226,P.flyerHeroY);
  const by=266,bh=176;d.setFillColor(...BLUE);d.rect(0,by,W,bh,"F");
  // name block
  const nx=200;F("XB",64);d.setTextColor(...WHITE);d.text(P.flyerName[0],nx,by+76,{align:"center"});
  F("XB",34);d.text(P.flyerName[1],nx,by+118,{align:"center"});const n2=d.getTextWidth(P.flyerName[1]);
  d.setDrawColor(...WHITE);d.setLineWidth(1);d.line(nx-150,by+106,nx-n2/2-12,by+106);d.line(nx+n2/2+12,by+106,nx+150,by+106);
  F("RG",13);d.text(P.address.toUpperCase(),nx,by+148,{align:"center",charSpace:.4});
  // stat tiles 2x2
  d.setLineWidth(1.3);
  P.stats.slice(0,4).forEach((st,i)=>{const cx=430+(i%2)*190,cy=by+30+Math.floor(i/2)*72;d.setDrawColor(...WHITE);ICON[st.icon](cx,cy+2);
    const tx=cx+44+48;F("XB",st.big.length>9?21:25);d.setTextColor(...WHITE);const bl=d.splitTextToSize(st.big,110);d.text(bl,tx,cy+18,{align:"center",lineHeightFactor:.9});
    F("RG",11.5);d.text(d.splitTextToSize(st.small.toUpperCase(),120),tx,cy+18+bl.length*20+(bl.length>1?-4:0),{align:"center",lineHeightFactor:1})});
  // photo pair
  const py=by+bh,phh=H-46-py;await photo(P.flyerPhotos[0],0,py,W*0.4-3,phh);await photo(P.flyerPhotos[1],W*0.4+3,py,W*0.6-3,phh,.55);
  await footer();
  // ================= PAGE 2 : suite =================
  d.addPage("letter","landscape");
  const topH=250;d.setFillColor(...BLUE);d.rect(0,0,W,topH,"F");
  await photo(P.flyerPage2Bg||P.hero,0,topH,W,H-46-topH,.6);d.setFillColor(...NAVY);d.setGState(new d.GState({opacity:.55}));d.rect(0,topH,W,H-46-topH,"F");d.setGState(new d.GState({opacity:1}));
  const card=(x,y,w,h)=>{d.setFillColor(255,255,255);d.rect(x,y,w,h,"F")};
  // title row
  F("MD",13);d.setTextColor(...SILVER);d.text(P.name.toUpperCase()+"  ·  "+P.address.toUpperCase(),26,40,{charSpace:1});
  F("XB",46);d.setTextColor(...WHITE);d.text(suiteLabel.toUpperCase(),26,86);
  if(s.use){F("RG",15);d.setTextColor(...SILVER);d.text(s.use.replace(/&amp;/g,"&"),26,108)}
  const stats=[[s.sf?s.sf.toLocaleString("en-US"):"—","SQUARE FEET"],[s.possession||"Immediate","POSSESSION"],[s.rent||"Rent",s.rent?"PER SF":"UPON REQUEST"]];
  const sx0=420,cw=(W-26-sx0)/3;stats.forEach(([a,b],i)=>{const cx=sx0+cw*i+cw/2;F("XB",30);let f=30;while(d.getTextWidth(a)>cw-14&&f>16){f-=1;F("XB",f)}d.setTextColor(...WHITE);d.text(a,cx,74,{align:"center"});
    F("RG",12.5);d.text(b,cx,93,{align:"center",charSpace:.3});if(i){d.setDrawColor(...WHITE);d.setLineWidth(1);d.line(sx0+cw*i,48,sx0+cw*i,100)}});
  const ty=128,bot=H-46-22,lx=26,lw=480,rX=lx+lw+16,rW=W-26-rX;
  // right card: site plan
  const sh=bot-ty;card(rX,ty,rW,sh);
  try{const p=await planWithSuite(s,(rW-12)/(sh-34));d.addImage(p.url,"JPEG",rX+6,ty+6,rW-12,sh-34)}catch(e){}
  F("MD",11);d.setTextColor(...INK);d.text("SITE PLAN",rX+10,ty+sh-11,{charSpace:1.4});F("RG",10.5);d.setTextColor(100,116,139);d.text(suiteLabel+" highlighted",rX+rW-10,ty+sh-11,{align:"right"});
  const ly=ty;let lh=sh;
  if(s.floorplan){try{const fp=await loadImg(s.floorplan);const mw=lw-20,r=Math.min(mw/fp.naturalWidth,(sh-40)/fp.naturalHeight),iw=fp.naturalWidth*r,ih=fp.naturalHeight*r;lh=ih+44;var mh=ih;card(lx,ly,lw,lh);
      const c=document.createElement("canvas");c.width=fp.naturalWidth;c.height=fp.naturalHeight;const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(fp,0,0);
      d.addImage(c.toDataURL("image/jpeg",.92),"JPEG",lx+10+(mw-iw)/2,ly+10+(mh-ih)/2,iw,ih)}catch(e){}
    F("MD",11);d.setTextColor(...INK);d.text("FLOOR PLAN",lx+10,ly+lh-11,{charSpace:1.4});F("RG",10);d.setTextColor(100,116,139);d.text("Not to scale. Dimensions approximate.",lx+lw-10,ly+lh-11,{align:"right"});
  }else{F("RG",14);{let hh=74;P.highlights.forEach(h=>{hh+=d.splitTextToSize(h,lw-64).length*17+10});hh+=24+d.splitTextToSize(P.keyTenants,lw-48).length*17+40;lh=Math.min(sh,hh)}card(lx,ly,lw,lh);
    // no floor plan: highlights list in the card
    F("XB",22);d.setTextColor(...INK);d.text("Why "+P.name,lx+24,ly+44);
    let yy=ly+74;F("RG",14);P.highlights.forEach(h=>{const L=d.splitTextToSize(h,lw-64);d.setFillColor(...BLUE);d.rect(lx+24,yy-8,6,6,"F");d.setTextColor(...INK);d.text(L,lx+40,yy);yy+=L.length*17+10});
    yy+=6;F("MD",11);d.setTextColor(100,116,139);d.text("NEIGHBORS",lx+24,yy,{charSpace:1.4});F("RG",14);d.setTextColor(...INK);d.text(d.splitTextToSize(P.keyTenants,lw-48),lx+24,yy+18);
    F("RG",10);d.setTextColor(100,116,139);d.text("Floor plan available on request.",lx+lw-24,ly+lh-14,{align:"right"});
  }
  await footer();
  F("RG",7);d.setTextColor(148,163,184);d.text("Information deemed reliable but not guaranteed. Subject to change, prior lease or withdrawal without notice.",26,H-50-4);
  return d;
}
async function downloadFlyer(s,btn){
  const label=btn.textContent;btn.disabled=true;btn.textContent="Preparing flyer…";
  try{
    const d=await buildFlyer(s);
    const fname=`${PROPERTY.name} - ${shortLabel(s)} - Leasing Flyer.pdf`.replace(/[\/\\:*?"<>|]/g,"-");
    const dl=window.claude?await window.claude.use("downloads").catch(()=>null):null;
    if(dl){try{await dl.save({filename:fname,data:d.output("blob")})}catch(e){if(e&&e.code&&e.code!=="declined"&&e.code!=="rate_limited")d.save(fname)}}
    else d.save(fname);
  }catch(e){console.error(e);btn.textContent="Couldn't build flyer — try again";setTimeout(()=>{btn.textContent=label;btn.disabled=false},2500);return}
  btn.textContent=label;btn.disabled=false;
}

/* ---------- Available space table ---------- */
(function(){
  const av=SUITES.filter(x=>x.status==="available");if(!av.length)return;
  const box=document.getElementById("available"),rows=document.getElementById("arows");box.hidden=false;
  const lab=s=>(s.spaceName||addrText(s)||(/^\d+$/.test(s.id)?s.id+" "+PROPERTY.street:"Suite "+s.id));
  av.forEach((s,i)=>{
    const it=document.createElement("div");it.className="aitem";
    const pid="ap-"+i;
    it.innerHTML=`<button class="arow" type="button" aria-expanded="false" aria-controls="${pid}"><span class="chev" aria-hidden="true"></span><span><b>${lab(s)}</b></span><span>${s.sf?fmt(s.sf)+" SF":"Contact"}</span><span class="c-term">${s.term||"Negotiable"}</span><span class="c-rate">${s.rate||"Upon request"}</span><span class="c-use">${s.spaceUse||s.use.split(" · ")[0]}</span><span>${s.availableWhen||"Now"}</span></button>
      <div class="apanel" id="${pid}" role="region" aria-label="${lab(s)} details">
        <div class="fp${s.floorplan?"":" none"}">${s.floorplan?`<img src="${s.floorplan}" alt="Floor plan of ${lab(s)}" loading="lazy">`:"Floor plan available on request"}</div>
        <div><h4>${lab(s)} details</h4>
          ${(s.details&&s.details.length)?`<ul>${s.details.map(x=>`<li>${x}</li>`).join("")}</ul>`:""}
          <p class="meta"><span>Size <b>${s.sf?fmt(s.sf)+" SF":"Contact"}</b></span><span>Term <b>${s.term||"Negotiable"}</b></span><span>Rate <b>${s.rate||"Upon request"}</b></span>${s.condition?`<span>Condition <b>${s.condition}</b></span>`:""}</p>
          <div class="acts"><button class="abtn fly" type="button">Download leasing flyer</button><button class="abtn sec see" type="button">View on site plan</button></div>
          <p class="note">Contact ${PROPERTY.contact.name} at ${PROPERTY.contact.phone} or ${PROPERTY.contact.email} for a tour.</p>
        </div>
      </div>`;
    const head=it.querySelector(".arow");
    head.addEventListener("click",()=>{const o=it.classList.toggle("open");head.setAttribute("aria-expanded",o)});
    it.querySelector(".fly").addEventListener("click",e=>{e.stopPropagation();downloadFlyer(s,e.currentTarget)});
    it.querySelector(".see").addEventListener("click",e=>{e.stopPropagation();plan.scrollIntoView({behavior:"smooth",block:"center"});show(s.id,true)});
    rows.append(it);
    if(i===0){it.classList.add("open");head.setAttribute("aria-expanded","true")}
  });
})();
