/* ----- cielo y hora del día: la luz sigue la hora real ----- */
var HORA_FIJA=(typeof window.__HORA==='number')?window.__HORA:null;
function horaAhora(){if(HORA_FIJA!==null)return HORA_FIJA;var d=new Date();return d.getHours()+d.getMinutes()/60}
/* h, cielo arriba, cielo abajo, sol(color,int), hemi(cielo,suelo,int), noche */
var N0=[0x070a14,0x151a30,0x8fa6ff,.3,0x4a5a8a,0x15161c,.62,1];
var CLAVES=[[0].concat(N0),[5].concat(N0),
  [6.4,0x3d4766,0xe8946a,0xff9a5a,.55,0xd7ad94,0x3a2f2c,.58,.5],
  [8.2,0x86adc4,0xf6e3c2,0xffe7c4,.8,0xfff0dc,0x4a443c,.72,0],
  [13,0x8fb8cc,0xf7ecd6,0xfff4dc,.88,0xfff4e6,0x4d463d,.78,0],
  [17,0x8cafc3,0xf5e2c0,0xffe0b8,.82,0xffeedd,0x4a443c,.72,0],
  [18.9,0x45507c,0xf19a58,0xff9050,.6,0xd9a58a,0x3a2f2c,.58,.45],
  [20.4,0x10142a,0x3a2a3c,0x8fa6ff,.34,0x4a5a8a,0x15161c,.6,.95],
  [21.6].concat(N0),[24].concat(N0)];
