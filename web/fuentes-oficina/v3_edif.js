/* ----- edificios: cada uno con su arquitectura, su cartelería y los detalles de lo que hace ----- */
var MT={};
function mt(k,fn,dn){if(!MT[k])MT[k]=matTex(fn(),dn);return MT[k]}
var tejaBordo=function(){return mt('tb',function(){return T.tejas(0x8b2a36)},.9)};
var tejaOscura=function(){return mt('to',function(){return T.tejas(0x3a3632)},.9)};
var ladrilloM=function(){return mt('lad',function(){return T.ladrillo(0xa8503f)},.8)};
var piedraM=function(){return mt('pie',function(){return T.piedra(0xd8d0bf)},.7)};
var chapaM=function(){return mt('cha',function(){return T.chapa(0x3b3a37)},.8)};
var maderaM=function(){return mt('mad',function(){return T.madera(0x9c7a52)},1.2)};
var adoqM=function(){return mt('ado',function(){return T.adoquin(0xd6c9ae)},.5)};
function nuevo(id){ACTUAL=id;var g=new THREE.Group();g.position.set(EDIF[id].x,0,EDIF[id].z);g.userData.edif=id;scene.add(g);GRUPO[id]=g;return g}
function hit(g,ancho,alto){
  var m=new THREE.Mesh(new THREE.BoxGeometry(ancho,alto,ancho),new THREE.MeshBasicMaterial({visible:false}));m.position.y=alto/2;m.userData.edif=g.userData.edif;g.add(m);TOCABLES.push(m);g.userData.hit=m;
}
function turret(g,x,z,col,techoCol){
  cy(g,.5,.55,3.3,ladrilloM(),x,0,z,14,{dn:.8});cy(g,.62,.62,.2,BEIGE,x,3.2,z,14);
  cono(g,.72,1.1,tejaBordo(),x,3.4,z,14,{dn:.9});luz(g,x+.0,2.1,z+.52,.14,.5,0);luz(g,x+.52,2.1,z,.14,.5,Math.PI/2);
}
/* bandera con el isotipo, que flamea */
function bandera(g,x,y,z,col,alto){
  cy(g,.05,.05,alto||1.6,0x888070,x,y,z,6,{borde:false});
  var L=lienzo(160,100,function(c,w,h){c.fillStyle=hex(col);c.fillRect(0,0,w,h);logoV(c,w/2-30,h/2-32,60,'#ece8e1');c.fillStyle='rgba(0,0,0,.2)';c.fillRect(0,h-7,w,7)});
  var f=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.66),new THREE.MeshLambertMaterial({map:L.t,side:THREE.DoubleSide}));f.position.set(x+.55,y+(alto||1.6)-.36,z);f.castShadow=true;f.userData.noFusion=true;g.add(f);
  ANIM.push(function(t){f.rotation.y=Math.sin(t*2.2)*.25;f.scale.x=.94+Math.sin(t*4.1)*.06});return f}
/* toldo a rayas; ry gira para el lado que mira */
function toldo(g,w,d,x,y,z,ry,a,b){
  var ge=new THREE.BoxGeometry(w,.06,d);var m=add(g,ge,[M(a),M(a),mt('t'+a+b,function(){return T.rayas(a,b)},w>2?3:4),M(a),M(a),M(a)],0,0,0,{borde:false});
  var uv=ge.attributes.uv;for(var k=8;k<12;k++)uv.setXY(k,uv.getX(k)*w*1.6,uv.getY(k)*d);uv.needsUpdate=true;
  var gr=new THREE.Group();gr.position.set(x,y,z);gr.rotation.y=ry||0;g.add(gr);gr.add(m);m.rotation.x=.34;
  var v=bx(gr,w,.18,.04,b,0,-.1,d/2*.94,{borde:false});v.position.y=-.2;return gr}
