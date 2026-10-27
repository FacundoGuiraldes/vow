/* ================= escena: la aldea isométrica de VOW =================
   Cada área del sistema es un edificio con su propia arquitectura. Las texturas se dibujan acá (canvas):
   estuco, ladrillo, tejas bordó, chapa, fachadas con ventanas que se prenden de noche y el isotipo real de la marca. */
var EDIF={
  hq:{n:'Centro de control',x:0,z:0,alto:6.4,sala:null},
  estrategia:{n:'Estrategia',x:-8.1,z:.4,alto:4.8,sala:'estrategia'},
  bot:{n:'Torre del bot',x:.4,z:-8.1,alto:6.2,sala:'bot'},
  deposito:{n:'Almacén',x:1.1,z:10.3,alto:3.6,sala:'deposito'},
  recepcion:{n:'Instagram',x:10.3,z:1.1,alto:5.2,sala:'recepcion'},
  diseno:{n:'Taller de diseño',x:10,z:10,alto:4.2,sala:'diseno'},
  caja:{n:'Caja',x:-9.2,z:7.6,alto:3.4,sala:'caja'},
  agenda:{n:'Agenda de hoy',x:-3.4,z:4.9,alto:2.8,sala:null}
};
var ORDEN=['hq','diseno','bot','estrategia','recepcion','deposito','caja'];
var canvas=$('gl'),renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x000000,0);
var scene=new THREE.Scene();
var cam=new THREE.OrthographicCamera(-10,10,10,-10,-200,300);
var SIN_E=1.25/Math.sqrt(1+1.5625+1);
var hemi=new THREE.HemisphereLight(0xfff4e0,0x3a3631,.7);scene.add(hemi);
var sol=new THREE.DirectionalLight(0xfff0d6,.72);sol.position.set(-14,22,10);sol.castShadow=true;
sol.shadow.mapSize.set(2048,2048);var sc=sol.shadow.camera;sc.left=-22;sc.right=22;sc.top=22;sc.bottom=-22;sc.near=1;sc.far=80;sol.shadow.bias=-.0006;scene.add(sol);

/* paleta de la marca (cerebro de marca): beige, bordó, hueso, negro, gris topo */
var NEGRO=0x151413,CARB=0xe6e1d5,HUESO=0xece8e1,BEIGE=0xcdbfa6,BORDO=0x8b2a36,BORDO2=0x9a2d3b,GRAFITO=0x2b2a27,TOPO=0x8c8378,TEAL=0x5e8793,OCRE=0xb58a3f,OLIVA=0x7e8450;
var OUT=new THREE.MeshBasicMaterial({color:0x1a1613,side:THREE.BackSide});
var MATS={},MATF={};
function M(c){if(!MATS[c])MATS[c]=new THREE.MeshLambertMaterial({color:c});return MATS[c]}
function MF(c){if(!MATF[c])MATF[c]=new THREE.MeshLambertMaterial({color:c,flatShading:true});return MATF[c]}
function RN(s){return function(){s=(s*16807)%2147483647;return s/2147483647}}
function hex(c){return '#'+('000000'+c.toString(16)).slice(-6)}

var GRUPO={},TOCABLES=[],ANIM=[],LUCES={};
/* ----- geometría ----- */
function add(g,geo,col,x,y,z,o){
  var m=new THREE.Mesh(geo,typeof col==='object'?col:M(col));m.position.set(x,y,z);
  /* lo muy chico no proyecta sombra ni lleva contorno: ahorra dibujado en el celular */
  if(!geo.boundingBox)geo.computeBoundingBox();var bb=geo.boundingBox,mx=Math.max(bb.max.x-bb.min.x,bb.max.y-bb.min.y,bb.max.z-bb.min.z);
  m.castShadow=!(o&&o.sombra===false)&&mx>.42;m.receiveShadow=true;g.add(m);
  if((!o||o.borde!==false)&&mx>.55){var b=new THREE.Mesh(geo,OUT);b.scale.setScalar(1+(((o&&o.k)||1.05)-1)*.3);m.add(b)}
  return m;
}
/* las texturas que se repiten necesitan UV en unidades del mundo: 1 unidad = dn repeticiones */
function uvCaja(ge,dn){var p=ge.parameters,uv=ge.attributes.uv,w=p.width,h=p.height,d=p.depth,f=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(var i=0;i<6;i++)for(var j=0;j<4;j++){var k=i*4+j;uv.setXY(k,uv.getX(k)*f[i][0]*dn,uv.getY(k)*f[i][1]*dn)}uv.needsUpdate=true}
function uvCil(ge,dn){var p=ge.parameters,uv=ge.attributes.uv,c=2*Math.PI*Math.max(p.radiusTop,p.radiusBottom);
  for(var k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*c*dn,uv.getY(k)*p.height*dn)}