var cA=new THREE.Color(),cB=new THREE.Color();
function mezcla(a,b,t){cA.setHex(a);cB.setHex(b);return cA.lerp(cB,t).clone()}
var CIELO={arriba:'#000',abajo:'#000',noche:0};
function estadoHora(h){
  var i=0;while(i<CLAVES.length-2&&h>=CLAVES[i+1][0])i++;var a=CLAVES[i],b=CLAVES[i+1],t=Math.max(0,Math.min(1,(h-a[0])/(b[0]-a[0])));t=t*t*(3-2*t);
  return {arriba:mezcla(a[1],b[1],t),abajo:mezcla(a[2],b[2],t),sol:mezcla(a[3],b[3],t),solI:a[4]+(b[4]-a[4])*t,hc:mezcla(a[5],b[5],t),hs:mezcla(a[6],b[6],t),hi:a[7]+(b[7]-a[7])*t,noche:a[8]+(b[8]-a[8])*t};
}
var cielo=document.createElement('canvas');cielo.id='cielo';cielo.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
canvas.parentNode.insertBefore(cielo,canvas);
var NUBES_FONDO=(function(){var s=RN(4),a=[];for(var i=0;i<26;i++)a.push([s(),s(),.1+s()*.22,.03+s()*.05]);return a})();
function pintarCielo(){
  var w=innerWidth,h=innerHeight,dpr=1;if(cielo.width!==w||cielo.height!==h){cielo.width=w;cielo.height=h}
  var g=cielo.getContext('2d'),E=ESTADO_CIELO;
  var gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#'+E.arriba.getHexString());gr.addColorStop(.72,'#'+E.abajo.getHexString());gr.addColorStop(1,'#'+E.arriba.clone().lerp(E.abajo,.5).getHexString());g.fillStyle=gr;g.fillRect(0,0,w,h);
  var n=E.noche,sr=RN(11);
  if(n>.05){for(var i=0;i<130;i++){var x=sr()*w,y=sr()*h*.8,r=.4+sr()*1.3,tw=.5+.5*Math.sin(i*3.1+performance.now()/900*(.4+sr()));g.fillStyle='rgba(255,246,225,'+(n*(.35+.5*tw)*(1-y/h*.8)).toFixed(3)+')';g.beginPath();g.arc(x,y,r,0,7);g.fill()}}
  /* sol o luna */
  var hh=ESTADO_CIELO.h,dia=hh>6&&hh<19.5,pos=dia?(hh-6)/13.5:((hh>=19.5?hh-19.5:hh+4.5)/9);
  var cx=w*(.12+.76*pos),cyy=h*(.34-.2*Math.sin(Math.PI*Math.min(1,Math.max(0,pos))));
  var rg=g.createRadialGradient(cx,cyy,0,cx,cyy,Math.max(w,h)*.22);
  if(dia){rg.addColorStop(0,'rgba(255,236,190,.85)');rg.addColorStop(.12,'rgba(255,225,170,.35)');rg.addColorStop(1,'rgba(255,225,170,0)');g.fillStyle=rg;g.fillRect(0,0,w,h);g.fillStyle='rgba(255,247,226,.95)';g.beginPath();g.arc(cx,cyy,Math.min(w,h)*.035,0,7);g.fill()}
  else{rg.addColorStop(0,'rgba(190,205,255,.35)');rg.addColorStop(.2,'rgba(150,170,230,.12)');rg.addColorStop(1,'rgba(150,170,230,0)');g.fillStyle=rg;g.fillRect(0,0,w,h);g.fillStyle='rgba(236,238,250,.95)';g.beginPath();g.arc(cx,cyy,Math.min(w,h)*.03,0,7);g.fill();g.fillStyle='rgba(180,190,215,.45)';[[.3,-.2,.25],[-.3,.3,.18],[.1,.5,.2]].forEach(function(c){g.beginPath();g.arc(cx+c[0]*Math.min(w,h)*.03,cyy+c[1]*Math.min(w,h)*.03,c[2]*Math.min(w,h)*.03,0,7);g.fill()})}
  /* mar de nubes abajo: la isla flota */
  var base=mezcla(0xf4ead6,0x2b2c4a,n).getHexString(),sombra=mezcla(0xcbbfa6,0x161a30,n).getHexString();
  NUBES_FONDO.forEach(function(c,i){var cx2=((c[0]*1.3+performance.now()/1000/(70+i*9))%1.3-.15)*w,cy2=h*(.74+c[1]*.4),rw=w*c[2],rh=rw*.28;
    var q=g.createRadialGradient(cx2,cy2,0,cx2,cy2,rw);q.addColorStop(0,'rgba('+parseInt(base.slice(0,2),16)+','+parseInt(base.slice(2,4),16)+','+parseInt(base.slice(4,6),16)+','+(c[3]*5).toFixed(2)+')');q.addColorStop(1,'rgba('+parseInt(sombra.slice(0,2),16)+','+parseInt(sombra.slice(2,4),16)+','+parseInt(sombra.slice(4,6),16)+',0)');
    g.save();g.translate(cx2,cy2);g.scale(1,rh/rw);g.translate(-cx2,-cy2);g.fillStyle=q;g.beginPath();g.arc(cx2,cy2,rw,0,7);g.fill();g.restore()});
  /* velo bordó muy suave detrás de la isla: identidad de marca */
  var v=g.createRadialGradient(w*.5,h*.52,0,w*.5,h*.52,Math.max(w,h)*.55);v.addColorStop(0,'rgba(139,42,54,'+(.10+.1*n).toFixed(3)+')');v.addColorStop(1,'rgba(139,42,54,0)');g.fillStyle=v;g.fillRect(0,0,w,h);
}
var ESTADO_CIELO={h:12,arriba:new THREE.Color(),abajo:new THREE.Color(),noche:0};
function actualizarCielo(){
  var h=horaAhora(),E=estadoHora(h);E.h=h;ESTADO_CIELO=E;NOCHE=E.noche;
  hemi.color.copy(E.hc);hemi.groundColor.copy(E.hs);hemi.intensity=E.hi;
  sol.color.copy(E.sol);sol.intensity=E.solI;
  var dia=h>5.5&&h<20.5,ang=Math.PI*Math.min(1,Math.max(0,(h-6)/14));
  sol.position.set(-14+(h-13)*1.4,dia?9+15*Math.sin(ang):13,10+(dia?0:-3));
  FACH.forEach(function(f){f.mat.emissiveIntensity=NOCHE*1.15});
  BRILLOS.forEach(function(m){m.opacity=Math.min(1,NOCHE*1.25)});
  LUZ_MAT.forEach(function(m){m.color.setHex(0xf3d28b).multiplyScalar(.55+.55*NOCHE)});
  FAROLES.forEach(function(m){m.color.setHex(0xffe3b0).multiplyScalar(.5+.6*NOCHE)});
  document.getElementById('app').classList.toggle('noche',NOCHE>.5);
  pintarCielo();
}
var FAROLES=[],ESTATICOS=[];

