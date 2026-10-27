/* ----- gente: peones del equipo y vecinos que pasean ----- */
var PEONES=[];
var ESPALDA=lienzo(64,64,function(c){logoV(c,12,8,40,'#ece8e1')});
var PELOS=[0x0e0e0e,0x3a2a1e,0x6b4a2b,0xa87b3f,0x24221f];
function peon(col,skin,o){
  o=o||{};var g=new THREE.Group(),cuerpo=new THREE.Group();g.add(cuerpo);
  cy(cuerpo,.2,.26,.45,col,0,.28,0,10);
  cy(cuerpo,.19,.19,.3,o.pantalon||0x24221f,0,.02,0,8,{borde:false});
  esf(cuerpo,.27,skin||0xe0b894,0,.98,0,{k:1.07});
  var hc=o.pelo!=null?o.pelo:0x0e0e0e;
  var pelo=new THREE.Mesh(new THREE.SphereGeometry(.285,12,8,0,Math.PI*2,0,Math.PI/2),M(hc));pelo.position.set(0,1.0,-.02);cuerpo.add(pelo);
  if(o.rodete)esf(cuerpo,.12,hc,0,1.3,-.14,{borde:false});
  if(o.gorra){var gr=new THREE.Mesh(new THREE.SphereGeometry(.3,12,8,0,Math.PI*2,0,Math.PI/2),M(o.gorra));gr.position.set(0,1.03,-.01);gr.scale.set(1,.85,1);cuerpo.add(gr);var vi=new THREE.Mesh(new THREE.BoxGeometry(.34,.025,.22),M(o.gorra));vi.position.set(0,1.05,.3);cuerpo.add(vi)}
  var oj=new THREE.MeshBasicMaterial({color:0x0a0a0a});[-.1,.1].forEach(function(x){var q=new THREE.Mesh(new THREE.SphereGeometry(.035,6,6),oj);q.position.set(x,.99,.245);cuerpo.add(q)});
  var capucha=new THREE.Mesh(new THREE.TorusGeometry(.2,.07,6,12),M(col));capucha.position.set(0,.72,0);capucha.rotation.x=Math.PI/2;cuerpo.add(capucha);
  /* el isotipo en la espalda del buzo */
  if(o.logo!==false){var m=plano(ESPALDA,.22,.22,0,.42,-.222,Math.PI);m.material.depthWrite=false;cuerpo.add(m)}
  var pies=[-.1,.1].map(function(x){return esf(g,.1,0x0a0a0a,x,.1,.02,{borde:false})});
  var brazos=[-.26,.26].map(function(x){var b=esf(cuerpo,.09,skin||0xe0b894,x,.5,.02,{borde:false});b.userData.noFusion=true;return b});
  fusionar([cuerpo],cuerpo,cuerpo);
  g.userData={cuerpo:cuerpo,pies:pies,brazos:brazos};g.scale.setScalar(1.25);
  return g;
}
var PEONDEF={hq:[0x8b2a36],diseno:[0x9a2f3c],bot:[0x5e8793],estrategia:[0xb58a3f],recepcion:[0x1d1c1a],deposito:[0x7e8450],caja:[0x8b2a36]};
var QUIEN={hq:1,diseno:2,bot:3,estrategia:4,recepcion:5,deposito:6,caja:7};
var EXTRA={hq:{gorra:0x151413},diseno:{rodete:true,pelo:0x3a2a1e},bot:{pelo:0xa87b3f},estrategia:{pelo:0x6b4a2b},recepcion:{rodete:true,pelo:0x0e0e0e},deposito:{gorra:0x8b2a36,pantalon:0x3a4a52},caja:{gorra:0xece8e1,pelo:0x2a1d14}};
ORDEN.forEach(function(k,i){
  var e=EDIF[k],l=Math.hypot(e.x,e.z)||1,dx=e.x/l,dz=e.z/l,p=peon(PEONDEF[k][0],[0xe0b894,0xc99a76,0xf1cfae,0xb98763][i%4],EXTRA[k]);
  var bx0=k==='hq'?e.x+3.1:e.x-dx*3.2+(-dz)*.9,bz0=k==='hq'?e.z+3.1:e.z-dz*3.2+(dx)*.9;
  p.position.set(bx0,0,bz0);p.rotation.y=Math.atan2(e.x-bx0,e.z-bz0);scene.add(p);
  p.userData.id=k;p.userData.base=[bx0,bz0];p.userData.fase=i*1.7;PEONES.push(p);
  var h=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,2,8),new THREE.MeshBasicMaterial({visible:false}));h.position.y=1;h.userData.edif=k;p.add(h);TOCABLES.push(h);
});
/* caminantes que llevan encargos entre el Ayuntamiento y los edificios */
var WALK=[];
['diseno','bot','estrategia','recepcion','deposito'].forEach(function(k,i){
  var e=EDIF[k],l=Math.hypot(e.x,e.z),dx=e.x/l,dz=e.z/l,p=peon([0x2b2926,0x4a3b2a,0x333027,0x1d1c1a,0x3a3631][i],[0xc99a76,0xe0b894,0xb98763,0xf1cfae,0xe0b894][i],{pelo:PELOS[i%5],gorra:i===2?0xcdbfa6:null});
  p.userData.ruta=[[dx*4.4,dz*4.4],[e.x-dx*3.0,e.z-dz*3.0]];p.userData.t=i*3.1;p.userData.espera=0;scene.add(p);WALK.push(p);
  var c=new THREE.Mesh(new THREE.BoxGeometry(.34,.28,.34),M(0xc7ab7c));c.position.set(0,.8,.34);p.userData.cuerpo.add(c);p.userData.caja=c;
});
/* vecinos que pasean por la plaza y por el estanque, uno con su perro */
var PASEO=[];
[[4.6,0,0xece8e1,0xc99a76,.2,1],[4.6,2.1,0x8b2a36,0xe0b894,.17,-1],[4.6,4.2,0x151413,0xb98763,.23,1]].forEach(function(c,i){
  var p=peon(c[2],c[3],{pelo:PELOS[(i+1)%5],gorra:i===2?0xece8e1:null});p.userData.paseo={r:c[0],a:c[1],v:c[4]*c[5]};scene.add(p);PASEO.push(p)});