function bx(g,w,h,d,col,x,y,z,o){var ge=new THREE.BoxGeometry(w,h,d);if(o&&o.dn)uvCaja(ge,o.dn);return add(g,ge,col,x,y+h/2,z,o)}
function cy(g,rt,rb,h,col,x,y,z,seg,o){var ge=new THREE.CylinderGeometry(rt,rb,h,seg||18);if(o&&o.dn)uvCil(ge,o.dn);return add(g,ge,col,x,y+h/2,z,o)}
function cono(g,r,h,col,x,y,z,seg,o){var ge=new THREE.ConeGeometry(r,h,seg||16);if(o&&o.dn){var uv=ge.attributes.uv,c=2*Math.PI*r,sl=Math.hypot(r,h);for(var k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*c*o.dn,uv.getY(k)*sl*o.dn)}return add(g,ge,col,x,y+h/2,z,{k:1.07,borde:o&&o.borde})}
function pir(g,w,d,h,col,x,y,z,o){var ge=new THREE.ConeGeometry(1,h,4);ge.rotateY(Math.PI/4);
  if(o&&o.dn){var uv=ge.attributes.uv,sl=Math.hypot(Math.max(w,d)/2,h);for(var k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*(w+d)*2*o.dn,uv.getY(k)*sl*o.dn)}
  var m=add(g,ge,col,x,y+h/2,z,{k:1.07});m.scale.set(w/Math.SQRT2,1,d/Math.SQRT2);return m}
function esf(g,r,col,x,y,z,o){return add(g,new THREE.SphereGeometry(r,16,12),col,x,y,z,o)}
function poli(g,r,col,x,y,z,o,s){var ge=new THREE.IcosahedronGeometry(r,0);var m=add(g,ge,typeof col==='object'?col:MF(col),x,y,z,o||{borde:false});if(s)m.scale.set(s[0],s[1],s[2]);return m}
function techo(g,w,d,h,col,x,y,z){
  var s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(0,h);s.lineTo(-w/2,0);
  var ge=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false});ge.translate(0,0,-d/2);
  return add(g,ge,col,x,y,z,{k:1.04});
}
/* techo a dos aguas armado con dos chapas: la cumbrera corre a lo largo de z */
function aguas(g,w,d,h,mat,x,y,z,gable){
  var a=Math.atan2(h,w/2),L=Math.hypot(w/2,h)+.14;
  if(gable)techo(g,w-.06,d-.04,h-.04,gable,x,y,z);
  [-1,1].forEach(function(s){var ge=new THREE.BoxGeometry(L,.14,d+.26);uvCaja(ge,mat.userData&&mat.userData.dn||1);
    var m=add(g,ge,mat,x+s*w/4,y+h/2+.02,z,{k:1.03});m.rotation.z=-s*a;});
}
/* ventana/luz suelta con marco (para detalles chicos) */
var LUZ_MAT=[];
function luz(g,x,y,z,w,h,ry){var m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:0xf3d28b}));m.position.set(x,y,z);m.rotation.y=ry||0;g.add(m);LUZ_MAT.push(m.material);
  var f=new THREE.Mesh(new THREE.PlaneGeometry(w+.14,h+.14),new THREE.MeshBasicMaterial({color:0x0a0a0a}));f.position.copy(m.position);f.rotation.y=m.rotation.y;
  var off=new THREE.Vector3(0,0,-.012).applyAxisAngle(new THREE.Vector3(0,1,0),ry||0);f.position.add(off);g.add(f);return m}

/* ----- lienzos y texturas ----- */
function lienzo(w,h,fn){var c=document.createElement('canvas');c.width=w;c.height=h;var g=c.getContext('2d');fn(g,w,h);var t=new THREE.CanvasTexture(c);t.anisotropy=4;return {c:c,g:g,t:t,fn:fn,w:w,h:h}}
function plano(L,w,h,x,y,z,ry,doble){var m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:L.t,transparent:true,side:doble?THREE.DoubleSide:THREE.FrontSide}));m.position.set(x,y,z);m.rotation.y=ry||0;return m}
function redibujar(L){L.g.clearRect(0,0,L.w,L.h);L.fn(L.g,L.w,L.h);L.t.needsUpdate=true}
function texRep(w,h,fn,dn){var L=lienzo(w,h,fn);L.t.wrapS=L.t.wrapT=THREE.RepeatWrapping;L.t.anisotropy=8;return L.t}
function matTex(t,dn,o){var m=new THREE.MeshLambertMaterial(Object.assign({map:t},o||{}));m.userData={dn:dn};return m}