/* ----- suelo: césped, caminos, adoquines, estacionamiento, estanque ----- */
var MUN=14.5,ESTANQUE={x:-10.2,z:-9.6,r:2.5},CHAPA={x:-3.6,z:12.1};
function xs(v){return (v+MUN)/(2*MUN)*SZ}
var SZ=2048;
function texSuelo(){
  var c=document.createElement('canvas');c.width=c.height=SZ;var g=c.getContext('2d'),i,j,u=SZ/(2*MUN),s=RN(7);
  g.fillStyle='#78805e';g.fillRect(0,0,SZ,SZ);
  /* manchones de color: el césped no es plano */
  var tonos=['rgba(104,116,78,.5)','rgba(140,148,100,.4)','rgba(92,104,70,.45)','rgba(160,160,112,.28)','rgba(120,130,86,.4)'];
  for(i=0;i<320;i++){var px=s()*SZ,pz=s()*SZ,r=(.7+s()*2.2)*u,q=g.createRadialGradient(px,pz,0,px,pz,r);q.addColorStop(0,tonos[i%5]);q.addColorStop(1,'rgba(120,128,90,0)');g.fillStyle=q;g.beginPath();g.arc(px,pz,r,0,7);g.fill()}
  for(i=0;i<5200;i++){var tx=s()*SZ,tz=s()*SZ;g.strokeStyle=s()<.5?'rgba(150,164,104,.55)':'rgba(70,84,52,.45)';g.lineWidth=1.4;g.beginPath();g.moveTo(tx,tz);g.lineTo(tx+(s()-.5)*5,tz-4-s()*6);g.stroke()}
  function adoq(x1,z1,x2,z2,w){var L=Math.hypot(x2-x1,z2-z1),dx=(x2-x1)/L,dz=(z2-z1)/L;
    g.lineCap='butt';g.strokeStyle='#ece8e1';g.lineWidth=(w+.3)*u;g.beginPath();g.moveTo(xs(x1),xs(z1));g.lineTo(xs(x2),xs(z2));g.stroke();
    g.strokeStyle='#d6c9ae';g.lineWidth=w*u;g.stroke();
    for(var t=0;t<L;t+=.42){var o=(Math.floor(t/.42)%2)*.2;for(var k=-w/2+.05;k<w/2;k+=.4){var cx=x1+dx*t-dz*(k+o),cz=z1+dz*t+dx*(k+o);
      var sh=.94+s()*.1;g.fillStyle='rgba('+Math.round(214*sh)+','+Math.round(201*sh)+','+Math.round(174*sh)+',1)';g.fillRect(xs(cx)-.17*u,xs(cz)-.17*u,.34*u,.34*u)}}
    g.strokeStyle='rgba(120,108,86,.35)';g.lineWidth=1;for(t=0;t<L;t+=.42){g.beginPath();g.moveTo(xs(x1+dx*t-dz*w/2),xs(z1+dz*t+dx*w/2));g.lineTo(xs(x1+dx*t+dz*w/2),xs(z1+dz*t-dx*w/2));g.stroke()}}
  /* plaza redonda de adoquines con el isotipo al centro del anillo */
  var cxp=xs(0),R=5.3*u;
  g.fillStyle='#ece8e1';g.beginPath();g.arc(cxp,cxp,R+.2*u,0,7);g.fill();
  for(var a=0;a<7;a+=.045){for(var rr=3.9;rr<5.3;rr+=.34){var sh2=.93+s()*.12;g.fillStyle='rgb('+Math.round(214*sh2)+','+Math.round(200*sh2)+','+Math.round(172*sh2)+')';var ax=Math.cos(a)*rr,az=Math.sin(a)*rr;g.save();g.translate(xs(ax),xs(az));g.rotate(a);g.fillRect(-.15*u,-.15*u,.3*u,.3*u);g.restore()}}
  g.strokeStyle='#8b2a36';g.lineWidth=.16*u;g.beginPath();g.arc(cxp,cxp,4.1*u,0,7);g.stroke();
  g.fillStyle='#3a3835';g.beginPath();g.arc(cxp,cxp,3.9*u,0,7);g.fill();
  g.fillStyle='#4a4743';for(i=0;i<260;i++){var aa=s()*7,rr2=Math.sqrt(s())*3.8;g.fillRect(xs(Math.cos(aa)*rr2),xs(Math.sin(aa)*rr2),2,2)}
  ORDEN.forEach(function(k){if(k==='hq')return;var e=EDIF[k],l=Math.hypot(e.x,e.z),dx=e.x/l,dz=e.z/l;adoq(dx*4.9,dz*4.9,e.x-dx*1.1,e.z-dz*1.1,1.4)});
  /* estacionamiento del almacén */
  g.fillStyle='#34322f';g.fillRect(xs(CHAPA.x-2.3),xs(CHAPA.z-1.5),4.6*u,3.2*u);ruido(g,SZ,SZ,0,'#000','#000',1);
  g.fillStyle='rgba(255,255,255,.04)';for(i=0;i<500;i++)g.fillRect(xs(CHAPA.x-2.3)+s()*4.6*u,xs(CHAPA.z-1.5)+s()*3.2*u,2,2);
  g.strokeStyle='rgba(236,232,225,.75)';g.lineWidth=.07*u;g.strokeRect(xs(CHAPA.x-2.3)+.1*u,xs(CHAPA.z-1.5)+.1*u,4.4*u,3*u);
  for(i=1;i<3;i++){g.beginPath();g.moveTo(xs(CHAPA.x-2.3+i*1.53),xs(CHAPA.z-1.5)+.1*u);g.lineTo(xs(CHAPA.x-2.3+i*1.53),xs(CHAPA.z+1.5));g.stroke()}
  adoq(CHAPA.x+2.3,CHAPA.z,EDIF.deposito.x-2.4,EDIF.deposito.z+1.6,1.2);
  /* estanque: orilla de barro */
  var pr=ESTANQUE.r*u;var q=g.createRadialGradient(xs(ESTANQUE.x),xs(ESTANQUE.z),pr*.8,xs(ESTANQUE.x),xs(ESTANQUE.z),pr*1.35);q.addColorStop(0,'rgba(92,76,56,1)');q.addColorStop(1,'rgba(92,76,56,0)');g.fillStyle=q;g.beginPath();g.arc(xs(ESTANQUE.x),xs(ESTANQUE.z),pr*1.35,0,7);g.fill();
  /* flores sueltas en el pasto */
  var fl=['#8b2a36','#cdbfa6','#ece8e1','#b58a3f','#a8505a'];
  for(i=0;i<420;i++){var fx=(s()*2-1)*(MUN-1),fz=(s()*2-1)*(MUN-1);if(Math.hypot(fx,fz)<5.6)continue;g.fillStyle=fl[i%5];g.beginPath();g.arc(xs(fx),xs(fz),1.5+s()*1.6,0,7);g.fill()}
  var t=new THREE.CanvasTexture(c);t.anisotropy=8;return t;
}
var TIERRA=texRep(256,128,function(g,w,h){var s=RN(12);g.fillStyle='#4d3d2e';g.fillRect(0,0,w,h);var cols=['#5a4635','#46372a','#6b5440','#3b2f25','#52412f'];
  for(var y=0,k=0;y<h;y+=7+s()*10,k++){g.fillStyle=cols[k%5];g.fillRect(0,y,w,5+s()*8)}for(var i=0;i<220;i++){g.fillStyle=s()<.5?'rgba(0,0,0,.25)':'rgba(255,255,255,.07)';g.fillRect(s()*w,s()*h,2+s()*5,2+s()*3)}
  var gr=g.createLinearGradient(0,0,0,16);gr.addColorStop(0,'#6f7a54');gr.addColorStop(1,'rgba(111,122,84,0)');g.fillStyle=gr;g.fillRect(0,0,w,16);
  for(var x=0;x<w;x+=5){g.fillStyle='#6f7a54';g.fillRect(x,0,3,5+s()*8)}});
