var foco={x:0,z:1.2},focoT={x:0,z:1.2},zoom=1,zoomT=1,desX=0,desY=0,desXT=0,desYT=0,selId=null;
/* cámara cinemática: al abrir o cerrar un edificio se acerca con curva suave y un leve giro (respeta "reducir movimiento") */
var cine=null,yaw=0,CINE_SEG=.95,REDUCIDO=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
function iniciarCine(){
  if(REDUCIDO){foco.x=focoT.x;foco.z=focoT.z;zoom=zoomT;desX=desXT;desY=desYT;cine=null;yaw=0;return}
  var mov=Math.abs(focoT.x-foco.x)+Math.abs(focoT.z-foco.z)+Math.abs(zoomT-zoom)*4+Math.abs(desXT-desX)*20+Math.abs(desYT-desY)*20;
  if(mov<.06){cine=null;return}
  cine={t0:performance.now(),f:{x:foco.x,z:foco.z},z:zoom,dx:desX,dy:desY,dir:selId?1:-1};
}
function pasoCine(n){
  var u=Math.min(1,(n-cine.t0)/(CINE_SEG*1000)),e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
  foco.x=cine.f.x+(focoT.x-cine.f.x)*e;foco.z=cine.f.z+(focoT.z-cine.f.z)*e;zoom=cine.z+(zoomT-cine.z)*e;desX=cine.dx+(desXT-cine.dx)*e;desY=cine.dy+(desYT-cine.dy)*e;
  yaw=Math.sin(Math.PI*u)*.11*cine.dir;if(u>=1){cine=null;yaw=0}
}
function ajustarCam(){
  var w=innerWidth,h=innerHeight,as=w/h;renderer.setSize(w,h,false);
  var hw=Math.max(11,13.2*as)/zoom,hh=hw/as;cam.left=-hw;cam.right=hw;cam.top=hh;cam.bottom=-hh;
  var cy2=Math.cos(yaw),sy2=Math.sin(yaw);cam.position.set(foco.x+30*cy2+30*sy2,37.5,foco.z-30*sy2+30*cy2);cam.lookAt(foco.x,0,foco.z);
  cam.setViewOffset(w,h,desX*w,desY*h,w,h);cam.updateProjectionMatrix();cam.updateMatrixWorld();
}
var sheetOn=false;
function pedirDesfase(){var ancho=innerWidth>=760,hj=$('hoja');var sw=hj?hj.offsetWidth:430,sh=hj?hj.offsetHeight:innerHeight*.6;desXT=sheetOn&&ancho?(sw+18)/(2*innerWidth):0;desYT=sheetOn&&!ancho?sh/(2*innerHeight):0;zoomT=sheetOn?(ancho?1.25:1.35):1}
function selecc(id){
  selId=id;sheetOn=!!id;pedirDesfase();
  if(id){var e=EDIF[id],l=Math.hypot(e.x,e.z),k=l>12?12/l:1;focoT.x=e.x*k;focoT.z=e.z*k}else{focoT.x=0;focoT.z=1.2}
  document.getElementById('app').classList.toggle('foco-on',!!id);iniciarCine();
  document.querySelectorAll('.plaza').forEach(function(p){p.classList.toggle('sel',p.dataset.k===id)});
}
var ptr={},arr=null,pinch0=0,zoom0=1,tap0=null;
function pxU(){return innerWidth/(2*(cam.right-cam.left)/2*1)}
canvas.addEventListener('pointerdown',function(e){canvas.setPointerCapture&&canvas.setPointerCapture(e.pointerId);ptr[e.pointerId]={x:e.clientX,y:e.clientY};var ks=Object.keys(ptr);
  if(ks.length===1)tap0={x:e.clientX,y:e.clientY,t:performance.now(),mov:0};
  if(ks.length===2){var a=ptr[ks[0]],b=ptr[ks[1]];pinch0=Math.hypot(a.x-b.x,a.y-b.y);zoom0=zoomT;tap0=null}});
canvas.addEventListener('pointermove',function(e){var p=ptr[e.pointerId];if(!p)return;var dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;var ks=Object.keys(ptr);
  if(ks.length===1){if(tap0)tap0.mov+=Math.abs(dx)+Math.abs(dy);
    if(tap0&&tap0.mov<10)return;cine=null;yaw=0;
    var hw=(cam.right-cam.left)/2,u=innerWidth/(2*hw),r=Math.SQRT1_2,a=dx/u,b=dy/(u*SIN_E);
    /* el mundo sigue al dedo: derecha de pantalla = (+x,-z), abajo de pantalla = (+x,+z) */
    focoT.x=Math.max(-11,Math.min(11,focoT.x-(a+b)*r));focoT.z=Math.max(-11,Math.min(11,focoT.z-(-a+b)*r));
    foco.x=focoT.x;foco.z=focoT.z}
  else if(ks.length===2){var a2=ptr[ks[0]],b2=ptr[ks[1]],d=Math.hypot(a2.x-b2.x,a2.y-b2.y);if(pinch0)zoomT=Math.max(.75,Math.min(2.4,zoom0*d/pinch0))}});
function soltar(e){var t=tap0;delete ptr[e.pointerId];if(Object.keys(ptr).length===0&&t&&t.mov<10&&performance.now()-t.t<450)tocar(e.clientX,e.clientY);if(Object.keys(ptr).length<2)pinch0=0;if(!Object.keys(ptr).length)tap0=null}
canvas.addEventListener('pointerup',soltar);canvas.addEventListener('pointercancel',function(e){delete ptr[e.pointerId];tap0=null});
canvas.addEventListener('wheel',function(e){e.preventDefault();zoomT=Math.max(.75,Math.min(2.4,zoomT*(e.deltaY<0?1.12:.89)))},{passive:false});
var ray=new THREE.Raycaster(),v2=new THREE.Vector2();
function tocar(x,y){
  v2.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);ray.setFromCamera(v2,cam);
  var h=ray.intersectObjects(TOCABLES,false)[0];
  if(h&&h.object.userData.edif)abrirEdif(h.object.userData.edif);else if(sheetOn)cerrarHoja();
}
/* para las capturas de prueba: mirar un punto con un zoom */
window.__mira=function(x,z,zm){focoT.x=x;focoT.z=z;zoomT=zm};
window.__info=function(){return {calls:renderer.info.render.calls,tri:renderer.info.render.triangles,geo:renderer.info.memory.geometries,tex:renderer.info.memory.textures}};
window.__cuenta=function(){var m=0,cs=0,out=0,sp=0;scene.traverse(function(o){if(o.isMesh){m++;if(o.castShadow)cs++;if(o.material===OUT)out++}if(o.isSprite)sp++});return {mallas:m,sombra:cs,contornos:out,sprites:sp}};
window.__desglose=function(){var r=[];scene.children.forEach(function(c){var n=0;c.traverse(function(o){if(o.isMesh)n++});if(n>8)r.push((c.userData.edif||c.type)+':'+n)});return r.join(' ')};