/* superficies que se repiten (dn = repeticiones por unidad del mundo) */
function ruido(g,w,h,n,c1,c2,r){var s=RN(r||5);for(var i=0;i<n;i++){g.fillStyle=s()<.5?c1:c2;g.fillRect(s()*w,s()*h,1+s()*2,1+s()*2)}}
var T={};
T.estuco=function(c){return texRep(128,128,function(g,w,h){g.fillStyle=hex(c);g.fillRect(0,0,w,h);ruido(g,w,h,520,'rgba(0,0,0,.07)','rgba(255,255,255,.12)',3)})};
T.ladrillo=function(c,junta){return texRep(128,128,function(g,w,h){g.fillStyle=junta||'#cfc4ae';g.fillRect(0,0,w,h);var s=RN(9),bh=16,bw=32;
  for(var r=0;r<8;r++)for(var k=-1;k<5;k++){var off=r%2?bw/2:0,x=k*bw+off,y=r*bh,j=(s()-.5)*26;var col=new THREE.Color(c);col.offsetHSL(0,0,j/255);g.fillStyle='#'+col.getHexString();g.fillRect(x+1.5,y+1.5,bw-3,bh-3)}
  ruido(g,w,h,260,'rgba(0,0,0,.10)','rgba(255,255,255,.08)',4)})};
T.tejas=function(c){return texRep(132,128,function(g,w,h){var s=RN(21),tw=22,th=16;g.fillStyle='#1d0f12';g.fillRect(0,0,w,h);
  for(var r=0;r<8;r++)for(var k=-1;k<7;k++){var x=k*tw+(r%2?tw/2:0),y=r*th,col=new THREE.Color(c);col.offsetHSL(0,0,(s()-.5)*.09);g.fillStyle='#'+col.getHexString();
    g.beginPath();g.moveTo(x+1,y);g.lineTo(x+tw-1,y);g.lineTo(x+tw-1,y+th-6);g.quadraticCurveTo(x+tw/2,y+th+3,x+1,y+th-6);g.closePath();g.fill();
    g.fillStyle='rgba(0,0,0,.22)';g.fillRect(x+1,y+th-5,tw-2,2);g.fillStyle='rgba(255,255,255,.10)';g.fillRect(x+1,y,tw-2,2)}})};
T.chapa=function(c){return texRep(96,64,function(g,w,h){g.fillStyle=hex(c);g.fillRect(0,0,w,h);for(var x=0;x<w;x+=8){g.fillStyle='rgba(255,255,255,.13)';g.fillRect(x,0,2,h);g.fillStyle='rgba(0,0,0,.28)';g.fillRect(x+4,0,3,h)}ruido(g,w,h,160,'rgba(0,0,0,.12)','rgba(255,255,255,.08)',8)})};
T.piedra=function(c){return texRep(128,128,function(g,w,h){g.fillStyle='#8c8378';g.fillRect(0,0,w,h);var s=RN(33);for(var r=0;r<4;r++){var x=0,y=r*32;while(x<w){var bw=22+s()*28;var col=new THREE.Color(c);col.offsetHSL(0,0,(s()-.5)*.08);g.fillStyle='#'+col.getHexString();g.fillRect(x+1.5,y+1.5,Math.min(bw,w-x)-3,29);x+=bw}}ruido(g,w,h,300,'rgba(0,0,0,.09)','rgba(255,255,255,.1)',6)})};
T.madera=function(c){return texRep(64,128,function(g,w,h){g.fillStyle=hex(c);g.fillRect(0,0,w,h);var s=RN(2);for(var x=0;x<w;x+=16){g.fillStyle='rgba(0,0,0,.28)';g.fillRect(x,0,1.5,h)}for(var i=0;i<26;i++){g.fillStyle='rgba(0,0,0,.09)';g.fillRect(s()*w,s()*h,1,6+s()*30)}})};
T.adoquin=function(c){return texRep(128,128,function(g,w,h){g.fillStyle='#8f8777';g.fillRect(0,0,w,h);var s=RN(77);for(var r=0;r<8;r++)for(var k=0;k<8;k++){var col=new THREE.Color(c);col.offsetHSL(0,0,(s()-.5)*.07);g.fillStyle='#'+col.getHexString();g.fillRect(k*16+(r%2?8:0)+1,r*16+1,14,14)}})};
T.rayas=function(a,b){return texRep(64,64,function(g,w,h){for(var i=0;i<4;i++){g.fillStyle=hex(i%2?b:a);g.fillRect(i*16,0,16,h)}ruido(g,w,h,80,'rgba(0,0,0,.08)','rgba(255,255,255,.1)',4)})};