(function(){
  var sup=new THREE.MeshLambertMaterial({map:texSuelo()}),lado=new THREE.MeshLambertMaterial({map:TIERRA});TIERRA.repeat.set(6,1);
  var top=new THREE.Mesh(new THREE.BoxGeometry(2*MUN,.5,2*MUN),[lado,lado,sup,M(0x161513),lado,lado]);
  top.position.y=-.25;top.receiveShadow=true;scene.add(top);
  var ge=new THREE.CylinderGeometry(MUN*Math.SQRT2*.93,MUN*Math.SQRT2*.5,4.2,4,1);ge.rotateY(Math.PI/4);
  var base=new THREE.Mesh(ge,MF(0x3a312b));base.position.y=-2.6;scene.add(base);
  /* rocas y raíces colgando */
  var s=RN(41);for(var i=0;i<16;i++){var a=s()*Math.PI*2,rr=(.15+s()*.55)*MUN,hh=1.4+s()*3.6,cn=new THREE.Mesh(new THREE.ConeGeometry(.5+s()*.9,hh,5),MF(i%3?0x312a25:0x453b33));cn.rotation.x=Math.PI;cn.position.set(Math.cos(a)*rr,-4.3-hh/2+.4,Math.sin(a)*rr);scene.add(cn)}
  var borde=new THREE.Mesh(new THREE.BoxGeometry(2*MUN+.5,.2,2*MUN+.5),new THREE.MeshBasicMaterial({color:0x8b2a36}));borde.position.y=-.55;scene.add(borde);
  var borde2=new THREE.Mesh(new THREE.BoxGeometry(2*MUN+.54,.06,2*MUN+.54),new THREE.MeshBasicMaterial({color:0xcdbfa6}));borde2.position.y=-.4;scene.add(borde2);
})();