var PERRO=(function(){var d=new THREE.Group();bx(d,.42,.2,.2,0x6b4a2b,0,.18,0,{borde:false});esf(d,.12,0x6b4a2b,.26,.36,0,{borde:false});bx(d,.1,.07,.1,0x24221f,.38,.34,0,{borde:false});[[.15,.07],[.15,-.07],[-.15,.07],[-.15,-.07]].forEach(function(p){bx(d,.05,.18,.05,0x4a3b2a,p[0],0,p[1],{borde:false})});var cola=bx(d,.05,.05,.2,0x6b4a2b,-.24,.3,0,{borde:false});cola.rotation.x=.9;d.userData.cola=cola;scene.add(d);return d})();
var P_ESTANQUE=peon(0x7e8450,0xe0b894,{pelo:0x3a2a1e,gorra:0xcdbfa6});P_ESTANQUE.position.set(ESTANQUE.x+3.0,0,ESTANQUE.z+1.2);P_ESTANQUE.rotation.y=-2.2;scene.add(P_ESTANQUE);
/* pájaros que dan vueltas y luciérnagas de noche */
var AVES=[];
(function(){for(var i=0;i<4;i++){var a=new THREE.Group();var cu=bx(a,.28,.08,.1,0x24221f,0,0,0,{borde:false,sombra:false});var ala=function(s){var m=new THREE.Mesh(new THREE.PlaneGeometry(.34,.14),new THREE.MeshBasicMaterial({color:0x24221f,side:THREE.DoubleSide}));m.position.set(0,.04,s*.12);m.rotation.x=Math.PI/2;a.add(m);return m};
  a.userData={alas:[ala(1),ala(-1)],r:7+i*2.4,v:.18+i*.04,f:i*1.9,h:6+i*.9};scene.add(a);AVES.push(a)}})();
var LUCIERNAGAS=(function(){var n=60,pos=new Float32Array(n*3),s=RN(14);for(var i=0;i<n;i++){var a=s()*7,r=ESTANQUE.r*(1+s()*2.2);pos[i*3]=ESTANQUE.x+Math.cos(a)*r;pos[i*3+1]=.4+s()*1.6;pos[i*3+2]=ESTANQUE.z+Math.sin(a)*r;}
  var ge=new THREE.BufferGeometry();ge.setAttribute('position',new THREE.BufferAttribute(pos,3));var m=new THREE.PointsMaterial({map:BRILLO,color:0xffe9a0,size:.55,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});var p=new THREE.Points(ge,m);scene.add(p);return {p:p,base:pos.slice()}})();