function planta(g,x,z,col){bx(g,.8,.26,.34,maderaM(),x,0,z,{dn:1.2,borde:false});var s=RN(Math.round(x*17+z*9)+5);for(var i=0;i<7;i++)esf(g,.1,[0x8b2a36,0xece8e1,0xcdbfa6,0xa8505a][i%4],x-.34+i*.113,.4+s()*.1,z+(s()-.5)*.1,{borde:false});bx(g,.74,.07,.3,0x5d7a50,x,.26,z,{borde:false})}
/* hamaca de humo de una chimenea */
var HUMO=lienzo(64,64,function(g){var r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(236,232,225,.75)');r.addColorStop(1,'rgba(236,232,225,0)');g.fillStyle=r;g.fillRect(0,0,64,64)}).t;
function chimenea(g,x,y,z){bx(g,.42,1.1,.42,ladrilloM(),x,y,z,{dn:.8});bx(g,.52,.1,.52,0x8c8378,x,y+1.1,z,{borde:false});
  var ps=[];for(var i=0;i<6;i++){var s=new THREE.Sprite(new THREE.SpriteMaterial({map:HUMO,transparent:true,depthWrite:false,opacity:0}));s.position.set(x,y+1.3,z);g.add(s);ps.push(s)}
  ANIM.push(function(t){ps.forEach(function(s,i){var k=((t*.22+i/6)%1);s.position.set(x+k*.9+Math.sin(t+i)*.12,y+1.3+k*2.4,z-k*.2);var e=.45+k*1.5;s.scale.set(e,e,1);s.material.opacity=Math.sin(k*Math.PI)*.55*(1-NOCHE*.4)})})}

/* ================= Centro de control (HQ) ================= */
var PANTALLA=null;
function hq(){
  var g=nuevo('hq');
  bx(g,5.6,.35,5.6,adoqM(),0,0,0,{dn:.5});bx(g,5.0,.3,5.0,0xd6c9ae,0,.35,0);
  bx(g,1.9,.12,.5,0xcdbfa6,0,.35,2.75,{borde:false});bx(g,1.5,.12,.4,0xe3dccb,0,.47,2.62,{borde:false});
  var fz=fachada(4,2.7,function(c,W,H,m){var u=W/4;
    paredEstuco(c,m,W,H,0xe9e2d3);banda(c,m,0,0,W,.2*u,0xcdbfa6);banda(c,m,0,1.12*u,W,.1*u,0x8b2a36);
    ventana(c,m,.5*u,.42*u,.5*u,.62*u,{postigos:0x8b2a36});ventana(c,m,3.0*u,.42*u,.5*u,.62*u,{postigos:0x8b2a36});
    placa(c,m,1.45*u,.34*u,1.1*u,.56*u,0x0a0a0a,true,'VOW');
    ventana(c,m,.55*u,1.5*u,.62*u,.86*u,{flores:true,postigos:0x8b2a36});ventana(c,m,2.83*u,1.5*u,.62*u,.86*u,{flores:true,postigos:0x8b2a36});
    ventana(c,m,1.55*u,1.32*u,.9*u,1.35*u,{arco:true,on:true,cruz:false,vidrio:'#9fb0b4'});
    if(!m.glow){c.fillStyle='#24221f';c.fillRect(1.5*u,2.32*u,1.0*u,.06*u);c.fillStyle='#8b2a36';c.fillRect(1.55*u,2.0*u,.9*u,.04*u)}});
  var fx=fachada(4,2.7,function(c,W,H,m){var u=W/4;
    paredEstuco(c,m,W,H,0xe3dbc9);banda(c,m,0,0,W,.2*u,0xcdbfa6);banda(c,m,0,1.12*u,W,.1*u,0x8b2a36);
    [.5,1.5,2.5,3.5].forEach(function(x,i){ventana(c,m,(x-.02)*u,.42*u,.5*u,.62*u,{postigos:0x8b2a36});ventana(c,m,(x-.05)*u,1.5*u,.6*u,.86*u,{flores:i%2===0,postigos:0x8b2a36,on:i===1?true:undefined})});});
  cuerpo(g,4,2.7,4,CARB,fz,fx,0,.65,0);
  bx(g,4.3,.28,4.3,BEIGE,0,3.35,0);bx(g,4.34,.07,4.34,BORDO,0,3.3,0,{borde:false});
  pir(g,4.9,4.9,2.2,tejaBordo(),0,3.63,0,{dn:.9});
  function buhardilla(px,pz,ry){var d=new THREE.Group();d.position.set(px,0,pz);d.rotation.y=ry;g.add(d);
    var fq=fachada(.9,.55,function(c,W,H,m){paredEstuco(c,m,W,H,0xe9e2d3);ventana(c,m,W*.25,H*.14,W*.5,H*.7,{arco:true,on:true})});
    cuerpo(d,.9,.55,.6,CARB,fq,null,0,4.5,0);aguas(d,1.1,.7,.5,tejaBordo(),0,5.05,0,0xe9e2d3);}
  buhardilla(0,1.15,0);buhardilla(1.15,0,Math.PI/2);buhardilla(-1.15,0,-Math.PI/2);
  chimenea(g,-1.2,4.5,-.8);
  [[1.95,1.95],[1.95,-1.95],[-1.95,1.95],[-1.95,-1.95]].forEach(function(p){turret(g,p[0],p[1])});
  /* toldo sobre la puerta y banners con el isotipo */
  toldo(g,1.3,.7,0,2.02,2.28,0,0x8b2a36,0xece8e1);
  [[-1.55],[1.55]].forEach(function(p){var L=lienzo(80,170,function(c,w,h){c.fillStyle='#151413';c.fillRect(0,0,w,h);c.fillStyle='#8b2a36';c.fillRect(0,h-16,w,16);logoV(c,6,h*.28,w-12,'#ece8e1');c.fillStyle='#cdbfa6';for(var i=0;i<3;i++)c.fillRect(w/2-14,18+i*8,28,2)});
    var m=plano(L,.42,.9,p[0],1.3,2.04,0,true);g.add(m);bx(g,.5,.05,.05,0x24221f,p[0],1.78,2.02,{borde:false})});
  planta(g,-1.0,2.3);planta(g,1.0,2.3);
  /* pantalla de pendientes en el lateral */
  PANTALLA=lienzo(256,96,function(c,w,h){c.fillStyle='#0a0a0a';c.fillRect(0,0,w,h);var e=(typeof ESTADO_EDIF==='object'&&ESTADO_EDIF.hq)||{alta:0,media:0};
    c.fillStyle='#cdbfa6';c.font='500 15px "IBM Plex Mono", monospace';c.textAlign='left';c.fillText('PENDIENTES',14,24);
    c.fillStyle=e.alta?'#ff7a86':'#9bd0a5';c.font='900 52px Unbounded, Arial Black, sans-serif';c.fillText(String(e.alta+e.media),14,78);
    c.fillStyle='#ece8e1';c.font='500 13px "IBM Plex Mono", monospace';c.fillText(e.alta?e.alta+' urgentes':'todo al día',118,70);logoV(c,w-52,12,36,'#8b2a36')});
  var pn=plano(PANTALLA,1.1,.42,2.03,2.55,.1,Math.PI/2);g.add(pn);bx(g,.06,.5,1.18,0x151413,2.0,2.3,.1,{borde:false});
  banderaMast(g);
  hit(g,6,6.4);
}
function banderaMast(g){cy(g,.12,.12,.9,BEIGE,0,5.55,0,6,{borde:false});bandera(g,0,5.8,0,BORDO,1.7)}

/* ================= Taller de diseño: estudio de ropa y gráfica ================= */
function taller(){
  var g=nuevo('diseno');
  bx(g,4.4,.3,4.0,adoqM(),0,0,0,{dn:.5});
  var fz=fachada(3.4,2,function(c,W,H,m){var u=W/3.4;
    paredLadrillo(c,m,W,H,0xa8503f);banda(c,m,0,0,W,.14*u,0xcdbfa6);
    /* cartel pintado en la pared */
    if(!m.glow){c.fillStyle='#0a0a0a';c.fillRect(.15*u,.2*u,3.1*u,.32*u);c.fillStyle='#ece8e1';c.font='900 '+(.2*u)+'px Unbounded, Arial Black, sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText('ESTUDIO · DISEÑO · MERCH',.5*u,.36*u);logoV(c,.2*u,.22*u,.26*u,'#ece8e1')}
    /* vidriera con ropa colgada */
    var vx=.2*u,vy=.72*u,vw=1.95*u,vh=1.0*u;
    if(!m.glow){c.fillStyle='#1b1a18';c.fillRect(vx-5,vy-5,vw+10,vh+10);c.fillStyle='#3a2e28';c.fillRect(vx,vy,vw,vh);var gr=c.createLinearGradient(0,vy,0,vy+vh);gr.addColorStop(0,'#6a5648');gr.addColorStop(1,'#2a211c');c.fillStyle=gr;c.fillRect(vx,vy,vw,vh);
      c.fillStyle='#b9ab8d';c.fillRect(vx,vy+vh*.12,vw,3);
      [['#8b2a36',.1],['#cdbfa6',.3],['#0a0a0a',.5],['#ece8e1',.7]].forEach(function(p){var px=vx+vw*p[1];c.fillStyle='#caa';c.fillRect(px+vw*.07,vy+vh*.12,2,12);c.fillStyle=p[0];c.beginPath();c.moveTo(px,vy+vh*.3);c.lineTo(px+vw*.14,vy+vh*.3);c.lineTo(px+vw*.16,vy+vh*.62);c.lineTo(px+vw*.12,vy+vh*.62);c.lineTo(px+vw*.12,vy+vh*.8);c.lineTo(px+vw*.02,vy+vh*.8);c.lineTo(px+vw*.02,vy+vh*.62);c.lineTo(px-vw*.02,vy+vh*.62);c.closePath();c.fill()});
      c.fillStyle='rgba(255,255,255,.14)';c.beginPath();c.moveTo(vx,vy+vh*.8);c.lineTo(vx+vw*.5,vy);c.lineTo(vx+vw*.7,vy);c.lineTo(vx,vy+vh*1.05);c.fill();
      c.strokeStyle='#d9d2c1';c.lineWidth=4;c.strokeRect(vx,vy,vw,vh);c.beginPath();c.moveTo(vx+vw/2,vy);c.lineTo(vx+vw/2,vy+vh);c.stroke()}
    else{var g2=c.createLinearGradient(0,vy,0,vy+vh);g2.addColorStop(0,'#ffd9a0');g2.addColorStop(1,'#d9893f');c.fillStyle=g2;c.fillRect(vx,vy,vw,vh);c.fillStyle='#000';c.fillRect(vx+vw/2-2,vy,4,vh)}
    ventana(c,m,2.45*u,.75*u,.7*u,1.3*u,{arco:false,on:true,cruz:false});
    if(!m.glow){c.fillStyle='#b8ad97';c.fillRect(.1*u,1.82*u,2.2*u,5)}});
  var fx=fachada(3.0,2,function(c,W,H,m){var u=W/3;paredLadrillo(c,m,W,H,0xa8503f);banda(c,m,0,0,W,.14*u,0xcdbfa6);
    /* mural con la paleta de la marca */
    if(!m.glow){[['#0a0a0a','NEGRO'],['#8b2a36','BORDÓ'],['#cdbfa6','BEIGE'],['#ece8e1','HUESO'],['#8c8378','TOPO']].forEach(function(p,i){var x=.2*u+i*.52*u,y=.3*u;c.fillStyle='#ece8e1';c.fillRect(x-4,y-4,.46*u+8,.92*u+8);c.fillStyle=p[0];c.fillRect(x,y,.46*u,.64*u);c.fillStyle='#16140f';c.font='500 '+(.062*u)+'px "IBM Plex Mono", monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(p[1],x+.23*u,y+.78*u)})}
    ventana(c,m,1.1*u,1.2*u,.8*u,.6*u,{postigos:0x151413,flores:true})});
  cuerpo(g,3.4,2,3.0,0xc79a82,fz,fx,0,.3,0);
  bx(g,3.56,.16,3.16,BEIGE,0,2.3,0,{borde:false});
  aguas(g,3.9,3.5,1.05,tejaBordo(),0,2.38,0,0xc79a82);
  /* claraboyas en el techo y chimenea de chapa */
  [-.8,.8].forEach(function(z){var cl=bx(g,.9,.07,.8,new THREE.MeshLambertMaterial({color:0x9fc0c8,emissive:0xffe3b0,emissiveIntensity:0}),1.0,2.95,z,{borde:false});cl.rotation.z=-.5;LUZ_MAT.push(cl.material);})
  chimenea(g,-1.2,3.0,-.9);
  toldo(g,2.1,.55,-.8,2.12,1.7,0,0x151413,0xece8e1);
  /* caballete con una pieza, maniquí, rollos de tela y banderines */
  bx(g,.08,1.5,.08,0x4a3b2a,-1.9,0,2.5);bx(g,.08,1.5,.08,0x4a3b2a,-1.1,0,2.5);bx(g,1.2,1.0,.1,0xf3efe7,-1.5,.7,2.5);bx(g,.9,.66,.12,BORDO,-1.5,.9,2.53,{borde:false});logoMini(g,-1.5,.95,2.6,.38);
  var mn=new THREE.Group();mn.position.set(1.65,0,2.4);g.add(mn);cy(mn,.05,.05,1.0,0x24221f,0,0,0,6,{borde:false});cy(mn,.3,.22,.7,BORDO,0,.8,0,10);esf(mn,.2,0xe4d3b9,0,1.62,0,{borde:false});cy(mn,.28,.28,.12,BORDO,0,1.4,0,10,{borde:false});cy(mn,.2,.22,.06,0x24221f,0,0,0,10,{borde:false});
  [[BORDO,.0,.0],[BEIGE,.0,.36],[0x151413,.0,.72]].forEach(function(r,i){var rl=cy(g,.2,.2,.9,r[0],0,0,0,14);rl.rotation.z=Math.PI/2;rl.position.set(2.45+(i%2?.12:0),.22+(i===2?.4:0),2.55-(i===1?.38:0)+(i===2?-.2:0))});
  banderines(g,[-2.05,2.35,1.75],[1.9,2.35,1.75],.45,[0x8b2a36,0xece8e1,0xcdbfa6,0x151413]);
  hit(g,4.4,4.4);
}
function logoMini(g,x,y,z,w){var L=lienzo(64,64,function(c,W,H){logoV(c,6,4,52,'#ece8e1')});var m=plano(L,w,w,x,y,z,0);g.add(m);return m}

/* ================= Torre del bot: antena, servidores y luces ================= */
function torre(){
  var g=nuevo('bot');
  bx(g,3.4,.3,3.4,adoqM(),0,0,0,{dn:.5});
  var fz=fachada(2.6,1.2,function(c,W,H,m){var u=W/2.6;
    if(!m.glow){c.fillStyle='#c9c4b8';c.fillRect(0,0,W,H);for(var i=1;i<5;i++){c.fillStyle='rgba(0,0,0,.14)';c.fillRect(i*W/5,0,2,H)}ruido(c,W,H,500,'rgba(0,0,0,.08)','rgba(255,255,255,.1)',2);banda(c,m,0,0,W,.1*u,0x24221f)}
    /* ventana de servidores con filas de luces */
    var sx=.25*u,sy=.3*u,sw=1.15*u,sh=.7*u;
    if(!m.glow){c.fillStyle='#10161a';c.fillRect(sx-5,sy-5,sw+10,sh+10);c.fillStyle='#1c262c';c.fillRect(sx,sy,sw,sh)}
    for(var r=0;r<6;r++)for(var k=0;k<9;k++){var on=((r*7+k*3)%5)<3;if(m.glow){c.fillStyle=on?(r%3?'#7de3b0':'#ffb066'):'#0a0a0a';c.fillRect(sx+6+k*sw/9.5,sy+6+r*sh/6.4,sw/14,sh/12)}else{c.fillStyle='#2f3d44';c.fillRect(sx+6+k*sw/9.5,sy+6+r*sh/6.4,sw/14,sh/12)}}
    ventana(c,m,1.6*u,.28*u,.55*u,.7*u,{on:true,vidrio:'#6e98a4'});
    placa(c,m,.2*u,.04*u,.8*u,.2*u,0x151413,false,'BOT',null)});
  var fx=fachada(2.6,1.2,function(c,W,H,m){var u=W/2.6;if(!m.glow){c.fillStyle='#c9c4b8';c.fillRect(0,0,W,H);for(var i=1;i<5;i++){c.fillStyle='rgba(0,0,0,.14)';c.fillRect(i*W/5,0,2,H)}ruido(c,W,H,500,'rgba(0,0,0,.08)','rgba(255,255,255,.1)',2);banda(c,m,0,0,W,.1*u,0x24221f)}
    ventana(c,m,.4*u,.3*u,.5*u,.6*u,{on:true,vidrio:'#6e98a4'});ventana(c,m,1.6*u,.3*u,.5*u,.6*u,{on:true,vidrio:'#6e98a4'})});
  cuerpo(g,2.6,1.2,2.6,CARB,fz,fx,0,.3,0);bx(g,2.78,.16,2.78,BEIGE,0,1.5,0,{borde:false});
  /* el cilindro de la torre con sus ventanas en banda */
  var ft=fachada(6.7,3.1,function(c,W,H,m){var u=W/6.7;
    if(!m.glow){c.fillStyle='#6e97a3';c.fillRect(0,0,W,H);ruido(c,W,H,2500,'rgba(0,0,0,.07)','rgba(255,255,255,.12)',7);for(var y=0;y<H;y+=H/6){c.fillStyle='rgba(0,0,0,.2)';c.fillRect(0,y,W,3)}}
    for(var k=0;k<8;k++)for(var r=0;r<2;r++){ventana(c,m,k*W/8+W/8*.2,H*(.14+r*.4),W/8*.6,H*.22,{on:((k*3+r)%4)!==0,arco:true,cruz:false,vidrio:'#9fc4cf'})}});
  var cil=new THREE.CylinderGeometry(.95,1.2,3.1,16);add(g,cil,ft.mat,0,1.5+1.55,0);
  cy(g,1.12,1.12,.2,BEIGE,0,4.55,0,14);cy(g,.7,.9,.7,0x5f93a3,0,4.7,0,14);
  /* mástil reticulado con antenas y la baliza */
  [[.12,.12],[-.12,.12],[.12,-.12],[-.12,-.12]].forEach(function(p){cy(g,.025,.025,2.3,0x6a665c,p[0],5.4,p[1],4,{borde:false})});
  for(var i=0;i<6;i++){var b=bx(g,.3,.03,.03,0x6a665c,0,5.55+i*.38,.12,{borde:false});b.rotation.z=i%2?.6:-.6}
  [0,1].forEach(function(i){cy(g,.02,.02,.7,0x24221f,0,5.7+i*.7,0,4,{borde:false}).rotation.z=Math.PI/2});
  var lamp=new THREE.Mesh(new THREE.SphereGeometry(.2,12,10),new THREE.MeshBasicMaterial({color:0x7da36b}));lamp.position.set(0,7.9,0);lamp.userData.noFusion=true;g.add(lamp);LUCES.bot=lamp;
  var plato=new THREE.Mesh(new THREE.SphereGeometry(.5,14,8,0,Math.PI*2,0,Math.PI/2),M(0xece8e1));plato.position.set(.85,5.25,0);plato.rotation.z=-.7;plato.rotation.y=.4;plato.castShadow=true;plato.userData.noFusion=true;g.add(plato);
  cy(g,.03,.03,.5,0x24221f,.8,5.25,0,4,{borde:false});
  /* contenedor de servidores con luces parpadeantes y cables al suelo */
  var cj=bx(g,1.5,.9,.7,0x3b3a37,1.1,0,2.2,{dn:1});var leds=[];
  for(i=0;i<8;i++){var l=new THREE.Mesh(new THREE.PlaneGeometry(.1,.07),new THREE.MeshBasicMaterial({color:0x7de3b0}));l.position.set(.3+i*.15-.4+1.1-.8,.55,2.56);l.userData.noFusion=true;g.add(l);leds.push(l)}
  logoMini(g,1.9,.45,2.56,.34);
  for(i=0;i<3;i++){var c3=bx(g,.05,.03,1.6,0x151413,.2+i*.12,.02,1.45,{borde:false});c3.rotation.y=i*.05}
  ANIM.push(function(t){lamp.scale.setScalar(.8+Math.abs(Math.sin(t*2.4))*.5);plato.rotation.y=.4+Math.sin(t*.7)*.5+((typeof REACC!=='undefined'&&REACC.bot)||0)*Math.sin(t*4)*.5;leds.forEach(function(l,i){var on=Math.sin(t*3+i*1.9)>-.2;l.material.color.setHex(on?(i%3?0x7de3b0:0xffb066):0x16322a)})});
  hit(g,3.4,6.8);
}

/* ================= Estrategia: el observatorio / biblioteca ================= */
function estrategia(){
  var g=nuevo('estrategia');
  cy(g,2.6,2.7,.14,adoqM(),0,0,0,28,{dn:.5});cy(g,2.4,2.5,.14,0xe3dccb,0,.14,0,28);cy(g,2.2,2.3,.14,0xece8e1,0,.28,0,28);
  var fp=fachada(12.3,2.1,function(c,W,H,m){
    if(!m.glow){c.fillStyle='#d8d0bf';c.fillRect(0,0,W,H);var s=RN(55),bh=H/7,bw=bh*2.6;for(var r=0;r<7;r++){for(var k=-1;k*bw<W;k++){var sh=.93+s()*.1;c.fillStyle='rgb('+Math.round(216*sh)+','+Math.round(208*sh)+','+Math.round(191*sh)+')';c.fillRect(k*bw+(r%2?bw/2:0)+1.5,r*bh+1.5,bw-3,bh-3)}}ruido(c,W,H,1500,'rgba(0,0,0,.08)','rgba(255,255,255,.1)',4);banda(c,m,0,0,W,H*.07,0xb58a3f)}
    for(var k=0;k<10;k++){var cx=W*(k/10);ventana(c,m,cx-W*.012,H*.25,W*.024*1.9,H*.5,{arco:true,on:k%3!==1,postigos:undefined})}});
  add(g,new THREE.CylinderGeometry(1.9,2,2.2,28),fp.mat,0,.3+1.1,0);cy(g,2.05,2.05,.22,OCRE,0,2.2,0,28);
  /* cúpula dorada con nervaduras */
  var cu=lienzo(512,192,function(c,W,H){var gr=c.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#e0b868');gr.addColorStop(1,'#a8782c');c.fillStyle=gr;c.fillRect(0,0,W,H);for(var i=0;i<24;i++){c.fillStyle='rgba(60,40,10,.35)';c.fillRect(i*W/24,0,3,H);c.fillStyle='rgba(255,240,200,.25)';c.fillRect(i*W/24+3,0,3,H)}
    for(i=1;i<5;i++){c.fillStyle='rgba(60,40,10,.3)';c.fillRect(0,H*i/5,W,2)}});
  var d=new THREE.Mesh(new THREE.SphereGeometry(2.05,28,14,0,Math.PI*2,0,Math.PI/2),new THREE.MeshLambertMaterial({map:cu.t}));d.scale.y=.85;d.position.y=2.45;d.castShadow=true;g.add(d);
  var d2=new THREE.Mesh(new THREE.SphereGeometry(2.05,28,14,0,Math.PI*2,0,Math.PI/2),OUT);d2.scale.set(1.04,.89,1.04);d2.position.y=2.43;g.add(d2);
  cy(g,.18,.22,.4,BEIGE,0,4.15,0,10);cy(g,.2,.2,.5,0xf3d28b,0,4.5,0,10,{borde:false});cono(g,.28,.4,OCRE,0,5.0,0,10);esf(g,.1,0xf3d28b,0,5.5,0,{borde:false});
  /* columnas con base y capitel al frente */
  for(var i=-1;i<=1;i++){var a=Math.PI/4+i*.5,px=Math.cos(a)*1.95,pz=Math.sin(a)*1.95;cy(g,.2,.2,.1,0xe3dccb,px,.3,pz,10);cy(g,.15,.17,1.72,HUESO,px,.4,pz,10);cy(g,.22,.2,.12,0xe3dccb,px,2.1,pz,10)}
  /* telescopio apuntando al cielo */
  var dir=new THREE.Vector3(.55,.75,.55).normalize(),tb=cy(g,.12,.16,1.5,0xb8a15c,0,0,0,10);tb.position.copy(new THREE.Vector3(1.05,3.35,1.05)).addScaledVector(dir,.75);tb.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  bx(g,.08,.4,.08,0x24221f,1.0,3.05,1.0,{borde:false});
  /* mesa de mapas, pizarra y globo */
  bx(g,1.7,.55,1.05,0x4a3b2a,2.0,0,2.45);bx(g,1.55,.08,.9,0xece8e1,2.0,.55,2.45,{borde:false});bx(g,.5,.1,.35,OCRE,1.6,.63,2.4,{borde:false});bx(g,.3,.1,.5,BORDO,2.3,.63,2.55,{borde:false});
  var gb=esf(g,.27,0x5e8793,2.2,1.15,2.45,{borde:false});cy(g,.04,.04,.45,0x24221f,2.2,.63,2.45,6,{borde:false});
  var TB=lienzo(256,170,function(c,W,H){c.fillStyle='#10100f';c.fillRect(0,0,W,H);c.fillStyle='#ece8e1';c.font='500 13px "IBM Plex Mono", monospace';c.textAlign='left';c.fillText('PLAN DE LA SEMANA',12,22);
    [.35,.6,.45,.8,.65,.95].forEach(function(v,i){c.fillStyle=i%2?'#cdbfa6':'#8b2a36';c.fillRect(22+i*36,H-18-v*100,24,v*100)});c.strokeStyle='#ece8e1';c.lineWidth=3;c.beginPath();c.moveTo(18,H-30);c.lineTo(120,H-70);c.lineTo(230,H-128);c.stroke();c.fillStyle='#ece8e1';c.beginPath();c.moveTo(236,H-134);c.lineTo(214,H-132);c.lineTo(228,H-114);c.fill()});
  var pz=plano(TB,1.5,1.0,-1.9,1.35,2.75,Math.PI*.05);g.add(pz);bx(g,1.62,1.12,.08,0xb58a3f,-1.9,.8,2.69,{borde:false});[-.6,.6].forEach(function(o){bx(g,.07,.9,.07,0x4a3b2a,-1.9+o,0,2.6,{borde:false})});
  banderines(g,[1.4,3.7,2.6],[-2.2,3.5,2.8],.4,[0xb58a3f,0xece8e1,0x8b2a36]);
  hit(g,4.6,5.4);
}

/* ================= Instagram: el local con vidriera y el celular gigante ================= */
var PHONE=null;
function instagram(){
  var g=nuevo('recepcion');
  bx(g,4.2,.3,4.2,adoqM(),0,0,0,{dn:.5});
  var fz=fachada(3.2,1.5,function(c,W,H,m){var u=W/3.2;
    paredEstuco(c,m,W,H,0xe9e2d3);banda(c,m,0,0,W,.12*u,0x24221f);
    /* vidriera con fotos pegadas */
    var vx=.25*u,vy=.4*u,vw=1.7*u,vh=.85*u;
    if(!m.glow){c.fillStyle='#1b1a18';c.fillRect(vx-5,vy-5,vw+10,vh+10);var g2=c.createLinearGradient(0,vy,0,vy+vh);g2.addColorStop(0,'#5a4a42');g2.addColorStop(1,'#241c18');c.fillStyle=g2;c.fillRect(vx,vy,vw,vh);var cs=['#8b2a36','#cdbfa6','#ece8e1','#8c8378','#b58a3f'],s=RN(31);for(var i=0;i<12;i++){c.save();c.translate(vx+14+(i%6)*vw/6.2,vy+16+Math.floor(i/6)*vh/2.2);c.rotate((s()-.5)*.3);c.fillStyle='#f3efe7';c.fillRect(0,0,vw/7,vw/6.4);c.fillStyle=cs[i%5];c.fillRect(3,3,vw/7-6,vw/6.4-14);c.restore()}
      c.fillStyle='rgba(255,255,255,.14)';c.beginPath();c.moveTo(vx,vy+vh*.8);c.lineTo(vx+vw*.5,vy);c.lineTo(vx+vw*.68,vy);c.lineTo(vx,vy+vh*1.05);c.fill()}
    else{var g3=c.createLinearGradient(0,vy,0,vy+vh);g3.addColorStop(0,'#ffe0b0');g3.addColorStop(1,'#e0954a');c.fillStyle=g3;c.fillRect(vx,vy,vw,vh)}
    ventana(c,m,2.25*u,.4*u,.7*u,1.05*u,{on:true,cruz:false,vidrio:'#9fb0b4'});
    /* rótulo neón */
    placa(c,m,.25*u,.14*u,2.7*u,.2*u,0x151413,true,null)});
  var fx=fachada(2.6,1.5,function(c,W,H,m){var u=W/2.6;paredEstuco(c,m,W,H,0xe3dbc9);banda(c,m,0,0,W,.12*u,0x24221f);
    if(!m.glow){c.fillStyle='#8b2a36';c.fillRect(.3*u,.3*u,1.0*u,.95*u);logoV(c,.45*u,.38*u,.7*u,'#ece8e1');c.fillStyle='#ece8e1';c.font='500 '+(.1*u)+'px "IBM Plex Mono", monospace';c.textAlign='center';c.fillText('@vow_ar',.8*u,1.15*u)}
    ventana(c,m,1.5*u,.35*u,.7*u,.8*u,{postigos:0x8b2a36,flores:true})});
  cuerpo(g,3.2,1.5,2.6,CARB,fz,fx,0,.3,0);bx(g,3.3,.14,2.7,GRAFITO,0,1.8,0,{borde:false});bx(g,3.3,.16,.1,0xcdbfa6,0,1.94,1.3,{borde:false});bx(g,.1,.16,2.7,0xcdbfa6,1.6,1.94,0,{borde:false});
  toldo(g,3.0,.95,0,1.62,1.62,0,0x8b2a36,0xece8e1);
  /* cartel neón con el nombre */
  var NE=lienzo(256,64,function(c,W,H){c.fillStyle='rgba(0,0,0,0)';c.clearRect(0,0,W,H);c.shadowColor='#ff5a74';c.shadowBlur=14;c.fillStyle='#ffd6dc';c.font='900 34px Unbounded, Arial Black, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('VOW_AR',W/2,H/2)});
  var ne=plano(NE,1.6,.4,-.1,2.5,-.4,Math.PI/4);g.add(ne);bx(g,.06,.6,.06,0x24221f,-.5,1.9,-.6,{borde:false});brillo(g,-.1,2.5,-.3,2.6,0xff8aa0);
  /* el celular gigante: es Instagram */
  var ph=new THREE.Group();ph.position.set(-.3,1.94,-.1);ph.rotation.y=Math.PI/4;ph.userData.noFusion=true;g.add(ph);
  bx(ph,1.7,2.9,.34,0x0a0a0a,0,0,0,{k:1.04});
  PHONE=lienzo(256,448,function(gg,w,h){
    var gr=gg.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#8b2a36');gr.addColorStop(1,'#1a1a18');gg.fillStyle=gr;gg.fillRect(0,0,w,h);
    logoV(gg,w/2-26,34,52,'#ece8e1');
    var x=D.rendimiento&&D.rendimiento.cuenta&&!D.rendimiento.error?D.rendimiento.cuenta:null;
    gg.fillStyle='#ece8e1';gg.textAlign='center';gg.font='900 66px Unbounded, Arial Black, sans-serif';gg.fillStyle='#fff';gg.fillText(x&&x.seguidores!=null?fmtN(x.seguidores):'—',w/2,230);
    gg.font='500 22px "IBM Plex Mono", monospace';gg.fillStyle='#cdbfa6';gg.fillText('seguidores',w/2,266);
    gg.fillStyle='rgba(255,255,255,.14)';for(var k=0;k<3;k++)gg.fillRect(24+k*76,320,68,68)
  });
  var pp=plano(PHONE,1.5,2.62,0,1.47,.19,0);ph.add(pp);
  /* aro de luz con trípode, globos de corazón y banco con almohadones */
  var an=new THREE.Group();an.position.set(-2.0,0,2.1);g.add(an);cy(an,.03,.05,1.5,0x24221f,0,0,0,6,{borde:false});var aro=new THREE.Mesh(new THREE.TorusGeometry(.38,.05,8,24),new THREE.MeshBasicMaterial({color:0xfff3d6}));aro.position.set(0,1.75,0);an.add(aro);[-.2,.2].forEach(function(o){bx(an,.04,.5,.04,0x24221f,o,0,o,{borde:false}).rotation.z=o*1.2});brillo(an,0,1.75,.05,1.4,0xfff3d6);
  [[1.9,2.1,BORDO],[2.15,1.9,HUESO],[1.65,1.85,BEIGE]].forEach(function(b,i){var bg=new THREE.Group();bg.position.set(b[0],0,b[1]);bg.userData.noFusion=true;g.add(bg);var gl=esf(bg,.26,b[2],0,2.2+i*.2,0,{borde:false});gl.userData.noFusion=true;gl.scale.set(1,1.15,1);cy(bg,.01,.01,2,0x8c8378,0,.2,0,3,{borde:false});ANIM.push(function(t){gl.position.y=2.2+i*.2+Math.sin(t*1.3+i*2)*.07;gl.rotation.z=Math.sin(t+i)*.06})});
  var bz=new THREE.Group();bz.position.set(.2,0,2.25);g.add(bz);bx(bz,1.3,.08,.4,maderaM(),0,.4,0,{borde:false});[-.55,.55].forEach(function(p){bx(bz,.07,.4,.34,0x2a2724,p,0,0,{borde:false})});bx(bz,.28,.2,.12,BORDO,-.35,.48,-.05,{borde:false});bx(bz,.28,.2,.12,BEIGE,.1,.48,-.05,{borde:false});
  banderines(g,[-2.1,3.0,2.1],[1.6,2.2,2.2],.5,[0xece8e1,0x8b2a36,0xcdbfa6,0x151413]);
  ANIM.push(function(t){ph.position.y=1.94+Math.sin(t*1.6)*.07});
  hit(g,4.4,5.4);
}

/* ================= Almacén: galpón con rampa, pallets y camioneta ================= */
var CAJAS={};
function cajaVOW(g,w,h,d,x,y,z,col){bx(g,w,h,d,col||0xc7ab7c,x,y,z,{borde:false});bx(g,w+.01,.06,d+.01,0x8b6a3c,x,y+h/2-.03,z,{borde:false});var L=lienzo(64,64,function(c){logoV(c,16,12,32,'#0a0a0a')});var m=plano(L,Math.min(w,h)*.55,Math.min(w,h)*.55,x,y+h/2,z+d/2+.011,0);g.add(m);return m}
function almacen(){
  var g=nuevo('deposito');
  bx(g,5.0,.3,3.8,adoqM(),0,0,0,{dn:.5});
  var fz=fachada(4,1.9,function(c,W,H,m){var u=W/4;
    paredEstuco(c,m,W,H,0xd2d5bd);banda(c,m,0,0,W,.12*u,0x24221f);banda(c,m,0,1.72*u,W,.18*u,0x8c8378);
    for(var k=0;k<2;k++){var x=(.25+k*1.95)*u,y=.6*u,w=1.5*u,h=1.12*u;
      if(!m.glow){c.fillStyle='#1b1a18';c.fillRect(x-6,y-6,w+12,h+12);c.fillStyle='#ece8e1';c.fillRect(x,y,w,h);for(var r=0;r<12;r++){c.fillStyle='rgba(0,0,0,.2)';c.fillRect(x,y+r*h/12,w,2);c.fillStyle='rgba(255,255,255,.35)';c.fillRect(x,y+r*h/12+2,w,1.5)}c.fillStyle='#8b2a36';c.fillRect(x,y+h-.1*u,w,.1*u);c.fillStyle='#0a0a0a';c.fillRect(x+w/2-.15*u,y+.06*u,.3*u,.3*u);c.fillStyle='#ece8e1';c.font='900 '+(.22*u)+'px Unbounded, Arial Black, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(k+1),x+w/2,y+.22*u)}}
    placa(c,m,1.15*u,.17*u,1.7*u,.3*u,0x151413,true,'ALMACÉN');});
  var fx=fachada(2.6,1.9,function(c,W,H,m){var u=W/2.6;paredEstuco(c,m,W,H,0xcbcfb6);banda(c,m,0,0,W,.12*u,0x24221f);banda(c,m,0,1.72*u,W,.18*u,0x8c8378);
    ventana(c,m,.3*u,.5*u,.6*u,.7*u,{});ventana(c,m,1.1*u,.5*u,.6*u,.7*u,{on:true});
    if(!m.glow){c.fillStyle='#151413';c.fillRect(1.82*u,.7*u,.6*u,1.0*u);c.fillStyle='#ece8e1';c.fillRect(1.87*u,.75*u,.5*u,.9*u);for(var i=0;i<5;i++){c.fillStyle=i%2?'#151413':'#cdbfa6';c.fillRect(1.82*u,1.7*u-i*.08*u,.6*u,.04*u)}logoV(c,1.9*u,.32*u,.34*u,'#8b2a36')}});
  cuerpo(g,4,1.9,2.6,0xd2d5bd,fz,fx,0,.3,-.2);bx(g,4.16,.2,2.76,BEIGE,0,2.2,-.2,{borde:false});
  aguas(g,4.4,3.0,1.25,chapaM(),0,2.4,-.2,0xcbcfb6);
  [-1.2,0,1.2].forEach(function(x){cy(g,.16,.16,.35,0x8c8378,x*.5+.3,3.0,x,10,{borde:false});cono(g,.22,.14,0x6a665c,x*.5+.3,3.35,x,10,{borde:false})});
  /* rampa de carga y pallets con cajas de marca */
  var r=bx(g,1.8,.1,1.0,0x8c8378,0,0,1.5,{borde:false});r.rotation.x=.12;r.position.y=.15;
  var pm=maderaM();[[-1.9,1.9],[-1.9,2.5]].forEach(function(p,i){bx(g,.9,.12,.9,pm,p[0]-.5,0,p[1]-.2,{dn:1.2,borde:false});cajaVOW(g,.7,.5,.7,p[0]-.5,.12,p[1]-.2);if(i===0)cajaVOW(g,.6,.45,.6,p[0]-.5,.62,p[1]-.2,0xb89868)});
  bx(g,.5,.5,.5,0x8c8378,-2.35,.0,1.1,{borde:false});
  /* autoelevador */
  var af=new THREE.Group();af.position.set(2.3,0,2.1);af.rotation.y=-.3;g.add(af);bx(af,.9,.5,.6,BORDO,0,.2,0);bx(af,.55,.5,.5,0x24221f,-.1,.7,0,{borde:false});bx(af,.06,1.2,.06,0x6a665c,.55,.15,.2,{borde:false});bx(af,.06,1.2,.06,0x6a665c,.55,.15,-.2,{borde:false});bx(af,.5,.05,.12,0x8c8378,.8,.2,.18,{borde:false});bx(af,.5,.05,.12,0x8c8378,.8,.2,-.18,{borde:false});[[.3,.28],[-.3,.28],[.3,-.28],[-.3,-.28]].forEach(function(p){cy(af,.14,.14,.12,0x151413,p[0],.0,p[1],10,{borde:false}).rotation.x=Math.PI/2});
  /* cajas que aparecen cuando llega cada producto */
  [['gorras',0x8b2a36,-1.4],['medias',0xcdbfa6,0],['shakers',0x5e8793,1.4]].forEach(function(c){
    var cg=new THREE.Group();cg.userData.noFusion=true;cg.position.set(c[2],0,2.3);bx(cg,.8,.7,.8,c[1],0,.3,0);bx(cg,.7,.55,.7,c[1],.1,1.0,.05);bx(cg,.82,.08,.82,0x0a0a0a,0,.7,0,{borde:false});
    var lg=lienzo(64,64,function(cc){logoV(cc,14,10,36,'#ece8e1')});cg.add(plano(lg,.5,.5,0,.5,.41,0));g.add(cg);cg.visible=false;CAJAS[c[0]]=cg});
  /* camioneta de reparto estacionada */
  var cm=new THREE.Group();cm.position.set(CHAPA.x,0,CHAPA.z);cm.rotation.y=.04;scene.add(cm);
  bx(cm,2.2,1.1,1.0,HUESO,-.1,.35,0);bx(cm,.9,.8,.96,0xe3dccb,1.35,.35,0);bx(cm,.4,.5,.9,0x3a4a52,1.62,.7,0,{borde:false});bx(cm,2.2,.15,1.02,BORDO,-.1,.7,0,{borde:false});
  var tl=lienzo(256,128,function(c,W,H){c.fillStyle='rgba(0,0,0,0)';logoV(c,W/2-92,22,56,'#8b2a36');c.fillStyle='#16140f';c.font='900 34px Unbounded, Arial Black, sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText('VOW',W/2-26,50)});
  cm.add(plano(tl,1.6,.8,-.1,.95,.51,0));[[-.8,.5],[.9,.5],[-.8,-.5],[.9,-.5]].forEach(function(p){cy(cm,.22,.22,.14,0x151413,p[0],.0,p[1]>0?.46:-.6,12,{borde:false}).rotation.x=Math.PI/2});
  bx(cm,.18,.12,.04,0xffe3b0,1.82,.5,.3,{borde:false});bx(cm,.18,.12,.04,0xffe3b0,1.82,.5,-.3,{borde:false});
  hit(g,5,4);
}
/* ================= Agenda de hoy: el cartel de la plaza ================= */

/* ================= Caja: el local donde se registra cada venta ================= */
var CAJA_PANT=null;
function dibujarCajaPantalla(c,W,H){
  var v=(typeof D==='object'&&D.inv&&D.inv.totales&&D.inv.totales.hoy)||null,pesos=function(n){return '$'+Number(n||0).toLocaleString('es-AR')};
  c.fillStyle='#0a0a0a';c.fillRect(0,0,W,H);c.fillStyle='#1f2a1f';c.fillRect(4,4,W-8,H-8);
  c.fillStyle='#7dc59a';c.font='700 15px "IBM Plex Mono", monospace';c.textAlign='left';c.textBaseline='middle';c.fillText('HOY',10,16);
  c.textAlign='right';c.font='700 24px "IBM Plex Mono", monospace';c.fillStyle=v?'#bff0d0':'#4f6b58';c.fillText(v?pesos(v.importe):'—',W-10,H*.56);
  c.font='500 13px "IBM Plex Mono", monospace';c.fillStyle='#7dc59a';c.fillText(v?(v.ventas+(v.ventas===1?' venta':' ventas')):'sin conexión',W-10,H-14)}
function caja(){
  var g=nuevo('caja');
  bx(g,3.9,.3,3.5,adoqM(),0,0,0,{dn:.5});
  var fz=fachada(2.9,1.9,function(c,W,H,m){var u=W/2.9;
    paredEstuco(c,m,W,H,0xe9e2d3);banda(c,m,0,0,W,.13*u,0x8b2a36);
    placa(c,m,.35*u,.2*u,2.2*u,.42*u,0x0a0a0a,true,'CAJA',0xece8e1);
    /* ventanilla de atención con mostrador */
    var vx=.3*u,vy=.78*u,vw=1.5*u,vh=.85*u;
    if(!m.glow){c.fillStyle='#1b1a18';c.fillRect(vx-5,vy-5,vw+10,vh+10);var gr=c.createLinearGradient(0,vy,0,vy+vh);gr.addColorStop(0,'#6b5a4c');gr.addColorStop(1,'#2d231d');c.fillStyle=gr;c.fillRect(vx,vy,vw,vh);
      [['#8b2a36',.12],['#0a0a0a',.38],['#cdbfa6',.64]].forEach(function(p){c.fillStyle=p[0];c.fillRect(vx+vw*p[1],vy+vh*.3,vw*.2,vh*.55)});
      c.fillStyle='rgba(255,255,255,.13)';c.beginPath();c.moveTo(vx,vy+vh*.8);c.lineTo(vx+vw*.5,vy);c.lineTo(vx+vw*.68,vy);c.lineTo(vx,vy+vh);c.fill();
      c.fillStyle='#cdbfa6';c.fillRect(vx-8,vy+vh,vw+16,9)}
    else{var g2=c.createLinearGradient(0,vy,0,vy+vh);g2.addColorStop(0,'#ffd9a0');g2.addColorStop(1,'#d9893f');c.fillStyle=g2;c.fillRect(vx,vy,vw,vh)}
    ventana(c,m,2.05*u,.8*u,.62*u,.9*u,{arco:false,on:true,cruz:false});
    texto(c,m,'ABIERTO',2.36*u,1.72*u,.1*u,'#8b2a36')});
  var fx=fachada(2.5,1.9,function(c,W,H,m){var u=W/2.5;paredEstuco(c,m,W,H,0xe9e2d3);banda(c,m,0,0,W,.13*u,0x8b2a36);
    ventana(c,m,.4*u,.7*u,.7*u,.9*u,{postigos:0x8b2a36,flores:true});ventana(c,m,1.5*u,.7*u,.7*u,.9*u,{postigos:0x8b2a36})});
  cuerpo(g,2.9,1.9,2.5,0xe9e2d3,fz,fx,0,.3,0);
  bx(g,3.06,.14,2.66,0x8b2a36,0,2.2,0,{borde:false});
  aguas(g,3.2,2.8,.75,tejaBordo(),0,2.28,0,0xe9e2d3);
  toldo(g,1.9,.6,-.6,1.95,1.5,0,0x8b2a36,0xece8e1);
  /* caja registradora sobre el mostrador, con pantalla que muestra lo vendido hoy */
  bx(g,.62,.34,.5,0x2a2724,-.55,1.0,1.28);
  CAJA_PANT=lienzo(128,64,dibujarCajaPantalla);
  var pn=plano(CAJA_PANT,.5,.25,-.55,1.34,1.14,-.45);g.add(pn);
  bx(g,.56,.05,.4,0xcdbfa6,-.55,1.18,1.3,{borde:false});
  /* cartel de bandera sobre la puerta, bolsas de compra y un carrito con cajas */
  bandera(g,1.55,2.3,1.1,0x8b2a36,1.5);
  [[0xece8e1,1.15,1.95],[0x0a0a0a,1.35,2.15]].forEach(function(b){bx(g,.26,.34,.14,b[0],b[1]-.2,.3,b[2]+.35,{borde:false});logoMini(g,b[1]-.2,.34,b[2]+.43,.14)});
  bx(g,.9,.5,.5,0xc7ab7c,1.6,.3,2.25);bx(g,.9,.07,.5,0x8b6a3c,1.6,.8,2.25,{borde:false});
  planta(g,-1.45,1.9,0x8b2a36);planta(g,.2,2.0,0xece8e1);
  hit(g,3.9,3.4);
}
var CARTEL=null;
function cartelAgenda(){
  var g=new THREE.Group();g.position.set(EDIF.agenda.x,0,EDIF.agenda.z);g.rotation.y=Math.PI/4;g.userData.edif='agenda';scene.add(g);GRUPO.agenda=g;
  var mw=maderaM();
  [-.95,.95].forEach(function(x){bx(g,.12,1.7,.12,0x4a3b2a,x,0,0,{borde:false})});
  bx(g,2.2,1.45,.14,0x3a2e24,0,.75,0);
  CARTEL=lienzo(384,256,function(c,W,H){dibujarCartel(c,W,H)});
  var pl=plano(CARTEL,2.0,1.33,0,1.47,.085,0);g.add(pl);
  aguas(g,2.5,.6,.34,tejaBordo(),0,2.2,0,0x3a2e24);
  var gl=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshBasicMaterial({color:0xffe3b0}));gl.position.set(0,2.75,0);g.add(gl);FAROLES.push(gl.material);
  brillo(g,0,1.5,.3,2.6);
  var h=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.6,1.2),new THREE.MeshBasicMaterial({visible:false}));h.position.y=1.5;h.userData.edif='agenda';g.add(h);TOCABLES.push(h);
  planta(g,-.55,.55);planta(g,.55,.55);
}
function dibujarCartel(c,W,H){
  var f=new Date(),dias=['dom','lun','mar','mié','jue','vie','sáb'],items=[];try{items=agendaHoy()}catch(e){}
  c.fillStyle='#f3ecdc';c.fillRect(0,0,W,H);for(var y=64;y<H;y+=32){c.fillStyle='rgba(139,42,54,.10)';c.fillRect(0,y,W,1.5)}
  c.fillStyle='#151413';c.fillRect(0,0,W,56);c.fillStyle='#ece8e1';c.font='900 24px Unbounded, Arial Black, sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText('HOY',16,29);
  c.fillStyle='#cdbfa6';c.font='500 15px "IBM Plex Mono", monospace';c.textAlign='right';c.fillText(dias[f.getDay()]+' '+('0'+f.getDate()).slice(-2)+'/'+('0'+(f.getMonth()+1)).slice(-2),W-16,29);
  logoV(c,W/2-6,8,34,'#8b2a36');
  c.textAlign='left';
  if(!items.length){c.fillStyle='#5d584f';c.font='700 22px Unbounded, Arial Black, sans-serif';c.fillText('Día libre',20,128);c.font='500 15px "IBM Plex Mono", monospace';c.fillText('Nada agendado para hoy.',20,160)}
  items.slice(0,4).forEach(function(x,i){var y=86+i*42;c.fillStyle=x.hecha?'#7e8450':'#8b2a36';c.fillRect(16,y-12,6,26);
    c.fillStyle='#8c8378';c.font='600 14px "IBM Plex Mono", monospace';c.fillText(x.h||'hoy',32,y+2);
    c.fillStyle=x.hecha?'#8c8378':'#16140f';c.font='700 17px Archivo, Arial, sans-serif';var t=String(x.t);if(t.length>22)t=t.slice(0,21)+'…';c.fillText(t,98,y+2);if(x.hecha){c.fillRect(98,y+2,Math.min(220,c.measureText(t).width),2)}});
  if(items.length>4){c.fillStyle='#8b2a36';c.font='700 14px "IBM Plex Mono", monospace';c.textAlign='right';c.fillText('+'+(items.length-4)+' más',W-16,H-14)}
}
function dibujarMundo(){hq();taller();torre();estrategia();instagram();almacen();caja();cartelAgenda()}