/* ----- estanque con patos, juncos y un muelle ----- */
var AGUA=null,PATOS=[],ONDAS=[];
(function(){
  var g=new THREE.Group();g.position.set(ESTANQUE.x,0,ESTANQUE.z);scene.add(g);
  var L=lienzo(256,256,function(c,w,h){var r=c.createRadialGradient(128,128,10,128,128,128);r.addColorStop(0,'#6fa0a8');r.addColorStop(.7,'#4f808a');r.addColorStop(1,'#3d6670');c.fillStyle=r;c.beginPath();c.arc(128,128,128,0,7);c.fill();
    c.strokeStyle='rgba(255,255,255,.22)';c.lineWidth=2;var s=RN(5);for(var i=0;i<14;i++){var x=40+s()*170,y=40+s()*170;c.beginPath();c.arc(x,y,8+s()*16,Math.PI*.1,Math.PI*.8);c.stroke()}});
  var a=new THREE.Mesh(new THREE.CircleGeometry(ESTANQUE.r,40),new THREE.MeshLambertMaterial({map:L.t,emissive:0x1a2c33}));a.rotation.x=-Math.PI/2;a.position.y=.03;a.receiveShadow=true;g.add(a);AGUA=a;
  /* piedras en la orilla */
  var s=RN(88);for(var i=0;i<22;i++){var an=i/22*Math.PI*2+s()*.2,r=ESTANQUE.r+.1+s()*.25;poli(g,.18+s()*.2,s()<.5?0x8c8378:0xa59d8f,Math.cos(an)*r,.1,Math.sin(an)*r,{borde:false},[1,.7,1])}
  /* juncos */
  for(i=0;i<18;i++){var an2=2.3+s()*2.6,r2=ESTANQUE.r-.2+s()*.5;var j=new THREE.Group();j.position.set(Math.cos(an2)*r2,0,Math.sin(an2)*r2);g.add(j);
    for(var k=0;k<4;k++){var c1=cono(j,.045,.7+s()*.6,0x6c7a4a,(s()-.5)*.25,0,(s()-.5)*.25,4,{borde:false});c1.rotation.z=(s()-.5)*.3}cy(j,.05,.05,.28,0x7b4e32,0,.65,0,6,{borde:false})}
  /* nenúfares */
  for(i=0;i<8;i++){var an3=s()*7,r3=s()*(ESTANQUE.r-.6);var n=new THREE.Mesh(new THREE.CircleGeometry(.2+s()*.12,10,0,5.4),M(0x5d7a50));n.rotation.x=-Math.PI/2;n.position.set(Math.cos(an3)*r3,.05,Math.sin(an3)*r3);g.add(n)}
  /* muelle de madera */
  var mt=matTex(T.madera(0x9c7a52),1.2);
  for(i=0;i<6;i++)bx(g,1.0,.08,.34,mt,ESTANQUE.r*.2+i*.35,.28,2.1-ESTANQUE.r*.0-.5,{borde:false});
  for(i=0;i<6;i++){bx(g,.07,.3,.07,0x5a4330,ESTANQUE.r*.2+i*.35,0,-1.9,{borde:false})}
  /* patos que nadan en ronda */
  function pato(col){var p=new THREE.Group();esf(p,.17,col,0,.12,0,{borde:false}).scale.set(1.3,.9,1);esf(p,.1,0x2f5d46,.2,.3,0,{borde:false});var pico=bx(p,.1,.04,.06,0xe39b3a,.31,.27,0,{borde:false});g.add(p);return p}
  [[0.25,.8,0xece8e1],[0.5,.62,0xcdbfa6],[0.8,.5,0xece8e1]].forEach(function(q,i){var p=pato(q[2]);p.userData={r:q[1]*ESTANQUE.r,v:.22+i*.07,f:i*2.1,noFusion:true};PATOS.push(p)});
  /* ondas */
  for(i=0;i<3;i++){var o=new THREE.Mesh(new THREE.RingGeometry(.2,.26,24),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.0}));o.rotation.x=-Math.PI/2;o.userData.noFusion=true;o.position.set((s()-.5)*2,.05,(s()-.5)*2);g.add(o);ONDAS.push({m:o,f:i*1.7})}
  a.userData.noFusion=true;ESTANQUE.grupo=g;
  ANIM.push(function(t){
    PATOS.forEach(function(p){var u=p.userData,a=t*u.v+u.f;p.position.set(Math.cos(a)*u.r,.02+Math.sin(t*2+u.f)*.01,Math.sin(a)*u.r);p.rotation.y=-a-Math.PI/2*-1+Math.PI});
    ONDAS.forEach(function(o){var k=((t+o.f)%3.4)/3.4;o.m.scale.setScalar(1+k*5);o.m.material.opacity=.35*(1-k)});
  });
})();