var ultCielo=0;
function animarPeones(t,dt){
  PEONES.forEach(function(p){
    var u=p.userData,act=!!(ESTADO_EDIF[u.id]&&ESTADO_EDIF[u.id].alta);
    p.userData.cuerpo.position.y=act?Math.abs(Math.sin(t*5+u.fase))*.22:Math.sin(t*1.6+u.fase)*.025;
    u.brazos[0].position.y=act?.8+Math.sin(t*9)*.08:.5;u.brazos[1].position.y=act?.8+Math.cos(t*9)*.08:.5;
  });
  WALK.forEach(function(p){
    var u=p.userData,a=u.ruta[0],b=u.ruta[1];
    if(u.espera>0){u.espera-=dt;p.userData.cuerpo.position.y=Math.sin(t*3)*.02;return}
    var dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),v=1.35;
    u.t+=dt*v;var ciclo=(u.t%(2*L)),adel=ciclo<L,s=adel?ciclo/L:2-ciclo/L;
    var x=a[0]+dx*s,z=a[1]+dz*s;p.position.set(x,0,z);p.rotation.y=Math.atan2(adel?dx:-dx,adel?dz:-dz);
    p.userData.cuerpo.position.y=Math.abs(Math.sin(t*9+u.fase||0))*.07;u.caja.visible=adel;
    u.pies[0].position.z=.02+Math.sin(t*9)*.09;u.pies[1].position.z=.02-Math.sin(t*9)*.09;
    if((adel&&s>.985)||(!adel&&s<.015)){if(!u.pausa||u.pausa<t-1){u.pausa=t;u.espera=1.4}}
  });
  PASEO.forEach(function(p,i){var u=p.userData.paseo;u.a+=u.v*dt;var x=Math.cos(u.a)*u.r,z=Math.sin(u.a)*u.r;p.position.set(x,0,z);p.rotation.y=Math.atan2(-Math.sin(u.a)*Math.sign(u.v),Math.cos(u.a)*Math.sign(u.v));
    p.userData.cuerpo.position.y=Math.abs(Math.sin(t*7+i))*.06;p.userData.pies[0].position.z=.02+Math.sin(t*7+i)*.08;p.userData.pies[1].position.z=.02-Math.sin(t*7+i)*.08;
    if(i===1){PERRO.position.set(x+Math.cos(u.a+.5)*.5,0,z+Math.sin(u.a+.5)*.5);PERRO.rotation.y=p.rotation.y;PERRO.userData.cola.rotation.z=Math.sin(t*12)*.5}});
  AVES.forEach(function(a){var u=a.userData,ang=t*u.v+u.f;a.position.set(Math.cos(ang)*u.r,u.h+Math.sin(t*.7+u.f),Math.sin(ang)*u.r);a.rotation.y=-ang;var f=Math.sin(t*14+u.f)*.6;u.alas[0].rotation.z=f;u.alas[1].rotation.z=-f});
  LUCIERNAGAS.p.material.opacity=Math.min(.95,NOCHE*1.2)*(.7+.3*Math.sin(t*3));var arr=LUCIERNAGAS.p.geometry.attributes.position;for(var i=0;i<arr.count;i++){arr.array[i*3+1]=LUCIERNAGAS.base[i*3+1]+Math.sin(t*.8+i)*.25;arr.array[i*3]=LUCIERNAGAS.base[i*3]+Math.sin(t*.5+i*1.3)*.3}arr.needsUpdate=true;
  if(t-ultCielo>.6){ultCielo=t;pintarCielo()}
}
dibujarMundo();
fusionar(ARBOLES.concat(ESTATICOS),scene,null);
ORDEN.forEach(function(k){fusionar([GRUPO[k]],GRUPO[k],GRUPO[k])});
fusionar([ESTANQUE.grupo],ESTANQUE.grupo,ESTANQUE.grupo);
actualizarCielo();setInterval(actualizarCielo,60000);addEventListener('resize',pintarCielo);
if(document.fonts&&document.fonts.load){Promise.all([document.fonts.load('900 24px Unbounded'),document.fonts.load('500 14px "IBM Plex Mono"')]).then(function(){FACH.forEach(function(f){f.redibujar()});if(PHONE)redibujar(PHONE);if(PANTALLA)redibujar(PANTALLA);if(CARTEL)redibujar(CARTEL)}).catch(function(){})}