/* ----- fachadas: una por cara que se ve, con sus ventanas; de noche se prenden (emissiveMap) ----- */
var FACH=[],NOCHE=0,ACTUAL=null;
function fachada(w,h,fn){
  var dn=84,cw=Math.round(w*dn),ch=Math.round(h*dn);
  var A=lienzo(cw,ch,function(g,W,H){fn(g,W,H,{glow:false,dn:dn})}),B=lienzo(cw,ch,function(g,W,H){g.fillStyle='#000';g.fillRect(0,0,W,H);fn(g,W,H,{glow:true,dn:dn})});
  var m=new THREE.MeshLambertMaterial({map:A.t,emissive:0xffffff,emissiveMap:B.t,emissiveIntensity:0});
  var f={mat:m,A:A,B:B,edif:ACTUAL,redibujar:function(){redibujar(A);redibujar(B)}};FACH.push(f);return f;
}
/* una ventana: x,y,w,h en píxeles del lienzo; o: arco, postigos, flores, cruz */
function ventana(g,m,x,y,w,h,o){
  o=o||{};var on=((x*7+y*13+w*3)%10)<7;if(o.on===true)on=true;if(o.on===false)on=false;
  function forma(xx,yy,ww,hh,arco){g.beginPath();if(arco){g.moveTo(xx,yy+hh);g.lineTo(xx,yy+ww/2);g.arc(xx+ww/2,yy+ww/2,ww/2,Math.PI,0);g.lineTo(xx+ww,yy+hh)}else g.rect(xx,yy,ww,hh);g.closePath()}
  var b=Math.max(3,w*.09);
  if(m.glow){forma(x,y,w,h,o.arco);var gr=g.createLinearGradient(0,y,0,y+h);if(on){gr.addColorStop(0,'#ffe3a8');gr.addColorStop(1,'#f0a860')}else{gr.addColorStop(0,'#0e1015');gr.addColorStop(1,'#0e1015')}g.fillStyle=gr;g.fill();
    g.strokeStyle='#000';g.lineWidth=Math.max(2,w*.05);if(o.cruz!==false){g.beginPath();g.moveTo(x+w/2,y);g.lineTo(x+w/2,y+h);g.moveTo(x,y+h*.45);g.lineTo(x+w,y+h*.45);g.stroke()}
    forma(x,y,w,h,o.arco);g.lineWidth=b;g.stroke();return}
  if(o.postigos){var pw=w*.42;g.fillStyle=hex(o.postigos);g.fillRect(x-pw-2,y,pw,h);g.fillRect(x+w+2,y,pw,h);g.fillStyle='rgba(0,0,0,.25)';for(var k=0;k<h;k+=5){g.fillRect(x-pw-2,y+k,pw,1);g.fillRect(x+w+2,y+k,pw,1)}}
  g.fillStyle='#d9d2c1';forma(x-b,y-b,w+b*2,h+b*2,o.arco);g.fill();
  forma(x,y,w,h,o.arco);var gr2=g.createLinearGradient(x,y,x+w,y+h);gr2.addColorStop(0,o.vidrio||'#7fa0aa');gr2.addColorStop(.5,'#34454c');gr2.addColorStop(1,'#1d262b');g.fillStyle=gr2;g.fill();
  g.save();forma(x,y,w,h,o.arco);g.clip();g.fillStyle='rgba(255,255,255,.16)';g.beginPath();g.moveTo(x,y+h*.7);g.lineTo(x+w*.6,y);g.lineTo(x+w*.85,y);g.lineTo(x,y+h*1.1);g.fill();g.restore();
  if(o.cruz!==false){g.fillStyle='#d9d2c1';g.fillRect(x+w/2-1.5,y,3,h);g.fillRect(x,y+h*.45-1.5,w,3)}
  g.fillStyle='#b8ad97';g.fillRect(x-b-3,y+h+b,w+b*2+6,5);g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x-b-3,y+h+b+5,w+b*2+6,2);
  if(o.flores){var s=RN(x+y);for(var i=0;i<9;i++){g.fillStyle=['#8b2a36','#cdbfa6','#ece8e1','#a8505a'][i%4];g.beginPath();g.arc(x-b+4+i*(w+b*2-8)/8,y+h+b-1,3.2,0,7);g.fill()}g.fillStyle='#5d7a50';g.fillRect(x-b,y+h+b-1,w+b*2,3)}
}
function pared(g,m,w,h,c,tex){if(m.glow)return;if(tex){g.fillStyle=g.createPattern(tex.c||tex,'repeat')}else g.fillStyle=hex(c);g.fillRect(0,0,w,h)}
/* patrón de pared dibujado directo (para las fachadas) */
function paredEstuco(g,m,w,h,c){if(m.glow)return;g.fillStyle=hex(c);g.fillRect(0,0,w,h);ruido(g,w,h,w*h/90,'rgba(0,0,0,.07)','rgba(255,255,255,.13)',w);
  g.fillStyle='rgba(0,0,0,.16)';g.fillRect(0,h-h*.1,w,h*.1);g.fillStyle='rgba(255,255,255,.12)';g.fillRect(0,h-h*.1,w,2)}