/* ----- árboles y vegetación: variedad, no un pino repetido ----- */
function pino(g,s,r){cy(g,.13,.17,.6,0x3b332b,0,0,0,6,{borde:false});var v=r<.5?[0x3f5a46,0x4d6c53,0x5f8264]:[0x46603f,0x587648,0x6f8a58];
  [[.85,1.2,.5,v[0]],[.65,1.05,1.2,v[1]],[.42,.85,1.85,v[2]]].forEach(function(c){var m=cono(g,c[0],c[1],MF(c[3]),0,c[2],0,7,{borde:false})})}
function roble(g,s,r){cy(g,.16,.22,1.05,0x4a3b2a,0,0,0,6,{borde:false});var v=[0x6f8a58,0x8a9a5a,0x5d7a50,0x7c9461][Math.floor(r*4)%4];
  poli(g,.95,v,0,1.75,0,{borde:false},[1,.9,1]);poli(g,.65,v+0x0a0a08,.5,1.45,.25);poli(g,.6,v-0x080808,-.5,1.5,-.2);poli(g,.55,v+0x0c0c08,.1,2.3,-.1)}
function ciruelo(g,s,r){cy(g,.13,.2,1.0,0x4a3b2a,0,0,0,6,{borde:false});[[.85,1.7,0,0],[.6,1.45,.55,.2],[.55,1.55,-.5,-.2],[.5,2.25,0,0]].forEach(function(c,i){poli(g,c[0],i%2?0xa8505a:0xb8666e,c[2],c[1],c[3],{borde:false})})}
function abedul(g,s,r){cy(g,.07,.1,1.9,0xe9e4d8,0,0,0,6,{borde:false});for(var i=0;i<5;i++)bx(g,.18,.03,.18,0x2a2724,0,.3+i*.35,0,{borde:false});poli(g,.55,0x9aad63,0,2.0,0,{borde:false},[1,1.2,1]);poli(g,.42,0xb4c070,.25,1.6,.1);poli(g,.4,0x86a05a,-.25,1.7,-.1)}
function arbusto(g,s,r){poli(g,.42,[0x5d7a50,0x6f8a58,0x4f6b46][Math.floor(r*3)%3],0,.3,0,{borde:false},[1.2,.8,1]);poli(g,.3,0x6f8a58,.3,.22,.2);if(r>.6){[0,1,2,3].forEach(function(i){esf(g,.07,[0x8b2a36,0xece8e1,0xcdbfa6,0xb58a3f][i],Math.cos(i*1.7)*.4,.4+((i*3)%4)*.05,Math.sin(i*1.7)*.38,{borde:false})})}}
function roca(g,s,r){poli(g,.4,0x8c8378,0,.22,0,{borde:false},[1.3,.8,1]);poli(g,.25,0xa59d8f,.4,.12,.2)}
function troncoCaido(g){cy(g,.13,.13,1.3,0x5a4330,0,0,0,7,{borde:false}).rotation.z=Math.PI/2;g.children[0].position.y=.13}
var DEC={pino:pino,roble:roble,ciruelo:ciruelo,abedul:abedul,arbusto:arbusto,roca:roca};
function libre(x,z){
  var ok=Math.abs(x)<MUN-1.2&&Math.abs(z)<MUN-1.2;
  ORDEN.forEach(function(k){var e=EDIF[k],rad=k==='hq'?5.7:(k==='deposito'||k==='diseno'||k==='recepcion'?4.8:4.0);if(Math.hypot(x-e.x,z-e.z)<rad)ok=false;if(k!=='hq'){var l=Math.hypot(e.x,e.z),dx=e.x/l,dz=e.z/l,px=x-dx*5.1,pz=z-dz*5.1;var pr=px*dx+pz*dz,pe=Math.abs(-px*dz+pz*dx);if(pr>-1&&pr<l-6.3&&pe<1.9)ok=false}});
  if(Math.hypot(x-ESTANQUE.x,z-ESTANQUE.z)<ESTANQUE.r+1.1)ok=false;
  if(Math.abs(x-CHAPA.x)<3.4&&Math.abs(z-CHAPA.z)<2.4)ok=false;
  return ok}
var ARBOLES=[];
(function(){
  var rnd=RN(3),n=0,tries=0,tipos=['pino','pino','roble','roble','ciruelo','abedul','arbusto','arbusto','arbusto','roca'];
  while(n<62&&tries<1800){tries++;var x=(rnd()*2-1)*(MUN-1.2),z=(rnd()*2-1)*(MUN-1.2);if(!libre(x,z))continue;
    var tipo=tipos[Math.floor(rnd()*tipos.length)];if(tipo==='pino'&&Math.hypot(x,z)<8&&rnd()<.5)continue;
    n++;var t=new THREE.Group();t.position.set(x,0,z);var s=.75+rnd()*.6;t.scale.setScalar(tipo==='arbusto'||tipo==='roca'?s:s*1.05);t.rotation.y=rnd()*6;scene.add(t);DEC[tipo](t,s,rnd());ARBOLES.push(t)}
  var tc=new THREE.Group();tc.position.set(-6.4,0,-5.6);scene.add(tc);troncoCaido(tc);ARBOLES.push(tc);
})();

/* ----- faroles, bancos, vallas, banderines: la vida de la plaza ----- */
function farol(x,z,alto){var l=new THREE.Group();l.position.set(x,0,z);scene.add(l);ESTATICOS.push(l);alto=alto||1.9;
  cy(l,.08,.11,alto,0x24221f,0,0,0,6,{borde:false});bx(l,.34,.07,.34,0x24221f,0,alto,0,{borde:false});
  var b=new THREE.Mesh(new THREE.BoxGeometry(.24,.3,.24),new THREE.MeshBasicMaterial({color:0xffe3b0}));b.position.y=alto+.2;l.add(b);FAROLES.push(b.material);
  cono(l,.22,.2,0x24221f,0,alto+.34,0,4,{borde:false});brillo(l,0,alto+.2,0,1.9);return l}
function banco(x,z,ry){var b=new THREE.Group();b.position.set(x,0,z);b.rotation.y=ry||0;scene.add(b);ESTATICOS.push(b);var mt=matTex(T.madera(0x9c7a52),1.5);
  bx(b,1.2,.08,.38,mt,0,.4,0,{borde:false});bx(b,1.2,.34,.06,mt,0,.55,-.2,{borde:false});[-.5,.5].forEach(function(px){bx(b,.07,.4,.34,0x2a2724,px,0,0,{borde:false})});return b}
/* banderines: una soga con triángulos de los colores de la marca */
function banderines(g,a,b,caida,cols){var n=14,s=new THREE.Group();g.add(s);var pts=[];
  for(var i=0;i<=n;i++){var t=i/n;pts.push(new THREE.Vector3(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t-Math.sin(t*Math.PI)*caida,a[2]+(b[2]-a[2])*t))}
  s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x2a2724})));
  for(i=0;i<n;i++){var p=pts[i],q=pts[i+1],geo=new THREE.BufferGeometry(),mx=(p.x+q.x)/2,my=(p.y+q.y)/2,mz=(p.z+q.z)/2;
    geo.setAttribute('position',new THREE.Float32BufferAttribute([p.x,p.y,p.z,q.x,q.y,q.z,mx,my-.36,mz],3));geo.computeVertexNormals();
    s.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:cols[i%cols.length],side:THREE.DoubleSide})))}return s}