function paredLadrillo(g,m,w,h,c){if(m.glow)return;var s=RN(w),bh=Math.round(h/16),bw=bh*2.2;g.fillStyle='#cdbfa6';g.fillRect(0,0,w,h);
  for(var r=0;r*bh<h;r++)for(var k=-1;k*bw<w;k++){var col=new THREE.Color(c);col.offsetHSL(0,0,(s()-.5)*.1);g.fillStyle='#'+col.getHexString();g.fillRect(k*bw+(r%2?bw/2:0)+1.5,r*bh+1.5,bw-3,bh-3)}ruido(g,w,h,w*h/110,'rgba(0,0,0,.1)','rgba(255,255,255,.07)',5)}
function banda(g,m,x,y,w,h,c){if(m.glow)return;g.fillStyle=hex(c);g.fillRect(x,y,w,h);g.fillStyle='rgba(255,255,255,.18)';g.fillRect(x,y,w,2);g.fillStyle='rgba(0,0,0,.22)';g.fillRect(x,y+h-2,w,2)}
function texto(g,m,t,x,y,px,c,fuente,align){if(m.glow)return;g.fillStyle=c;g.font=(fuente||'900 ')+px+'px Unbounded, Arial Black, sans-serif';g.textAlign=align||'center';g.textBaseline='middle';g.fillText(t,x,y)}
function textoLuz(g,m,t,x,y,px,c,align){if(!m.glow)return;g.fillStyle=c;g.font='900 '+px+'px Unbounded, Arial Black, sans-serif';g.textAlign=align||'center';g.textBaseline='middle';g.fillText(t,x,y)}
function placa(g,m,x,y,w,h,col,conLogo,txt,tc){
  if(m.glow)return;g.fillStyle='rgba(0,0,0,.28)';g.fillRect(x+3,y+4,w,h);g.fillStyle=hex(col);g.fillRect(x,y,w,h);g.strokeStyle='#cdbfa6';g.lineWidth=2;g.strokeRect(x+3,y+3,w-6,h-6);
  var lw=h*.62;if(conLogo)logoV(g,x+8,y+(h-lw*1.05)/2,lw,'#ece8e1');
  if(txt){g.fillStyle=tc||'#ece8e1';g.font='900 '+Math.round(h*.42)+'px Unbounded, Arial Black, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,x+(conLogo?lw+8:0)+(w-(conLogo?lw+8:0))/2,y+h*.52)}}

/* cuerpo de un edificio con fachada frontal (+z) y lateral (+x) propias */
function cuerpo(g,w,h,d,base,fz,fx,x,y,z){
  var ge=new THREE.BoxGeometry(w,h,d),bm=typeof base==='object'?base:M(base);
  return add(g,ge,[fx?fx.mat:bm,bm,bm,bm,fz?fz.mat:bm,bm],x,y+h/2,z);
}
/* sprite de brillo (faroles, carteles) */
var BRILLO=lienzo(64,64,function(g,w,h){var r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,214,150,1)');r.addColorStop(.35,'rgba(255,190,110,.45)');r.addColorStop(1,'rgba(255,170,90,0)');g.fillStyle=r;g.fillRect(0,0,64,64)}).t;
var BRILLOS=[];
function brillo(g,x,y,z,s,col){var m=new THREE.SpriteMaterial({map:BRILLO,color:col||0xffffff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});var sp=new THREE.Sprite(m);sp.position.set(x,y,z);sp.scale.set(s,s,1);g.add(sp);BRILLOS.push(m);return sp}