(function(){
  for(var i=0;i<8;i++){var a=i/8*Math.PI*2+.4;farol(Math.cos(a)*5.9,Math.sin(a)*5.9)}
  farol(CHAPA.x+2.6,CHAPA.z-1.7,2.2);farol(-1.5,-3.5,0);
  banco(3.6,-5.3,Math.PI*.5);banco(-5.3,3.8,0);banco(6.2,6.6,Math.PI*.25);banco(-12,-6.4,Math.PI*.4);banco(-8.2,6.4,-Math.PI*.5);
  /* vallita negra y bordó en los dos bordes que se ven */
  var v=new THREE.Group();scene.add(v);ESTATICOS.push(v);
  for(var k=-MUN+.6;k<MUN-.5;k+=2.8){bx(v,.12,.7,.12,0x24221f,MUN-.4,0,k,{borde:false});bx(v,.12,.7,.12,0x24221f,k,0,MUN-.4,{borde:false})}
  bx(v,.07,.07,2*MUN-1,0x8b2a36,MUN-.4,.55,0,{borde:false});bx(v,2*MUN-1,.07,.07,0x8b2a36,0,.55,MUN-.4,{borde:false});
  bx(v,.07,.07,2*MUN-1,0x24221f,MUN-.4,.3,0,{borde:false});bx(v,2*MUN-1,.07,.07,0x24221f,0,.3,MUN-.4,{borde:false});
  /* banderines del Ayuntamiento a cada edificio vecino: bordó, hueso, beige */
  var col=[0x8b2a36,0xece8e1,0xcdbfa6,0x151413];
  banderines(scene,[5.9,1.9,-3.4],[-3.0,1.9,5.9],.8,col);
  var f=new THREE.Group();f.position.set(0,0,0);
})();
/* nubes bajas que pasan por los costados de la isla */
var NUBES=[];
(function(){var s=RN(19);for(var i=0;i<9;i++){var n=new THREE.Group(),w=1.6+s()*2.2;[[0,0,0,1],[.9,.1,.3,.75],[-.9,.05,-.2,.8],[.3,.4,-.2,.7]].forEach(function(c){poli(n,w*.55*c[3],0xffffff,c[0]*w*.5,c[1]*w*.5,c[2]*w*.4,{borde:false,sombra:false},[1.3,.7,1])});
  var side=i%2?1:-1,a=s()*Math.PI*2;n.position.set(side*(18+s()*10),-3.8+s()*2.2,(s()-.5)*34);n.userData={v:.12+s()*.18,d:side};scene.add(n);NUBES.push(n)}
  ANIM.push(function(t){NUBES.forEach(function(n){n.position.x+=n.userData.v*.016;n.position.z-=n.userData.v*.008;if(n.position.x>34){n.position.x=-34}if(n.position.z<-20)n.position.z=20})})})();

/* lo que no se mueve se funde por material: de más de mil mallas a unas pocas, para que ande bien en el celular */
function fusionar(raices,destino,rel){
  var cubos={},lista=[],inv=null;
  if(rel){rel.updateMatrixWorld(true);inv=new THREE.Matrix4().copy(rel.matrixWorld).invert()}
  function visitar(o){if(o.userData&&o.userData.noFusion)return;
    if(o.isMesh&&!Array.isArray(o.material)&&o.material.visible!==false&&o.geometry&&o.geometry.attributes.position&&TOCABLES.indexOf(o)<0)lista.push(o);
    o.children.slice().forEach(visitar)}
  raices.forEach(function(g){g.updateMatrixWorld(true);visitar(g)});
  var nm=new THREE.Matrix3(),v=new THREE.Vector3(),mt=new THREE.Matrix4();
  lista.forEach(function(o){var k=o.material.uuid+(o.castShadow?'s':'n'),c=cubos[k]||(cubos[k]={mat:o.material,sombra:o.castShadow,P:[],N:[],U:[]});
    mt.copy(o.matrixWorld);if(inv)mt.premultiply(inv);nm.getNormalMatrix(mt);
    var ge=o.geometry,pos=ge.attributes.position,nor=ge.attributes.normal,uv=ge.attributes.uv,idx=ge.index,n=idx?idx.count:pos.count;
    for(var i=0;i<n;i++){var j=idx?idx.getX(i):i;v.fromBufferAttribute(pos,j).applyMatrix4(mt);c.P.push(v.x,v.y,v.z);
      if(nor){v.fromBufferAttribute(nor,j).applyMatrix3(nm).normalize();c.N.push(v.x,v.y,v.z)}else c.N.push(0,1,0);
      if(uv)c.U.push(uv.getX(j),uv.getY(j));else c.U.push(0,0)}});
  lista.forEach(function(o){if(o.parent)o.parent.remove(o)});
  Object.keys(cubos).forEach(function(k){var c=cubos[k],ge=new THREE.BufferGeometry();ge.setAttribute('position',new THREE.Float32BufferAttribute(c.P,3));ge.setAttribute('normal',new THREE.Float32BufferAttribute(c.N,3));ge.setAttribute('uv',new THREE.Float32BufferAttribute(c.U,2));
    var m=new THREE.Mesh(ge,c.mat);m.castShadow=c.sombra;m.receiveShadow=true;destino.add(m)});
}
