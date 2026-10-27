/* ================= íconos propios: trazo recto y ángulos, como el isotipo ================= */
var ICO_D={
  ok:'M4.5 12.5 L9.5 17.5 L19.5 6.5',
  ver:'M2.5 12 C5 7.5 8.5 5.5 12 5.5 S19 7.5 21.5 12 C19 16.5 15.5 18.5 12 18.5 S5 16.5 2.5 12 Z M12 15 A3 3 0 1 0 12 9 A3 3 0 0 0 12 15 Z',
  alerta:'M12 4 L12 14 M12 18 L12 19.5',
  play:'M7 5 L19 12 L7 19 Z',
  caja:'M4 8 L12 4 L20 8 L20 17 L12 21 L4 17 Z M4 8 L12 12 L20 8 M12 12 L12 21',
  chat:'M4 5 L20 5 L20 16 L11 16 L6 20 L6 16 L4 16 Z',
  corazon:'M12 20 L4.2 12 L4.2 7.5 L8 5 L12 8 L16 5 L19.8 7.5 L19.8 12 Z',
  lapiz:'M5 19.5 L6 14.5 L15.5 5 L19 8.5 L9.5 18.5 Z M13.5 7 L17 10.5',
  cambiar:'M5 12 L5 9 L9 5.5 L16 5.5 M16 5.5 L13 2.8 M16 5.5 L13 8.5 M19 12 L19 15 L15 18.5 L8 18.5 M8 18.5 L11 21.2 M8 18.5 L11 15.5',
  calendario:'M4 6 L20 6 L20 20 L4 20 Z M4 10.5 L20 10.5 M8 3.5 L8 7.5 M16 3.5 L16 7.5',
  grafico:'M4 4 L4 20 L20 20 M7.5 15 L11 11 L14 13.5 L19.5 7 M15.5 7 L19.5 7 L19.5 11',
  enviar:'M5 19 L19 5 M9.5 5 L19 5 L19 14.5',
  torre:'M12 3 L12 21 M7 8 L12 3 L17 8 M8.5 14 L15.5 14 M6 21 L18 21',
  reloj:'M12 4 L20 12 L12 20 L4 12 Z M12 8 L12 12.5 L15 14.5',
  bandeja:'M3.5 13 L7 5 L17 5 L20.5 13 L20.5 19 L3.5 19 Z M3.5 13 L9 13 L10.5 16 L13.5 16 L15 13 L20.5 13',
  bandera:'M6 21 L6 4 L19 4 L16 8.5 L19 13 L6 13',
  film:'M3 7 L17 7 L17 17 L3 17 Z M17 10.5 L21 8 L21 16 L17 13.5',
  candado:'M6 11 L18 11 L18 20 L6 20 Z M8.5 11 L8.5 7.5 L12 4.5 L15.5 7.5 L15.5 11',
  borrador:'M5 4 L15 4 L19 8 L19 20 L5 20 Z M15 4 L15 8 L19 8 M8.5 13 L15.5 13 M8.5 16.5 L13 16.5'
};
function ico(n,px,cl){var NS='http://www.w3.org/2000/svg',s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('width',px||18);s.setAttribute('height',px||18);s.setAttribute('class','ico'+(cl?' '+cl:''));s.setAttribute('aria-hidden','true');var p=document.createElementNS(NS,'path');p.setAttribute('d',ICO_D[n]||ICO_D.ok);s.appendChild(p);return s}
function botonIco(n,t,cl,fn){var b=boton('',cl,fn);b.appendChild(ico(n,16));b.appendChild(document.createTextNode(t));return b}
/* los números suben contando cuando cambian */
var NUMS={};
function animarNum(id,nodo,valor,fmt){
  fmt=fmt||function(x){return String(x)};var b=Number(valor);
  if(!isFinite(b)){nodo.textContent=String(valor);return}
  var a=NUMS[id]!=null?NUMS[id]:0;NUMS[id]=b;
  if(a===b||REDUCIDO){nodo.textContent=fmt(b);return}
  var t0=performance.now();(function paso(n){var q=Math.min(1,(n-t0)/520),e=1-Math.pow(1-q,3);nodo.textContent=fmt(Math.round(a+(b-a)*e));if(q<1)requestAnimationFrame(paso)})(t0);
}

/* ================= qué necesita tu ojo en cada edificio ================= */
var TAREAS={},ESTADO_EDIF={},panelAbierto=null,CAMBIANDO={},CFABRE={},CFTXT={},EDABRE={},EDTXT={},EDARCH={},EDOCUPADO={};
function fmtN(n){return Number(n).toLocaleString('es-AR')}
function quienPend(p){
  var t=p.t||'';
  if(/informe|investigaci|\bplan\b/i.test(t))return 'estrategia';
  return EDIF[p.sala]?p.sala:'estrategia';
}
/* «Aprobar la pieza del 27/10» es la pieza misma: se muestra con sus botones, no como una línea suelta */
function piezaDe(p){
  if(p.sala!=='diseno'||!/^(aprobar|revisar)/i.test(p.t||''))return null;
  var t=p.t||'',ls=lista('piezas').filter(function(x){return x.estado!=='publicado'}),m=/(\d{1,2})\/(\d{1,2})/.exec(t),q=/«(.+?)»/.exec(t),r=null;
  if(q)r=ls.filter(function(x){return x.titulo===q[1]})[0];
  if(!r&&m){var dd2=('0'+m[1]).slice(-2),mm=('0'+m[2]).slice(-2);r=ls.filter(function(x){return x.fecha&&x.fecha.slice(8,10)===dd2&&x.fecha.slice(5,7)===mm})[0]}
  return r||null;
}
function esFutura(e){var d=pd(e.fecha);return e.estado!=='publicado'||(d&&dias(d)>=-1)}
function calcularTareas(){
  var T={};ORDEN.forEach(function(k){T[k]=[]});
  var alta=/^(aprobar|revisar)/i,media=/^(confirmar|definir|elegir|decidir)|por confirmar/i;
  lista('pendientes').forEach(function(p){
    if(piezaDe(p))return;
    var t=p.t||'',a=alta.test(t),m=false;if(!(a||m))return;
    T[quienPend(p)].push({id:kPend(p),t:t,alta:a,p:p});
  });
  lista('piezas').forEach(function(p){
    if(p.estado!=='por aprobar'||HECHO[kPieza(p)]||esConfirmable(p))return;
    var d=pd(p.fecha);T.diseno.push({id:'pz'+kPieza(p),t:'Aprobar «'+(p.titulo||'pieza')+'»'+(d?' ('+dd(d)+')':''),alta:true,pieza:p});
  });
  lista('piezas').forEach(function(p){
    if(!esConfirmable(p))return;
    var d=pd(p.fecha);T.diseno.push({id:'cf'+p._id,t:'Confirmar la publicación de hoy «'+(p.titulo||'pieza')+'»'+(p._hora?' ('+p._hora+')':''),alta:true,pieza:p});
  });
  var te=tests();if(te.falla)T.bot.push({id:'bot|tests',t:'Los tests fallan: '+te.txt,alta:true,fija:true});
  TAREAS=T;ESTADO_EDIF={};
  ORDEN.forEach(function(k){ESTADO_EDIF[k]={alta:T[k].filter(function(x){return x.alta}).length,media:T[k].filter(function(x){return !x.alta}).length}});
  var ta=0,tm=0;ORDEN.forEach(function(k){if(k!=='hq'){ta+=ESTADO_EDIF[k].alta;tm+=ESTADO_EDIF[k].media}});ESTADO_EDIF.hq={alta:ta,media:tm};
}
function esConfirmable(p){var d=pd(p.fecha);return !!(p._id&&d&&dias(d)===0&&(p._est==='aprobada'||p._est==='propuesta'))}
function cumplirTarea(t){if(t.pieza)aprobarPieza(t.pieza);else if(t.p)cumplirPend(t.p)}

/* ================= placas, globos y barra de recursos ================= */
var PLACAS={},GLOBOS={};
(function(){
  var capa=$('capa');
  ORDEN.forEach(function(k){
    var p=el('div','plaza');p.dataset.k=k;var c=el('div','pl');c.appendChild(el('b',null,EDIF[k].n));c.appendChild(el('span',null,''));p.appendChild(c);capa.appendChild(p);PLACAS[k]=p;
    var g=el('div','globo','');g.style.display='none';g.setAttribute('role','button');g.tabIndex=0;g.addEventListener('click',function(ev){ev.stopPropagation();tocarBurbuja(k)});g.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();tocarBurbuja(k)}});capa.appendChild(g);GLOBOS[k]=g;
  });
})();

/* ================= burbujas: lo más urgente de cada edificio, con su acción ================= */
var ARMADA={},VISTOS={};
try{VISTOS=JSON.parse(localStorage.getItem('vow_oficina_vistos')||'{}')||{}}catch(e){VISTOS={}}
function marcarVisto(id){VISTOS[id]=Date.now();try{var o={};Object.keys(VISTOS).forEach(function(k){if(Date.now()-VISTOS[k]<86400000)o[k]=VISTOS[k]});VISTOS=o;localStorage.setItem('vow_oficina_vistos',JSON.stringify(o))}catch(e){}actualizarMundo()}
/* "Cambiar todo" terminó (bien o mal) hace poco y todavía no lo viste */
function cambioReciente(){
  var c=VIVO&&VIVO.cambios,mejor=null;if(!c)return null;
  Object.keys(c).forEach(function(cl){var x=c[cl];if(!x||(x.estado!=='listo'&&x.estado!=='error'))return;if(!(Date.now()-Date.parse(x.en)<15*60000))return;var id=cl+'|'+x.en;if(VISTOS[id])return;if(!mejor||x.en>mejor.en)mejor={estado:x.estado,en:x.en,id:id,motivo:x.motivo}});
  return mejor;
}
var ICO_EDIF={hq:'bandeja',diseno:'ok',bot:'alerta',estrategia:'grafico',recepcion:'corazon',deposito:'caja',caja:'caja'};
function burbujaDe(k){
  var T=TAREAS[k]||[],s=ESTADO_EDIF[k]||{alta:0,media:0};
  if(k==='diseno'){
    var cb=cambioReciente();
    if(cb)return cb.estado==='listo'?{ico:'cambiar',txt:'Sugerencia lista',n:0,accion:'abrir',cb:cb,urg:true}:{ico:'alerta',roja:true,txt:'No se cambió',n:0,accion:'abrir',cb:cb,urg:true};
    var cf=T.filter(function(x){return x.pieza&&String(x.id).indexOf('cf')===0});
    if(cf.length===1)return {ico:'enviar',txt:'Confirmar',n:1,accion:'confirmar',pieza:cf[0].pieza,urg:true};
    var ap=T.filter(function(x){return x.pieza&&String(x.id).indexOf('cf')!==0});
    if(ap.length===1&&T.length===1)return {ico:'ok',txt:'¿Aprobar?',n:1,accion:'aprobar',pieza:ap[0].pieza,urg:true};
  }
  if(!(s.alta||s.media))return null;
  var n=s.alta+s.media,uno=T.length===1?T[0]:null,ic=ICO_EDIF[k]||'alerta';
  if(k==='bot'&&tests().falla)return {ico:'alerta',roja:true,txt:'Tests mal',n:n,accion:'abrir',urg:true};
  if(k==='hq')return {ico:ic,txt:'',n:n,accion:'abrir',urg:!!s.alta,suave:!s.alta};
  if(uno&&uno.p&&!uno.fija)return {ico:ic,txt:'¿Hecho?',n:1,accion:'cumplir',tarea:uno,urg:!!s.alta,suave:!s.alta};
  return {ico:ic,txt:'',n:n,accion:'abrir',urg:!!s.alta,suave:!s.alta};
}
function pintarBurbuja(k){
  var b=burbujaDe(k),g=GLOBOS[k];
  if(!b){g.style.display='none';g.dataset.sig='';return}
  var arm=!!(ARMADA[k]&&ARMADA[k]>Date.now()),sig=[b.ico,b.n,b.txt,b.suave,b.roja,arm].join('|');
  g.style.display='';
  if(g.dataset.sig===sig)return;
  g.dataset.sig=sig;g.className='globo'+(b.suave?' suave':'')+(b.roja?' roja':'')+(arm?' armada':'');
  g.textContent='';var gi=el('span','gi');gi.appendChild(ico(b.ico,15));
  if(b.n>1)gi.appendChild(el('span','gn',b.n>9?'9+':String(b.n)));
  if(b.txt&&(arm||b.cb))gi.appendChild(el('span','gl',b.txt));
  g.appendChild(gi);g.setAttribute('aria-label',(b.txt||'Pendientes')+' en '+(EDIF[k]||{}).n);
}
function tocarBurbuja(k){
  var b=burbujaDe(k);if(!b)return;
  if(b.accion==='abrir'){if(b.cb)marcarVisto(b.cb.id);abrirEdif(k,false,true);return}
  if(b.accion==='confirmar'){confirmarPieza(b.pieza);return}
  /* aprobar y marcar como hecho piden un segundo toque: así un toque de más no decide nada */
  if(!(ARMADA[k]&&ARMADA[k]>Date.now())){ARMADA[k]=Date.now()+3500;pintarBurbuja(k);setTimeout(function(){pintarBurbuja(k)},3600);return}
  ARMADA[k]=0;pintarBurbuja(k);
  if(conectado!=='vivo'){aviso('Sin conexión con el bot: no se puede hacer ahora.',5000);return}
  if(b.accion==='aprobar')aprobarPieza(b.pieza);else if(b.accion==='cumplir')cumplirTarea(b.tarea);
}
/* ================= agenda del día (cartel de la plaza) ================= */
function agendaHoy(){
  var out=[];
  lista('agenda').forEach(function(x){var d=pd(x.f);if(d&&dias(d)===0)out.push({h:x.h||'',t:x.t,ico:'calendario',sala:x.sala})});
  lista('piezas').forEach(function(p){var d=pd(p.fecha);if(!d||dias(d)!==0)return;var t=(p.titulo||'');if(t&&out.some(function(o){return String(o.t).indexOf(t)>-1}))return;out.push({h:p._hora||'',t:(p.formato||'pieza')+' · '+(t||'sin título'),ico:'calendario',sala:'diseno',hecha:p.estado==='publicado'})});
  var dep=D.deposito||{};['gorras','medias','shakers'].forEach(function(x){var e=estadoLlegada(dep[x]);if(e.txt==='llega hoy')out.push({h:'',t:'Llega: '+x,ico:'caja',sala:'deposito'})});
  out.sort(function(a,b){return (a.h||'99:99').localeCompare(b.h||'99:99')});
  return out;
}
function lineaDato(k){
  var e=D.estrategia||{},b=D.bot||{};
  if(k==='hq'){var n=ESTADO_EDIF.hq.alta+ESTADO_EDIF.hq.media;return n?n+' pendiente'+(n>1?'s':''):'todo al día'}
  if(k==='diseno'){var p=proximaPieza();return p?dd(pd(p.fecha))+' · '+p.formato+(p.hora?' '+p.hora:''):'sin piezas'}
  if(k==='bot'){if(conectado!=='vivo')return 'sin conexión';return (b.pausa?'en pausa':'activo')+(tests().falla?' · tests mal':'')}
  if(k==='estrategia'){if(D.estr){var nl=D.estr.lineas.length;return nl+(nl===1?' línea':' líneas')+' esta semana'}var f=pd(e.plan);return f?'plan '+rel(dias(f)):'sin plan'}
  if(k==='recepcion'){var c=D.rendimiento&&D.rendimiento.cuenta;return c&&c.seguidores!=null?fmtN(c.seguidores)+' seguidores':'@vow_ar'}
  if(k==='deposito'){var st=D.inv&&D.inv.stock;if(!st)return conectado==='vivo'?'sin datos':'sin conexión';var tu=totalUnidades(st);return tu?tu+(tu===1?' unidad':' unidades'):'sin stock'}
  if(k==='caja'){var iv=D.inv;if(!iv)return conectado==='vivo'?'sin datos':'sin conexión';var h=iv.totales.hoy;return h.ventas?h.ventas+(h.ventas===1?' venta':' ventas')+' · '+pesos(h.importe):'sin ventas hoy'}
  return '';
}
function proximaPieza(){return lista('piezas').filter(function(x){var d=pd(x.fecha);return d&&d>=hoy()&&x.estado!=='publicado'}).sort(function(a,b){return a.fecha<b.fecha?-1:1})[0]}
function pintarRecursos(){
  var r=$('res');r.textContent='';
  function pil(ic,gr,pq,alerta,id,num,fmt){var b=el('button','rec'+(alerta?' alerta':''));b.type='button';var i=el('span','ic');i.appendChild(ico(ic,15));var t=el('span');t.appendChild(el('small',null,pq));var bb=el('b',null,gr);t.appendChild(bb);b.appendChild(i);b.appendChild(t);b.addEventListener('click',function(){abrirEdif(id)});r.appendChild(b);if(num!=null)animarNum('pil'+pq,bb,num,fmt)}
  var n=ESTADO_EDIF.hq.alta,p=proximaPieza(),b=D.bot||{},c=D.rendimiento&&D.rendimiento.cuenta;
  pil('bandeja',String(n+ESTADO_EDIF.hq.media),'PENDIENTES',n>0,'hq',n+ESTADO_EDIF.hq.media);
  pil('play',p?dd(pd(p.fecha))+' '+p.formato:'—','PRÓXIMA',false,'diseno');
  pil('torre',conectado!=='vivo'?'sin datos':(b.pausa?'en pausa':'activo'),'BOT',tests().falla||b.pausa,'bot');
  if(c&&c.seguidores!=null)pil('corazon',fmtN(c.seguidores),'SEGUIDORES',false,'recepcion',c.seguidores,fmtN);
}
function actualizarEstado(){
  var av=$('sinCon'),vivo=conectado==='vivo';
  av.hidden=vivo||conectado==='vacio';
  if(!vivo){
    av.textContent='';av.appendChild(el('span',null,conectado==='error'?'No llega al bot'+(ERR_TXT?' ('+ERR_TXT+')':'')+'. Lo que ves son solo los documentos del repo: no incluye las piezas nuevas ni se guarda nada.':conectado==='clave'?'La clave no es válida. Sin conexión no se guarda nada.':'Sin conexión con el bot: ves solo los documentos del repo y no se guarda nada.'));
    if(conectado==='clave'||conectado==='no'){var b=el('button','ck sec','Poner clave');b.type='button';b.addEventListener('click',function(){pedirClave('Ingresá la clave de la oficina.')});av.appendChild(b)}
  }
  var e=$('est'),l=$('luz');l.className='';
  if(conectado==='no')e.textContent=leerClave()?'conectando con el bot…':'solo documentos (sin clave)';
  else if(conectado==='error')e.textContent='sin conexión con el bot · '+(ERR_TXT||'error');
  else if(conectado==='clave')e.textContent='falta la clave de la oficina';
  else if(conectado==='vacio')e.textContent='todavía no hay datos';
  else e.textContent='en vivo';
  l.className=conectado==='vivo'?'vivo':(conectado==='no'?'':'mal');
}
function actualizarMundo(){
  ORDEN.forEach(function(k){
    PLACAS[k].querySelector('span').textContent=lineaDato(k);
    pintarBurbuja(k);
  });
  var sk=(D.inv&&D.inv.stock)||{},hay={gorras:(sk['gorra-negra']||0)+(sk['gorra-beige']||0),medias:sk.medias||0,shakers:(sk['shaker-negro']||0)+(sk['shaker-claro']||0)};
  Object.keys(hay).forEach(function(x){if(CAJAS[x])CAJAS[x].visible=hay[x]>0});
  if(CAJA_PANT){var sc=JSON.stringify(D.inv&&D.inv.totales&&D.inv.totales.hoy);if(sc!==CAJA_PANT.sig){CAJA_PANT.sig=sc;redibujar(CAJA_PANT)}}
  if(LUCES.bot)LUCES.bot.material.color.set(conectado!=='vivo'?0x888888:(tests().falla||(D.bot||{}).pausa)?0xd0564a:0x7da36b);
  if(PHONE)redibujar(PHONE);if(PANTALLA)redibujar(PANTALLA);if(CARTEL){var sg;try{sg=JSON.stringify(agendaHoy())+new Date().getDate()}catch(e){sg=''}if(sg!==CARTEL.sig){CARTEL.sig=sg;redibujar(CARTEL)}}
}
var sigPanel='';
function firmaDatos(){return JSON.stringify([VIVO&&VIVO.version,conectado,Object.keys(HECHO),Object.keys(NOTAS),Object.keys(CAMBIANDO),Object.keys(EDOCUPADO),(D.sistema||{}).tests,(D.sistema||{}).evals,D.actualizado,Object.keys(MED.piezas||{}).length])}
function aplicar(){
  calcularTareas();actualizarMundo();pintarRecursos();actualizarEstado();pintarChat();
  var sg=firmaDatos(),igual=sg===sigPanel;sigPanel=sg;
  if(panelAbierto&&!igual){var ae=document.activeElement,ed=ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName),vp=document.querySelector('#cuerpo video');if(!ed&&!(vp&&!vp.paused))abrirEdif(panelAbierto,true)}
}
var anc=new THREE.Vector3();
function ponerCapa(){
  var w=innerWidth,h=innerHeight;
  ORDEN.forEach(function(k){
    var e=EDIF[k];
    anc.set(e.x+2.3,0,e.z+2.3);anc.project(cam);
    var sx=(anc.x*.5+.5)*w,sy=(-anc.y*.5+.5)*h;
    PLACAS[k].style.transform='translate('+sx.toFixed(1)+'px,'+(sy+2).toFixed(1)+'px) translate(-50%,0)';
    anc.set(e.x,e.alto+.4,e.z);anc.project(cam);
    GLOBOS[k].style.transform='translate('+((anc.x*.5+.5)*w).toFixed(1)+'px,'+((-anc.y*.5+.5)*h).toFixed(1)+'px) translate(-50%,-100%)';
  });
}

/* ================= tarjeta de una pieza: ver, aprobar o pedir otra ================= */
var PEDIDOS={};
function claveCambio(pz){return pz._id?String(pz._id):'f:'+pz.fecha}
/* progreso de "Cambiar todo": paso actual que informa el servidor + reloj que corre solo, así se nota que no está trabado */
function seg(n){n=Math.max(0,Math.floor(n));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')}
function bloqueProgreso(e){
  var c=VIVO&&VIVO.cambios&&VIVO.cambios[claveCambio(e)],d=el('div','avance');
  var desde=c&&c.en?Date.parse(c.en):(PEDIDOS[e._id||kPieza(e)]||{}).t||Date.now();
  var paso=(c&&c.paso)||'Mandando el pedido a la IA…';
  d.appendChild(el('span','girar'));
  var t=el('div','progt');t.appendChild(el('strong',null,'La IA está armando otra sugerencia'));t.appendChild(el('div','mono',paso));
  var r=el('div','mono');r.appendChild(document.createTextNode('Lleva '));var x=el('b','reloj');x.setAttribute('data-desde',String(desde));x.textContent=seg((Date.now()-desde)/1000);r.appendChild(x);r.appendChild(document.createTextNode(' · suele tardar 1 o 2 minutos. Si pasa de 5, avisa que se cortó.'));
  t.appendChild(r);d.appendChild(t);return d;
}
setInterval(function(){var n=document.querySelectorAll('.reloj[data-desde]');for(var i=0;i<n.length;i++)n[i].textContent=seg((Date.now()-Number(n[i].getAttribute('data-desde')))/1000)},1000);
function cambiandoAhora(e){
  var c=VIVO&&VIVO.cambios&&VIVO.cambios[claveCambio(e)];
  return !!(CAMBIANDO[e._id||kPieza(e)]||(c&&c.estado==='trabajando'));
}
/* "Cambiar todo" corre en el servidor: acá se mira cómo va, así no depende de que la conexión aguante */
function revisarCambios(){
  Object.keys(PEDIDOS).forEach(function(ck){
    var p=PEDIDOS[ck],c=VIVO&&VIVO.cambios&&VIVO.cambios[p.clave];
    function fin(){delete PEDIDOS[ck];delete CAMBIANDO[ck];delete CFABRE[p.kc];delete CFTXT[p.kc];delete EDABRE[p.kc];delete EDTXT[p.kc];delete EDARCH[p.kc]}
    if(c&&c.estado==='listo'){fin();aviso('Nueva sugerencia lista: revisala y aprobala',5000)}
    else if(c&&c.estado==='error'){fin();aviso('No se cambió nada: '+(c.motivo||'no se pudo armar la sugerencia'),9000)}
    else if(Date.now()-p.t>6*60000){fin();aviso('No se supo cómo terminó: recargá y revisá la pieza.',8000)}
  });
}
function pedirCambio(pz,indicacion){
  indicacion=(indicacion||'').trim();var kc=String(pz._id||kPieza(pz)),ck=pz._id||kc;
  if(conectado!=='vivo'){aviso('Sin conexión con el bot: el cambio no se guardaría. Revisá el aviso de arriba.',6000);return}
  if(cambiandoAhora(pz))return;CAMBIANDO[ck]=true;refrescar();
  aviso('Pedido enviado: abajo ves cómo va');
  /* una pieza que solo está en los documentos no tiene fila: el servidor la arma nueva en el momento para ese día */
  var cuerpo=pz._id?{accion:'cambiar_pieza',id:pz._id,indicacion:indicacion}:{accion:'cambiar_pieza',fecha:pz.fecha,formato:pz.formato,indicacion:indicacion,base:pz.texto||pz.titulo||''};
  api('/oficina/accion',{body:cuerpo}).then(function(r){
    if(r&&r.trabajando){PEDIDOS[ck]={clave:claveCambio(pz),kc:kc,t:Date.now()};return leerVivo(true)}
    delete CAMBIANDO[ck];delete CFABRE[kc];delete CFTXT[kc];aviso('Nueva sugerencia lista: revisala y aprobala',5000);return leerVivo(true);
  }).catch(function(e){delete CAMBIANDO[ck];refrescar();aviso(e.estado===401?'La clave no es válida':('No se cambió nada: '+(e.message||'no se pudo armar la sugerencia')),8000);if(e.estado===401)pedirClave('La clave no es válida.')});
}
function formCambio(pz){
  var fo=el('form','nota');var ta=el('input');ta.type='text';ta.placeholder='¿Algo en particular? (opcional)';ta.maxLength=300;
  var sb=el('button','ck si','Generar otra y reemplazar esta');sb.type='submit';fo.appendChild(ta);fo.appendChild(sb);
  fo.addEventListener('submit',function(e){e.preventDefault();pedirCambio(pz,ta.value)});return fo;
}
/* de una pieza solo se muestra el contenido visual y el epígrafe */
function epigrafeDe(e,m){
  if(e.epigrafe)return String(e.epigrafe).trim();
  var t=(m&&m.md)||e.texto||'',x=/\*\*Epígrafe:\*\*\s*([\s\S]*?)(?:\n\s*\n|\n\*\*|$)/.exec(t)||/(?:^|\n)##\s*Epígrafe\s*\n+([\s\S]*?)(?:\n\s*\n##|\n##|$)/.exec(t);
  return x?x[1].replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ ?\n ?/g,'\n').replace(/\n{3,}/g,'\n\n').trim():'';
}

/* ================= Editar: la publicación misma (tipo, epígrafe con párrafos, archivo) ================= */
var TIPOS=[['imagen','Publicación (una foto)'],['carrusel','Carrusel (varias fotos)'],['reel','Reel (video)'],['story','Historia']];
function normFmt(f){f=String(f||'').toLowerCase();return /stor|histor/.test(f)?'story':/reel/.test(f)?'reel':/carrus/.test(f)?'carrusel':'imagen'}
function aJpeg(file){return new Promise(function(ok,mal){
  if(file.type==='image/jpeg')return ok(file);
  var u=URL.createObjectURL(file),im=new Image();
  im.onload=function(){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0);c.toBlob(function(b){URL.revokeObjectURL(u);b?ok(b):mal(new Error('No pude convertir la imagen a JPEG'))},'image/jpeg',.92)};
  im.onerror=function(){URL.revokeObjectURL(u);mal(new Error('No pude leer esa imagen'))};im.src=u})}
function mimeVideo(f){var n=(f.name||'').toLowerCase();return f.type==='video/mp4'||/\.mp4$/.test(n)?'video/mp4':(f.type==='video/quicktime'||/\.mov$/.test(n)?'video/quicktime':null)}
function subirArchivo(id,blob,mime,reemplazar){
  return fetch(API+'/api/programacion/oficina/archivo?id='+id+(reemplazar?'&reemplazar=1':''),{method:'POST',headers:{Authorization:'Bearer '+leerClave(),'Content-Type':mime},body:blob}).then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){if(!r.ok){var er=new Error(j.error||('HTTP '+r.status));er.estado=r.status;throw er}return j})})}
/* revisa que los archivos elegidos sirvan para el tipo; devuelve el error o ''.  Un reel lleva 1 video, una publicación 1 foto, un carrusel 2 a 20 fotos, una historia 1 foto o video */
function revisarArchivos(tipo,fs){
  var vids=fs.filter(function(f){return /^video\//.test(f.type)||mimeVideo(f)}),imgs=fs.filter(function(f){return /^image\//.test(f.type)});
  if(fs.length&&vids.length+imgs.length<fs.length)return 'Solo se pueden subir fotos o videos MP4.';
  if(tipo==='reel'&&(imgs.length||vids.length>1))return 'Un reel lleva un solo video.';
  if((tipo==='imagen'||tipo==='carrusel')&&vids.length)return 'Una publicación de fotos no lleva video: elegí Reel o Historia.';
  if((tipo==='imagen'||tipo==='story')&&fs.length>1)return tipo==='imagen'?'Una publicación de una foto lleva una sola. Para varias, elegí Carrusel.':'Una historia lleva una sola foto o video.';
  if(vids.some(function(f){return !mimeVideo(f)}))return 'El video tiene que ser MP4 o MOV.';
  if(fs.some(function(f){return f.size>40*1024*1024}))return 'Cada archivo puede pesar hasta 40 MB.';
  return '';
}
function epiEditable(e,m){return e._id?(e._epi||''):epigrafeDe(e,m)}
function guardarEditar(e,k){
  var t=EDTXT[k]||{},fs=EDARCH[k]||[],fmt0=normFmt(e._fmt||e.formato),m=(MED.piezas||{})[kMed(e)]||{},epi0=epiEditable(e,m);
  if(conectado!=='vivo'){aviso('Sin conexión con el bot: no se guardó.',6000);return}
  var tipo=t.tipo||fmt0,epi=t.epi!=null?t.epi:epi0,problema=revisarArchivos(tipo,fs);
  if(problema){aviso(problema,7000);return}
  var cambios={};if(tipo!==fmt0)cambios.formato=tipo;if(epi.trim()!==epi0.trim())cambios.epigrafe=epi;
  if(e._id&&t.hora&&t.hora!==(e._hora||''))cambios.hora=t.hora;
  if(!Object.keys(cambios).length&&!fs.length){aviso('No cambiaste nada');return}
  if(!Object.keys(cambios).length&&!e._id)cambios.epigrafe=epi; /* una pieza solo de los documentos pasa al sistema al guardar */
  EDOCUPADO[k]=true;refrescar();
  var paso=Object.keys(cambios).length?api('/oficina/accion',{body:{accion:'editar_pieza',id:e._id||null,fecha:e.fecha,formato:fmt0,base:e.texto||e.titulo||'',cambios:cambios}}):Promise.resolve({id:e._id});
  if(!e._id&&Object.keys(cambios).length)aviso('Cargando la publicación en el sistema… puede tardar un minuto',8000);
  paso.then(function(r){
    var id=r.id||e._id,cadena=Promise.resolve();
    fs.forEach(function(f){cadena=cadena.then(function(){
      var v=mimeVideo(f);
      return (v?Promise.resolve([f,v]):aJpeg(f).then(function(b){return [b,'image/jpeg']})).then(function(x){return subirArchivo(id,x[0],x[1],false)})})});
    return cadena;
  }).then(function(){
    delete EDOCUPADO[k];delete EDABRE[k];delete EDTXT[k];delete EDARCH[k];
    aviso('Guardado. Quedó como propuesta: aprobala y, el día de la publicación, confirmala',6000);return leerVivo(true);
  }).catch(function(er){delete EDOCUPADO[k];refrescar();aviso(er.estado===401?'La clave no es válida':('No se guardó: '+(er.message||'error')),9000);if(er.estado===401)pedirClave('La clave no es válida.')});
}
function formEditar(e,k,m){
  var t=EDTXT[k]=EDTXT[k]||{tipo:normFmt(e._fmt||e.formato),epi:epiEditable(e,m),hora:e._hora||''};
  var fo=el('form','nota');
  fo.appendChild(el('label','t','Tipo de publicación'));
  var se=el('select');TIPOS.forEach(function(x){var o=el('option',null,x[1]);o.value=x[0];if(x[0]===t.tipo)o.selected=true;se.appendChild(o)});
  se.addEventListener('change',function(){t.tipo=se.value;pintarArch()});fo.appendChild(se);
  fo.appendChild(el('label','t','Epígrafe (Enter hace un salto de línea; dejá una línea en blanco para separar párrafos)'));
  var ta=el('textarea');ta.value=t.epi;ta.maxLength=2200;ta.addEventListener('input',function(){t.epi=ta.value});fo.appendChild(ta);
  if(e._id){fo.appendChild(el('label','t','Hora de publicación'));var hi=el('input');hi.type='time';hi.value=t.hora||'';hi.addEventListener('input',function(){t.hora=hi.value});fo.appendChild(hi)}
  fo.appendChild(el('label','t','Archivo que se publica'));
  var info=el('p','arch'),inp=el('input');inp.type='file';inp.style.display='none';
  function pintarArch(){
    var fs=EDARCH[k]||[],n=(m.imgs||[]).length+(m.vid?1:0);
    var txt=fs.length?('Elegido: '+fs.map(function(f){return f.name}).join(', ')+' (se sube al guardar)'):(n?('Ya tiene '+n+' archivo'+(n>1?'s':'')+' cargado'+(n>1?'s':'')+'.'):'Todavía no tiene archivo.');
    info.textContent=txt;
    inp.accept=t.tipo==='reel'?'video/mp4,video/quicktime':t.tipo==='story'?'image/*,video/mp4,video/quicktime':'image/*';
    inp.multiple=t.tipo==='carrusel';
  }
  inp.addEventListener('change',function(){EDARCH[k]=Array.prototype.slice.call(inp.files||[]);var p=revisarArchivos(t.tipo,EDARCH[k]);if(p){aviso(p,7000);EDARCH[k]=[]}pintarArch()});
  pintarArch();
  var rw=el('div','fil2');
  rw.appendChild(boton(t.tipo==='reel'?'Elegir video':'Elegir archivo','ck sec',function(){inp.click()}));
  if(e._id&&((m.imgs||[]).length||m.vid))rw.appendChild(boton('Quitar archivos','ck sec',function(){
    if(conectado!=='vivo'){aviso('Sin conexión con el bot.',6000);return}
    api('/oficina/accion',{body:{accion:'quitar_archivos',id:e._id}}).then(function(){aviso('Archivos quitados');return leerVivo(true)}).catch(function(er){aviso('No se pudo: '+(er.message||'error'),6000)})}));
  fo.appendChild(rw);fo.appendChild(info);fo.appendChild(inp);
  var sb=el('button','ck si',EDOCUPADO[k]?'Guardando…':'Guardar cambios');sb.type='submit';sb.disabled=!!EDOCUPADO[k];fo.appendChild(sb);
  fo.addEventListener('submit',function(ev){ev.preventDefault();guardarEditar(e,k)});
  return fo;
}
/* cada pieza es una carta: el marco y la cinta dicen en qué estado está */
function estadoCarta(e){
  var raw=e._est||({'por aprobar':'propuesta','programado':'aprobada','publicado':'publicada'})[e.estado]||'propuesta';
  if(raw==='propuesta')return {k:'propuesta',t:'POR APROBAR',ico:'borrador'};
  if(raw==='aprobada')return {k:'aprobada',t:'APROBADA',ico:'ok'};
  if(raw==='confirmada'||raw==='preparada')return {k:'confirmada',t:'CONFIRMADA',ico:'candado'};
  if(raw==='publicada')return {k:'publicada',t:'PUBLICADA',ico:'enviar'};
  return {k:'propuesta',t:String(e.estado||raw).toUpperCase(),ico:'borrador'};
}
/* ================= previsualización realista de cómo queda en Instagram ================= */
var PREVIA={};
var IGI={
  corazon:'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z',
  comentar:'M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z',
  enviar:'M21 3 10.5 13.5 M21 3l-6.5 18-4-7.5L3 9.5z',
  guardar:'M6 3.5h12v17l-6-4.5-6 4.5z',
  mas:'M5 12h.01M12 12h.01M19 12h.01',
  atras:'M15 5l-7 7 7 7',
  cerrar:'M6 6l12 12M18 6L6 18',
  camara:'M4 8h3l1.5-2h7L17 8h3v11H4z M12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  inicio:'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  buscar:'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M16.5 16.5L21 21',
  reels:'M4 5h16v14H4z M4 9h16 M9 5l3 4 M14 5l3 4 M10 12.5l4 2.5-4 2.5z',
  tienda:'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
  volumen:'M4 9.5h3.5L12 6v12l-4.5-3.5H4z M16 9a4 4 0 0 1 0 6',
  musica:'M9 18V6l10-2v12 M9 18a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 9 18z M19 16a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 19 16z'
};
function igIco(n,px,grueso){
  var NS='http://www.w3.org/2000/svg',s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('width',px||24);s.setAttribute('height',px||24);
  s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width',grueso||1.9);s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('aria-hidden','true');
  var p=document.createElementNS(NS,'path');p.setAttribute('d',IGI[n]);s.appendChild(p);return s;
}
function igAvatar(px){
  var NS='http://www.w3.org/2000/svg',w=el('span','ig-av');w.style.width=w.style.height=px+'px';
  try{
    var s=document.createElementNS(NS,'svg'),p=document.createElementNS(NS,'path');p.setAttribute('d',LOGO_D);p.setAttribute('fill','#F3EFE7');s.appendChild(p);
    s.style.cssText='position:absolute;left:-9999px;top:0;width:10px;height:10px';document.body.appendChild(s);
    var b=p.getBBox();document.body.removeChild(s);
    var s2=document.createElementNS(NS,'svg'),p2=document.createElementNS(NS,'path'),pad=Math.max(b.width,b.height)*.28;
    s2.setAttribute('viewBox',(b.x-pad)+' '+(b.y-pad+(b.height-b.width)/2*0)+' '+(b.width+pad*2)+' '+(b.height+pad*2));p2.setAttribute('d',LOGO_D);p2.setAttribute('fill','#F3EFE7');s2.appendChild(p2);w.appendChild(s2);
  }catch(x){w.textContent='V'}
  return w;
}
/* recorta el epígrafe como Instagram: dos líneas y «… más» */
function igCaption(texto,oscuro){
  var d=el('div','ig-cap'+(oscuro?' osc':'')),ab=false,n=el('b',null,'vow_ar'),t=el('span','ig-t'),mas=el('button','ig-mas','más');mas.type='button';
  d.appendChild(n);d.appendChild(document.createTextNode(' '));d.appendChild(t);
  var plano=texto.replace(/\s*\n+\s*/g,' ').trim(),largo=plano.length>100;
  var corto=largo?plano.slice(0,100).replace(/\s+\S*$/,'').replace(/[.,;:\s]+$/,''):plano;
  function pintar(){t.textContent=ab||!largo?texto:corto+'\u2026 ';t.className='ig-t'+(ab?' abierto':'');if(largo&&!ab){if(!mas.parentNode)d.appendChild(mas)}else if(mas.parentNode)mas.remove()}
  mas.addEventListener('click',function(){ab=true;pintar()});pintar();return d;
}
function igNav(oscuro){
  var n=el('div','ig-nav'+(oscuro?' osc':''));['inicio','reels','enviar','buscar'].forEach(function(k){n.appendChild(igIco(k,23,1.7))});n.appendChild(igAvatar(22));return n;
}
function igEstado(hora){
  var b=el('div','ig-sb');b.appendChild(el('span',null,hora||'9:41'));var d=el('span','ig-sbd');['','',''].forEach(function(){d.appendChild(el('i'))});b.appendChild(d);return b;
}
/* medidas reales del archivo, para avisar si Instagram lo va a recortar o a dejarle bandas */
function medirImagen(src,cb){var im=new Image();im.onload=function(){cb(im.naturalWidth,im.naturalHeight)};im.onerror=function(){cb(0,0)};im.src=src}
function previaInstagram(e,m){
  var fmt=normFmt(e._fmt||e.formato),hora=e._hora||e.hora||'',imgs=(m&&m.imgs)||[],vid=m&&m.vid,epi=String(epigrafeDe(e,m)||'').trim();
  var raiz=el('div','ig-raiz'),tit=el('div','ig-tit');
  tit.appendChild(document.createTextNode('Así queda en Instagram'));tit.appendChild(el('span',null,(hora?'hoy a las '+hora+' · ':'')+({imagen:'publicación',carrusel:'carrusel',reel:'reel',story:'historia'}[fmt]||fmt)));raiz.appendChild(tit);
  var tel=el('div','ig-tel '+(fmt==='reel'||fmt==='story'?'vert':'feed')),pant=el('div','ig-pant'+(fmt==='reel'||fmt==='story'?' osc':''));tel.appendChild(pant);raiz.appendChild(tel);
  var chk=el('ul','ig-chk');raiz.appendChild(chk);
  if(fmt==='story'){var bz=el('button','ck sec ig-bz','Mostrar lo que Instagram tapa');bz.type='button';bz.addEventListener('click',function(){var on=pant.classList.toggle('ver-zonas');bz.textContent=on?'Ocultar zonas':'Mostrar lo que Instagram tapa'});raiz.insertBefore(bz,chk)}
  function punto(ok,txt){var li=el('li',ok===true?'ok':ok===false?'mal':'aviso');li.appendChild(el('b',null,ok===true?'✓':ok===false?'✕':'!'));li.appendChild(document.createTextNode(' '+txt));chk.appendChild(li);return li}
  var falta=(fmt==='reel'&&!vid)||(fmt==='story'&&!vid&&!imgs.length)||((fmt==='imagen'||fmt==='carrusel')&&!imgs.length);
  var tipos={imagen:'Foto',carrusel:'Fotos',reel:'Video',story:'Foto o video'};
  if(falta)punto(false,tipos[fmt]+' sin cargar: la pieza no se puede publicar así.');
  else if(fmt==='carrusel'&&imgs.length<2)punto(false,'Un carrusel necesita al menos 2 fotos (tiene '+imgs.length+').');
  else punto(true,fmt==='carrusel'?imgs.length+' fotos cargadas':(vid&&fmt!=='imagen'?'Video cargado':'Archivo cargado'));
  if(fmt==='story'){punto(true,'Una historia no lleva epígrafe');punto('a','Dejá libre el borde de arriba y de abajo (≈14 %): Instagram pone ahí tu perfil y «Enviar mensaje»')}
  else if(!epi)punto(false,'Falta el epígrafe');
  else{var hs=(epi.match(/#[\p{L}\p{N}_]+/gu)||[]).length;punto(epi.length<=2200&&hs<=30,'Epígrafe de '+epi.length+' caracteres'+(hs?' y '+hs+' hashtags':'')+(epi.length>2200?' (Instagram admite hasta 2200)':''))}
  function proporcion(w,h){
    if(!w||!h)return;var r=w/h,v=(fmt==='reel'||fmt==='story');
    if(v){var ok=Math.abs(r-9/16)<.04;punto(ok?true:'a',ok?'Proporción vertical 9:16 (como pide Instagram)':'No es 9:16 ('+w+'×'+h+'): se va a ver con bandas'+(fmt==='reel'?' o recortado':''))}
    else{var ok2=r>=.79&&r<=1.92;punto(ok2?true:'a',ok2?'Proporción '+(r>=.99&&r<=1.01?'cuadrada':r<1?'vertical':'horizontal')+' dentro de lo que acepta el feed':'Proporción fuera de rango ('+w+'×'+h+'): Instagram la recorta')}
  }
  var primero=imgs[0];
  if(primero)medirImagen(primero,proporcion);
  if(fmt==='carrusel'&&imgs.length>1){var med=[],pend=imgs.length;imgs.forEach(function(u,i){medirImagen(u,function(w,h){med[i]=h?w/h:0;if(--pend)return;var r0=med[0],igual=med.every(function(r){return r&&Math.abs(r-r0)/r0<.03});if(!igual)punto('a','Las fotos tienen proporciones distintas: Instagram las recorta todas como la primera')})})}
  else if(vid){var vv=document.createElement('video');vv.preload='metadata';vv.muted=true;vv.onloadedmetadata=function(){proporcion(vv.videoWidth,vv.videoHeight)};vv.src=vid}
  pant.appendChild(igEstado(hora));
  if(fmt==='story')igStory(pant,imgs,vid,falta);
  else if(fmt==='reel')igReel(pant,vid,epi,falta);
  else igFeed(pant,imgs,epi,falta,fmt==='carrusel');
  return raiz;
}
function igFalta(txt){var f=el('div','ig-falta');f.appendChild(el('span',null,txt));return f}
function igFeed(pant,imgs,epi,falta,carrusel){
  var top=el('div','ig-top');top.appendChild(igIco('atras',22,2));var c=el('div','ig-tt');c.appendChild(el('small',null,'vow_ar'));c.appendChild(el('strong',null,'Publicaciones'));top.appendChild(c);pant.appendChild(top);
  var h=el('div','ig-ph');h.appendChild(igAvatar(32));var nm=el('div','ig-nm');nm.appendChild(el('b',null,'vow_ar'));h.appendChild(nm);h.appendChild(igIco('mas',20,3));pant.appendChild(h);
  var md=el('div','ig-med');
  if(falta||!imgs.length)md.appendChild(igFalta('Falta la foto'));
  else{
    var sc=el('div','ig-sc');imgs.forEach(function(u){var im=document.createElement('img');im.src=u;im.alt='';sc.appendChild(im)});md.appendChild(sc);
    if(carrusel&&imgs.length>1){
      var bd=el('div','ig-bdg','1/'+imgs.length);md.appendChild(bd);
      var dots=el('div','ig-dots');imgs.forEach(function(_,i){dots.appendChild(el('i',i?'':'on'))});
      var ir=function(){var i=Math.round(sc.scrollLeft/Math.max(1,sc.clientWidth));bd.textContent=(i+1)+'/'+imgs.length;[].forEach.call(dots.children,function(d,k){d.className=k===i?'on':''})};
      sc.addEventListener('scroll',ir);md.dataset.dots='1';pant.appendChild(md);
      var ac=el('div','ig-acc');var iz=el('div','ig-iz');iz.appendChild(igIco('corazon',25));iz.appendChild(igIco('comentar',25));iz.appendChild(igIco('enviar',25));ac.appendChild(iz);ac.appendChild(dots);ac.appendChild(igIco('guardar',25));pant.appendChild(ac);
      igPie(pant,epi);return;
    }
  }
  pant.appendChild(md);
  var ac2=el('div','ig-acc'),iz2=el('div','ig-iz');iz2.appendChild(igIco('corazon',25));iz2.appendChild(igIco('comentar',25));iz2.appendChild(igIco('enviar',25));ac2.appendChild(iz2);ac2.appendChild(igIco('guardar',25));pant.appendChild(ac2);
  igPie(pant,epi);
}
function igPie(pant,epi){
  pant.appendChild(el('div','ig-lk','Sé la primera persona en indicar que le gusta'));
  if(epi)pant.appendChild(igCaption(epi,false));
  pant.appendChild(el('div','ig-ago','AHORA'));pant.appendChild(igNav(false));
}
function igReel(pant,vid,epi,falta){
  var md=el('div','ig-full');
  if(!vid||falta)md.appendChild(igFalta('Falta el video'));
  else{var v=document.createElement('video');v.src=vid;v.muted=true;v.loop=true;v.autoplay=true;v.playsInline=true;v.preload='metadata';v.addEventListener('click',function(){if(v.paused)v.play();else v.pause()});md.appendChild(v)}
  pant.appendChild(md);
  var top=el('div','ig-rtop');top.appendChild(el('strong',null,'Reels'));top.appendChild(igIco('camara',24,1.8));pant.appendChild(top);
  var der=el('div','ig-der');[['corazon','0'],['comentar','0'],['enviar',''],['mas','']].forEach(function(x){var b=el('div','ig-b');b.appendChild(igIco(x[0],x[0]==='mas'?22:27,x[0]==='mas'?3:1.8));if(x[1])b.appendChild(el('small',null,x[1]));der.appendChild(b)});
  var au=el('div','ig-disc');au.appendChild(igAvatar(26));der.appendChild(au);pant.appendChild(der);
  var ab=el('div','ig-rbj'),q=el('div','ig-rus');q.appendChild(igAvatar(30));q.appendChild(el('b',null,'vow_ar'));q.appendChild(el('span','ig-seg','Seguir'));ab.appendChild(q);
  if(epi)ab.appendChild(igCaption(epi,true));
  var mu=el('div','ig-mus');mu.appendChild(igIco('musica',13,2));mu.appendChild(document.createTextNode(' vow_ar · Audio original'));ab.appendChild(mu);pant.appendChild(ab);
  pant.appendChild(igNav(true));
}
function igStory(pant,imgs,vid,falta){
  var md=el('div','ig-full ig-st');
  if(falta||(!imgs.length&&!vid))md.appendChild(igFalta('Falta la foto o el video'));
  else{
    if(vid){
      var v=document.createElement('video');v.src=vid;v.muted=true;v.loop=true;v.autoplay=true;v.playsInline=true;v.preload='metadata';md.appendChild(v);
      var fondo=document.createElement('video');fondo.src=vid;fondo.muted=true;fondo.loop=true;fondo.autoplay=true;fondo.playsInline=true;fondo.className='ig-fondo';md.insertBefore(fondo,v);
    }else{
      var bg=document.createElement('img');bg.src=imgs[0];bg.className='ig-fondo';bg.alt='';md.appendChild(bg);
      var im=document.createElement('img');im.src=imgs[0];im.alt='';im.className='ig-fg';md.appendChild(im);
    }
  }
  pant.appendChild(md);
  var zs=el('div','ig-zonas');zs.appendChild(el('span','arr','Arriba: perfil y barra de progreso'));zs.appendChild(el('span','aba','Abajo: «Enviar mensaje»'));md.appendChild(zs);pant.classList.add('ig-conzonas');
  var pr=el('div','ig-prog'),bar=el('i');pr.appendChild(bar);pant.appendChild(pr);
  var h=el('div','ig-sh');h.appendChild(igAvatar(30));h.appendChild(el('b',null,'vow_ar'));h.appendChild(el('span','ig-ah','Ahora'));var r=el('span','ig-der2');r.appendChild(igIco('mas',20,3));r.appendChild(igIco('cerrar',22,2));h.appendChild(r);pant.appendChild(h);
  var pie=el('div','ig-sp');pie.appendChild(el('span','ig-msg','Enviar mensaje'));pie.appendChild(igIco('corazon',26,1.8));pie.appendChild(igIco('enviar',26,1.8));pant.appendChild(pie);
}
function botonPrevia(e,f,est){
  var k=String(e._id||kPieza(e)),abierta=PREVIA[k]===undefined?est.k==='confirmada':PREVIA[k];
  var b=botonIco('ver',abierta?'Ocultar la previsualización':'Ver cómo queda en Instagram','ck sec',function(){PREVIA[k]=!abierta;abrirEdif(panelAbierto,true)});
  return {abierta:abierta,boton:b};
}

function tarjetaPieza(e){
  var d=pd(e.fecha),f=el('div','pieza'),m=(MED.piezas||{})[kMed(e)]||{},ap=!!HECHO[kPieza(e)];
  if(e._id&&MEDIOS_ID[e._id])m=Object.assign({},m,{imgs:MEDIOS_ID[e._id].imgs||[],vid:MEDIOS_ID[e._id].vid});
  var est=estadoCarta(e);f.className='pieza carta st-'+est.k+(cambiandoAhora(e)?' trab':'');
  var h=el('div','ph');h.appendChild(el('strong',null,e.titulo||'Pieza'));f.appendChild(h);
  var rb=el('span','cinta-estado');rb.appendChild(ico(est.ico,12));rb.appendChild(document.createTextNode(est.t));f.appendChild(rb);
  f.appendChild(el('div','mono',(d?dd(d)+' · ':'')+(e.formato||'')+(e.hora?' · '+e.hora:'')+(d?' · '+rel(dias(d)):'')));
  if(cambiandoAhora(e))f.appendChild(bloqueProgreso(e));
  if(m.imgs&&m.imgs.length)f.appendChild(galeria(m.imgs));
  if(m.vid){var v=document.createElement('video');v.src=m.vid;v.controls=true;v.playsInline=true;v.preload='metadata';v.className='vid';f.appendChild(v)}
  var ep=epigrafeDe(e,m);f.appendChild(ep?el('p','epi',ep):el('p','vacio','Todavía no tiene epígrafe.'));
  var pv=(e._id&&e.estado!=='publicado')?botonPrevia(e,f,est):null;
  if(pv&&pv.abierta)f.appendChild(previaInstagram(e,m));
  var a=el('div','acc');
  if(pv)a.appendChild(pv.boton);
  if(e.estado==='por aprobar'&&!ap&&!esConfirmable(e))a.appendChild(botonIco('ok','Aprobar','ck si',function(){if(conectado!=='vivo'){aviso('Sin conexión con el bot: no se puede aprobar ahora.',6000);return}aprobarPieza(e)}));
  if(esConfirmable(e)&&!CAMBIANDO['c'+e._id])a.appendChild(botonIco('enviar','Confirmar publicación','ck si',function(){confirmarPieza(e)}));
  if(e.estado!=='publicado'&&!cambiandoAhora(e)){
    var kc=String(e._id||kPieza(e)),cf=null,fe=null;
    function abrirForm(foco){cf=formCambio(e);var inp=cf.querySelector('input');inp.value=CFTXT[kc]||'';inp.addEventListener('input',function(){CFTXT[kc]=inp.value});f.appendChild(cf);if(foco)inp.focus()}
    function abrirEditar(foco){fe=formEditar(e,kc,m);f.appendChild(fe);if(foco){var ta=fe.querySelector('textarea');ta.focus()}}
    a.appendChild(botonIco('lapiz','Editar','ck sec',function(){if(fe){fe.remove();fe=null;delete EDABRE[kc];delete EDTXT[kc];delete EDARCH[kc]}else{if(cf){cf.remove();cf=null;delete CFABRE[kc]}EDABRE[kc]=true;abrirEditar(true)}}));
    a.appendChild(botonIco('cambiar','Cambiar todo','ck sec',function(){if(cf){cf.remove();cf=null;delete CFABRE[kc]}else{if(fe){fe.remove();fe=null;delete EDABRE[kc];delete EDTXT[kc];delete EDARCH[kc]}CFABRE[kc]=true;abrirForm(true)}}));
    if(CFABRE[kc])setTimeout(function(){if(!cf)abrirForm(false)},0);
    if(EDABRE[kc])setTimeout(function(){if(!fe)abrirEditar(false)},0);
  }
  if(a.children.length)f.appendChild(a);
  return f;
}

/* ================= el detalle de cada edificio, solo lo necesario ================= */
function dato(k,v,cl){var f=el('div','dato'+(cl?' '+cl:''));f.appendChild(el('span',null,k));f.appendChild(el('b',null,v));return f}
function filaTarea(x){
  var f=el('div','fila'),t=el('div','tx');t.appendChild(document.createTextNode(x.t));
  var a=el('div','acc'),cfm=null;
  if(!x.fija){var lbl=/^aprobar/i.test(x.t)?'Aprobar':'Hecho';
    a.appendChild(boton(lbl,'ck '+(x.alta?'si':'sec'),function(){
      if(lbl==='Aprobar'||!x.p){cumplirTarea(x);return}
      if(cfm){cfm.remove();cfm=null;return}
      cfm=el('form','nota');var inp=el('input');inp.type='text';inp.maxLength=200;inp.placeholder='¿Cómo quedó? (opcional, queda registrado)';
      var ok=el('button','ck si','Confirmo que está hecho');ok.type='submit';cfm.appendChild(inp);cfm.appendChild(ok);
      cfm.addEventListener('submit',function(ev){ev.preventDefault();cumplirPend(x.p,inp.value)});t.appendChild(cfm);inp.focus();
    }))}
  f.appendChild(t);f.appendChild(a);return f;
}
function listaTareas(r,ts){
  var al=ts.filter(function(x){return x.alta}),me=ts.filter(function(x){return !x.alta});
  al.forEach(function(x){r.appendChild(filaTarea(x))});
  if(me.length<=2)me.forEach(function(x){r.appendChild(filaTarea(x))});
  else{var de=el('details');de.appendChild(el('summary',null,me.length+' por confirmar'));me.forEach(function(x){de.appendChild(filaTarea(x))});r.appendChild(de)}
}
function formNota(){
  var fo=el('form','nota');fo.id='formNota';var ta=el('input');ta.type='text';ta.placeholder='Ej.: Medias: talle único confirmado';ta.maxLength=300;
  var se=el('select');['estrategia','bot','diseno','deposito','recepcion','caja'].forEach(function(k){var o=el('option',null,SALA[k].n);o.value=k;se.appendChild(o)});
  var ti=el('select');[['confirmado','Confirmado'],['nota','Anotación']].forEach(function(x){var o=el('option',null,x[1]);o.value=x[0];ti.appendChild(o)});
  var sb=el('button','ck si','Anotar');sb.type='submit';
  fo.appendChild(ta);var rw=el('div','fil2');rw.appendChild(se);rw.appendChild(ti);rw.appendChild(sb);fo.appendChild(rw);
  fo.addEventListener('submit',function(e){e.preventDefault();agregarNota(ta.value,se.value,ti.value);ta.value=''});
  return fo;
}

/* ================= datos editables: el juego y el bot los cambian y los dos lo ven ================= */
var EDITANDO={},EDTXT={};
function enviarOp(cambio,okMsg){
  if(conectado!=='vivo'){aviso('Sin conexión con el bot: no se guardó.',6000);return Promise.resolve(false)}
  return api('/oficina/accion',{body:{accion:'operacion',cambio:cambio}}).then(function(r){if(r&&r.operacion&&VIVO)VIVO.operacion=r.operacion;aviso(okMsg||'Guardado: el bot ya lo sabe');return leerVivo(true).then(function(){return true})}).catch(function(e){aviso(e.estado===401?'Clave inválida: no se guardó':'No se guardó: '+(e.message||'error'),6000);if(e.estado===401)pedirClave('La clave no es válida.');return false});
}
function filaEditable(clave,etiqueta,valor){
  var op=(D._op&&D._op.campos)||{},propio=op[clave]!=null;
  var f=el('div','fila'),t=el('div','tx');t.appendChild(el('strong',null,etiqueta+': '));t.appendChild(document.createTextNode(valor||'sin dato'));
  if(propio)t.appendChild(el('div','mono','cambiado desde el juego o el bot'));
  var a=el('div','acc');
  a.appendChild(boton('Editar','ck sec',function(){EDITANDO[clave]=!EDITANDO[clave];abrirEdif(panelAbierto,true);if(EDITANDO[clave])setTimeout(function(){var i=document.querySelector('#cuerpo form.nota input');if(i)i.focus()},30)}));
  f.appendChild(t);f.appendChild(a);
  if(EDITANDO[clave]){
    var fo=el('form','nota'),inp=el('input');inp.type='text';inp.maxLength=1200;inp.value=EDTXT[clave]!=null?EDTXT[clave]:(valor||'');
    inp.addEventListener('input',function(){EDTXT[clave]=inp.value});
    var rw=el('div','fil2'),sb=el('button','ck si','Guardar');sb.type='submit';rw.appendChild(sb);
    if(propio)rw.appendChild(boton('Volver al documento','ck sec',function(){enviarOp({tipo:'campo',campo:clave,valor:''},'Vuelve a lo que dicen los documentos').then(function(ok){if(ok){delete EDITANDO[clave];delete EDTXT[clave];abrirEdif(panelAbierto,true)}})}));
    fo.appendChild(inp);fo.appendChild(rw);
    fo.addEventListener('submit',function(ev){ev.preventDefault();enviarOp({tipo:'campo',campo:clave,valor:inp.value}).then(function(ok){if(ok){delete EDITANDO[clave];delete EDTXT[clave];abrirEdif(panelAbierto,true)}})});
    t.appendChild(fo);
  }
  return f;
}
function seccionAgenda(r,sinHoy){
  var ev=lista('agenda').filter(function(x){var d=pd(x.f);return d&&dias(d)>=(sinHoy?1:0)}).sort(function(a,b){return (a.f+(a.h||'')).localeCompare(b.f+(b.h||''))}).slice(0,10);
  r.appendChild(el('h4',null,'Agenda'));
  if(!ev.length)r.appendChild(el('p','vacio','No hay nada agendado.'));
  ev.forEach(function(x){
    var f=el('div','fila'),d=pd(x.f);f.appendChild(el('div','fe',d?dd(d)+(x.h?' '+x.h:''):x.f));
    var t=el('div','tx');if(SALA[x.sala])t.appendChild(el('span','chip ok',SALA[x.sala].n));t.appendChild(document.createTextNode(x.t));f.appendChild(t);
    var a=el('div','acc');a.appendChild(botonIco('borrador','Quitar','ck sec',function(){enviarOp({tipo:'agenda_quitar',clave:x._id||(x.f+'|'+x.t)},'Quitado de la agenda').then(function(ok){if(ok)abrirEdif(panelAbierto,true)})}));f.appendChild(a);r.appendChild(f);
  });
  var de=el('details');de.appendChild(el('summary',null,'Agregar a la agenda'));
  var fo=el('form','nota'),fe=el('input'),ho=el('input'),tx=el('input'),se=el('select'),sb=el('button','ck si','Agregar');
  fe.type='date';ho.type='time';tx.type='text';tx.maxLength=140;tx.placeholder='Ej.: Retirar las gorras';sb.type='submit';
  ['bot','deposito','estrategia','diseno','recepcion','caja'].forEach(function(k){var o=el('option',null,SALA[k].n);o.value=k;se.appendChild(o)});
  var r1=el('div','fil2');r1.appendChild(fe);r1.appendChild(ho);var r2=el('div','fil2');r2.appendChild(se);r2.appendChild(sb);
  fo.appendChild(r1);fo.appendChild(tx);fo.appendChild(r2);
  fo.addEventListener('submit',function(ev2){ev2.preventDefault();if(!fe.value||!tx.value.trim()){aviso('Falta la fecha o qué pasa ese día');return}enviarOp({tipo:'agenda_agregar',fecha:fe.value,hora:ho.value,sala:se.value,texto:tx.value},'Agendado: el bot ya lo sabe').then(function(ok){if(ok)abrirEdif(panelAbierto,true)})});
  de.appendChild(fo);r.appendChild(de);
}
var PANEL={};
PANEL.agenda=function(){
  var r=document.createElement('div'),it=agendaHoy();
  r.appendChild(el('h4',null,'Hoy'));
  if(!it.length)r.appendChild(el('p','vacio','Nada agendado para hoy.'));
  it.forEach(function(x){var f=el('div','fila'+(x.hecha?' hecha':'')),t=el('div','tx');f.appendChild(el('div','fe',x.h||'hoy'));t.appendChild(ico(x.ico||'calendario',15));t.appendChild(document.createTextNode(' '+x.t));if(SALA[x.sala])t.appendChild(el('div','mono',SALA[x.sala].n));f.appendChild(t);
    if(x.sala&&EDIF[x.sala]){var a=el('div','acc');a.appendChild(boton('Ir','ck sec',function(){abrirEdif(x.sala)}));f.appendChild(a)}r.appendChild(f)});
  seccionAgenda(r,true);
  var n=it.length;return {t:'Agenda de hoy',s:n?n+(n===1?' cosa para hoy':' cosas para hoy'):'día libre',b:r};
};
PANEL.hq=function(){
  var r=document.createElement('div'),T=TAREAS,pz=T.diseno.filter(function(x){return x.pieza}),otros=[];
  ORDEN.forEach(function(k){if(k==='hq')return;T[k].forEach(function(x){if(!x.pieza)otros.push({x:x,k:k})})});
  otros.sort(function(a,b){return (b.x.alta?1:0)-(a.x.alta?1:0)});
  if(pz.length){r.appendChild(el('h4',null,'Para decidir ('+pz.length+')'));pz.forEach(function(x){r.appendChild(tarjetaPieza(x.pieza))})}
  if(otros.length){r.appendChild(el('h4',null,'Pendientes ('+otros.length+')'));otros.forEach(function(o){var f=filaTarea(o.x);f.querySelector('.tx').insertBefore(el('span','chip '+(o.x.alta?'pend':'ok'),EDIF[o.k].n),f.querySelector('.tx').firstChild);r.appendChild(f)})}
  if(!pz.length&&!otros.length)r.appendChild(el('p','vacio','Todo al día: no hay nada pendiente.'));
  var dn=el('details');dn.appendChild(el('summary',null,'Anotarle algo al bot'));dn.appendChild(formNota());r.appendChild(dn);
  var n=pz.length+otros.length;return {t:'Centro de control',s:n?n+' pendiente'+(n>1?'s':'')+' tuyo'+(n>1?'s':''):'todo al día',b:r};
};
PANEL.diseno=function(){
  var r=document.createElement('div'),todas=lista('piezas').slice().sort(function(a,b){return (a.fecha||'').localeCompare(b.fecha||'')}),prox=todas.filter(esFutura);
  prox.forEach(function(e){r.appendChild(tarjetaPieza(e))});
  if(!prox.length)r.appendChild(el('p','vacio','No hay publicaciones planificadas.'));
  listaTareas(r,TAREAS.diseno.filter(function(x){return !x.pieza}));
  return {t:'Taller de diseño',s:prox.length+(prox.length===1?' publicación':' publicaciones')+' por salir',b:r};
};
PANEL.bot=function(){
  var r=document.createElement('div'),b=D.bot||{},s=D.sistema||{},te=tests(),pg=b.programadas,nv=(b.novedades||[]).filter(function(x){return /todavía no lo leyó/.test(x.t||'')}),ch=b.chat;
  if(conectado!=='vivo')r.appendChild(el('p','vacio','Sin conexión con el bot: no se ve su estado ni la charla.'));
  else{r.appendChild(dato('Estado',b.pausa?'en pausa':'activo',b.pausa?'mal':'bien'));r.appendChild(dato('Publica',b.publica===false?'simulación (no publica de verdad)':'de verdad'))}
  r.appendChild(dato('Tests',s.tests||'sin datos',te.falla?'mal':''));r.appendChild(dato('Evals',s.evals||'sin datos'));
  listaTareas(r,TAREAS.bot);
  if(Array.isArray(pg)&&pg.length){r.appendChild(el('h4',null,'Programado'));pg.slice(0,4).forEach(function(x){var f=el('div','fila'),d=pd(x.f);f.appendChild(el('div','fe',d?dd(d)+(x.h?' '+x.h:''):''));f.appendChild(el('div','tx',(x.t||'')+' · '+(x.e||'')));r.appendChild(f)})}
  if(nv.length){r.appendChild(el('h4',null,'Novedades sin usar'));nv.slice(0,3).forEach(function(x){r.appendChild(el('div','fila',(x.t||'').replace(/ \(todavía no lo leyó el Estratega\)/,'')))})}
  if(conectado==='vivo'&&Array.isArray(ch)&&ch.length){r.appendChild(el('h4',null,'Última charla'));ch.slice(-3).forEach(function(x){var f=el('div','fila'),t=el('div','tx');t.appendChild(el('strong',null,x.rol==='usuario'?'Vos: ':'Bot: '));t.appendChild(document.createTextNode(x.texto||''));f.appendChild(t);r.appendChild(f)})}
  return {t:'Torre del bot',s:'',b:r};
};
PANEL.recepcion=function(){
  var r=document.createElement('div'),x=D.rendimiento;
  if(!x){r.appendChild(el('p','vacio',conectado==='vivo'?'Instagram todavía no está conectado al servicio.':'Conectá el juego al bot para ver Instagram.'));return {t:'Instagram',s:'',b:r}}
  if(x.error){r.appendChild(el('p','mono','No se pudo leer Instagram: '+x.error));return {t:'Instagram',s:'',b:r}}
  var c=x.cuenta||{},t=x.totales||{};
  r.appendChild(dato('Seguidores',c.seguidores!=null?fmtN(c.seguidores):'—'));
  r.appendChild(dato('Alcance (últimas '+(x.publicaciones||[]).length+')',t.alcance!=null?fmtN(t.alcance):'—'));
  r.appendChild(dato('Guardados',t.guardados!=null?fmtN(t.guardados):'—'));
  r.appendChild(el('h4',null,'Últimas publicaciones'));
  (x.publicaciones||[]).slice(0,5).forEach(function(p){var f=el('div','fila'),d=pd(p.fecha);f.appendChild(el('div','fe',d?dd(d):''));
    var tx=el('div','tx');tx.appendChild(document.createTextNode(p.gancho||p.tipo||'Publicación'));
    tx.appendChild(el('div','mono','alcance '+(p.alcance==null?'—':fmtN(p.alcance))+' · me gusta '+(p.me_gusta==null?'—':p.me_gusta)+' · guardados '+(p.guardados==null?'—':p.guardados)));
    f.appendChild(tx);r.appendChild(f)});
  return {t:'Instagram',s:'@'+(c.usuario||'vow_ar'),b:r};
};
/* ================= Almacén y Caja: stock y ventas, conectados al sistema (el bot ve y mueve lo mismo) ================= */
var STOCK_N={'gorra-negra':'Gorra negra','gorra-beige':'Gorra beige','shaker-negro':'Shaker negro','shaker-claro':'Shaker claro',medias:'Medias (pares)'};
var STOCKF={},STOCKT={},CAJAV={lineas:[{producto:'gorra',cantidad:1,gorra:'negra',shaker:'negro'}],nota:''},ESTAB={},ESTTXT={},ESTNUEVA='';
function pesos(n){return '$'+Number(n||0).toLocaleString('es-AR')}
function enviarInv(cambio,okMsg){
  if(conectado!=='vivo'){aviso('Sin conexión con el bot: no se guardó.',6000);return Promise.resolve(false)}
  return api('/oficina/accion',{body:{accion:'inventario',cambio:cambio}}).then(function(r){if(r&&r.inventario&&VIVO)VIVO.inventario=r.inventario;aviso(okMsg||(r&&r.resumen)||'Guardado: el bot ya lo sabe',4200);return leerVivo(true).then(function(){return true})}).catch(function(e){aviso(e.estado===401?'Clave inválida: no se guardó':(e.estado===400?e.message:'No se guardó: '+(e.message||'error')),7000);if(e.estado===401)pedirClave('La clave no es válida.');return false});
}
function totalUnidades(st){return Object.keys(st).reduce(function(a,k){return a+(st[k]||0)},0)}
function filaStock(sku,n){
  var f=el('div','stockf'),ab=STOCKF[sku];
  f.appendChild(el('div','nom',STOCK_N[sku]));f.appendChild(el('div','cant'+(n?'':' cero'),String(n)));
  var a=el('div','acc');
  a.appendChild(botonIco('caja','Llegó','ck sec',function(){STOCKF[sku]=ab==='entrada'?null:'entrada';abrirEdif(panelAbierto,true);setTimeout(function(){var i=document.querySelector('#cuerpo form.stk input');if(i)i.focus()},30)}));
  a.appendChild(botonIco('lapiz','Contar','ck sec',function(){STOCKF[sku]=ab==='ajuste'?null:'ajuste';abrirEdif(panelAbierto,true);setTimeout(function(){var i=document.querySelector('#cuerpo form.stk input');if(i)i.focus()},30)}));
  f.appendChild(a);
  if(!ab)return f;
  var w=el('div'),fo=el('form','nota stk'),inp=el('input');inp.type='number';inp.min=ab==='entrada'?1:0;inp.max=100000;inp.step=1;inp.inputMode='numeric';inp.placeholder=ab==='entrada'?'¿Cuántas llegaron?':'Cantidad que hay ahora';inp.value=STOCKT[sku]!=null?STOCKT[sku]:'';
  inp.addEventListener('input',function(){STOCKT[sku]=inp.value});
  var rw=el('div','fil2'),sb=el('button','ck si',ab==='entrada'?'Sumar al stock':'Dejar en esa cantidad');sb.type='submit';rw.appendChild(sb);rw.appendChild(boton('Cancelar','ck sec',function(){STOCKF[sku]=null;abrirEdif(panelAbierto,true)}));
  fo.appendChild(inp);fo.appendChild(rw);
  fo.addEventListener('submit',function(ev){ev.preventDefault();if(inp.value===''){aviso('Poné una cantidad');return}enviarInv({tipo:ab,sku:sku,cantidad:Number(inp.value)}).then(function(ok){if(ok){STOCKF[sku]=null;delete STOCKT[sku];abrirEdif(panelAbierto,true)}})});
  w.appendChild(f);w.appendChild(fo);return w;
}
PANEL.deposito=function(){
  var r=document.createElement('div'),st=D.inv&&D.inv.stock;
  if(!st){r.appendChild(el('p','vacio',conectado==='vivo'?'Todavía no hay stock cargado.':'Sin conexión con el bot: no se ve el stock.'));return {t:'Almacén',s:'',b:r}}
  Object.keys(STOCK_N).forEach(function(sku){r.appendChild(filaStock(sku,st[sku]||0))});
  r.appendChild(el('p','mono','El stock baja solo cuando se registra una venta en la Caja. «Llegó» suma mercadería; «Contar» corrige el número si no coincide.'));
  var t=totalUnidades(st);return {t:'Almacén',s:t?t+(t===1?' unidad':' unidades'):'sin stock todavía',b:r};
};
/* una línea de la venta: cuántas unidades de cada producto descuenta, y si alcanza */
function skusDeLinea(l,cat){
  var c=cat[l.producto];if(!c)return null;var out={};
  c.usa.forEach(function(u){var g=u[0],n=u[1]*(Number(l.cantidad)||0),sku=g==='medias'?'medias':g==='gorra'?'gorra-'+l.gorra:'shaker-'+l.shaker;out[sku]=(out[sku]||0)+n});
  return out;
}
function textoLinea(l,cat){var c=cat[l.producto]||{nombre:l.producto},col=Object.keys(l.colores||{}).map(function(g){return (STOCK_N[l.colores[g]]||l.colores[g]).toLowerCase()});return l.cantidad+' × '+c.nombre+(col.length?' ('+col.join(', ')+')':'')}
PANEL.caja=function(){
  var r=document.createElement('div'),inv=D.inv;
  if(!inv){r.appendChild(el('p','vacio',conectado==='vivo'?'Todavía no hay datos de la Caja.':'Sin conexión con el bot: no se pueden registrar ventas.'));return {t:'Caja',s:'',b:r}}
  var cat=inv.catalogo,hoyT=inv.totales.hoy,L=CAJAV.lineas,necesita={},total=0,faltan=[];
  r.appendChild(el('h4',null,'Registrar una venta'));
  L.forEach(function(l,i){
    var c=cat[l.producto],bx=el('div','vlin'),f1=el('div','fil2'),se=el('select'),q=el('input');
    Object.keys(cat).forEach(function(k){var o=el('option',null,cat[k].nombre+' · '+pesos(cat[k].precio));o.value=k;se.appendChild(o)});se.value=l.producto;
    se.addEventListener('change',function(){l.producto=se.value;abrirEdif(panelAbierto,true)});
    q.type='number';q.min=1;q.max=1000;q.step=1;q.inputMode='numeric';q.value=l.cantidad;q.className='cant-in';q.addEventListener('input',function(){l.cantidad=q.value===''?'':Number(q.value);actualizarTotalCaja()});q.addEventListener('change',function(){abrirEdif(panelAbierto,true)});
    f1.appendChild(se);f1.appendChild(q);bx.appendChild(f1);
    if(c.pide.indexOf('gorra')>-1||c.pide.indexOf('shaker')>-1){
      var f2=el('div','fil2');
      if(c.pide.indexOf('gorra')>-1){var sg=el('select');[['negra','Gorra negra'],['beige','Gorra beige']].forEach(function(x){var o=el('option',null,x[1]);o.value=x[0];sg.appendChild(o)});sg.value=l.gorra;sg.addEventListener('change',function(){l.gorra=sg.value;abrirEdif(panelAbierto,true)});f2.appendChild(sg)}
      if(c.pide.indexOf('shaker')>-1){var ss=el('select');[['negro','Shaker negro'],['claro','Shaker claro']].forEach(function(x){var o=el('option',null,x[1]);o.value=x[0];ss.appendChild(o)});ss.value=l.shaker;ss.addEventListener('change',function(){l.shaker=ss.value;abrirEdif(panelAbierto,true)});f2.appendChild(ss)}
      bx.appendChild(f2);
    }
    var n=Number(l.cantidad)||0,sub=c.precio*n;total+=sub;
    var us=skusDeLinea(l,cat)||{};Object.keys(us).forEach(function(k){necesita[k]=(necesita[k]||0)+us[k]});
    var pie=el('div','vpie');pie.appendChild(el('span','mono','Precio del sistema: '+pesos(c.precio)+' c/u'));pie.appendChild(el('b',null,pesos(sub)));
    if(L.length>1)pie.appendChild(boton('Quitar','ck sec',function(){L.splice(i,1);abrirEdif(panelAbierto,true)}));
    bx.appendChild(pie);r.appendChild(bx);
  });
  Object.keys(necesita).forEach(function(k){if((inv.stock[k]||0)<necesita[k])faltan.push((STOCK_N[k]||k).toLowerCase()+': hay '+(inv.stock[k]||0)+', necesita '+necesita[k])});
  if(L.length<5)r.appendChild(botonIco('caja','Sumar otro producto','ck sec',function(){L.push({producto:'gorra',cantidad:1,gorra:'negra',shaker:'negro'});abrirEdif(panelAbierto,true)}));
  var nota=el('input');nota.type='text';nota.maxLength=140;nota.placeholder='Nota (opcional): quién compró o cómo pagó';nota.value=CAJAV.nota||'';nota.className='nota-in';nota.addEventListener('input',function(){CAJAV.nota=nota.value});r.appendChild(nota);
  var tot=el('div','vtotal');tot.appendChild(el('span',null,'Total'));var tb=el('b',null,pesos(total));tb.id='cajaTotal';tot.appendChild(tb);r.appendChild(tot);
  if(faltan.length)r.appendChild(el('p','mono aviso-stock','No alcanza el stock ('+faltan.join('; ')+'). Primero registrá la llegada en el Almacén.'));
  var reg=botonIco('ok','Registrar venta','ck si',function(){
    if(!L.length||L.some(function(l){return !(Number(l.cantidad)>=1)})){aviso('Revisá las cantidades');return}
    enviarInv({tipo:'venta',items:L.map(function(l){var c=cat[l.producto],o={producto:l.producto,cantidad:Number(l.cantidad)};if(c.pide.indexOf('gorra')>-1)o.gorra=l.gorra;if(c.pide.indexOf('shaker')>-1)o.shaker=l.shaker;return o}),nota:CAJAV.nota}).then(function(ok){if(ok){CAJAV={lineas:[{producto:'gorra',cantidad:1,gorra:'negra',shaker:'negro'}],nota:''};abrirEdif(panelAbierto,true)}});
  });
  if(faltan.length)reg.disabled=true;var wr=el('div');wr.style.cssText='margin-bottom:8px';wr.appendChild(reg);r.appendChild(wr);
  function actualizarTotalCaja(){var t=0;L.forEach(function(l){t+=(cat[l.producto]||{precio:0}).precio*(Number(l.cantidad)||0)});var e=$('cajaTotal');if(e)e.textContent=pesos(t)}
  r.appendChild(el('h4',null,'Hoy'));
  r.appendChild(dato('Ventas',String(hoyT.ventas)));r.appendChild(dato('Unidades',String(hoyT.unidades)));r.appendChild(dato('Total',pesos(hoyT.importe)));
  r.appendChild(dato('Total desde el principio',pesos(inv.totales.importe)+' · '+inv.totales.ventas+(inv.totales.ventas===1?' venta':' ventas')));
  if(inv.ventas.length){
    r.appendChild(el('h4',null,'Últimas ventas'));
    inv.ventas.slice(0,8).forEach(function(v){
      var f=el('div','fila'+(v.anulada?' anulada':'')),t=el('div','tx'),d=pd(v.fecha);f.appendChild(el('div','fe',d?dd(d):v.fecha));
      t.appendChild(document.createTextNode(v.items.map(function(l){return textoLinea(l,cat)}).join(' + ')));t.appendChild(el('div','mono',pesos(v.importe)+(v.nota?' · '+v.nota:'')+(v.anulada?' · anulada':'')+' · '+(v.origen==='bot'?'por el bot':'desde la Caja')));f.appendChild(t);
      if(!v.anulada){var a=el('div','acc');a.appendChild(botonIco('borrador','Anular','ck sec',function(){if(!confirm('¿Anular esta venta? El stock vuelve al Almacén.'))return;enviarInv({tipo:'anular_venta',id:v.id},'Venta anulada: el stock volvió al Almacén').then(function(ok){if(ok)abrirEdif(panelAbierto,true)})}));f.appendChild(a)}
      r.appendChild(f);
    });
  }
  return {t:'Caja',s:hoyT.ventas?hoyT.ventas+(hoyT.ventas===1?' venta hoy':' ventas hoy')+' · '+pesos(hoyT.importe):'sin ventas hoy',b:r};
};
PANEL.estrategia=function(){
  var r=document.createElement('div'),e=D.estrategia||{},w=D.estr,pl=pd(e.plan),inf=pd(e.informe);
  if(!w){
    r.appendChild(el('p','vacio',conectado==='vivo'?'Todavía no hay estrategia de la semana.':'Sin conexión con el bot: acá solo se ven los documentos del repo.'));
    r.appendChild(dato('Plan',pl?ddy(pl)+' · '+rel(dias(pl)):'sin plan'));r.appendChild(dato('Informe de investigación',inf?ddy(inf)+' · '+rel(dias(inf)):'sin informe'));
  }else{
    var lu=pd(w.semana);
    r.appendChild(dato('Semana del',lu?dd(lu):w.semana));
    r.appendChild(dato('Sale de la investigación del',w.fuente?(function(){var x=pd(w.fuente);return x?ddy(x):w.fuente})():'sin informe',w.fuente?'':'mal'));
    r.appendChild(filaEditable('estrategia.foco','Foco de la semana',e.foco));
    r.appendChild(el('h4',null,'Estrategia de esta semana'));
    if(!w.lineas.length)r.appendChild(el('p','vacio','No hay líneas esta semana. Agregá una abajo.'));
    w.lineas.forEach(function(l){
      var f=el('div','fila col'),t=el('div','tx'),ab=ESTAB[l.k];
      var tt=el('div','clamp',l.t);tt.title='Tocá para ver todo';tt.addEventListener('click',function(){tt.classList.toggle('abierto')});t.appendChild(tt);
      var m=l.origen==='propia'?'agregada por vos o el bot':(l.editada?'de la investigación · editada':'de la investigación');t.appendChild(el('div','mono',m));
      var a=el('div','acc');
      a.appendChild(botonIco('lapiz','Editar','ck sec',function(){ESTAB[l.k]=!ab;abrirEdif(panelAbierto,true);setTimeout(function(){var i=document.querySelector('#cuerpo form.est textarea');if(i)i.focus()},30)}));
      a.appendChild(botonIco('borrador','Quitar','ck sec',function(){enviarOp({tipo:'estrategia_quitar',clave:l.k},'Quitado de la estrategia: el bot ya lo sabe').then(function(ok){if(ok)abrirEdif(panelAbierto,true)})}));
      f.appendChild(t);f.appendChild(a);
      if(ab){
        var fo=el('form','nota est'),ta=el('textarea');ta.rows=4;ta.maxLength=600;ta.value=ESTTXT[l.k]!=null?ESTTXT[l.k]:l.t;ta.addEventListener('input',function(){ESTTXT[l.k]=ta.value});
        var rw=el('div','fil2'),sb=el('button','ck si','Guardar');sb.type='submit';rw.appendChild(sb);rw.appendChild(boton('Cancelar','ck sec',function(){delete ESTAB[l.k];delete ESTTXT[l.k];abrirEdif(panelAbierto,true)}));
        fo.appendChild(ta);fo.appendChild(rw);fo.addEventListener('submit',function(ev){ev.preventDefault();enviarOp({tipo:'estrategia_editar',clave:l.k,texto:ta.value},'Estrategia cambiada: el bot ya lo sabe').then(function(ok){if(ok){delete ESTAB[l.k];delete ESTTXT[l.k];abrirEdif(panelAbierto,true)}})});
        t.appendChild(fo);
      }
      r.appendChild(f);
    });
    var fa=el('form','nota'),ia=el('input');ia.type='text';ia.maxLength=600;ia.placeholder='Agregar una línea a la estrategia de esta semana';ia.value=ESTNUEVA;ia.addEventListener('input',function(){ESTNUEVA=ia.value});
    var ra=el('div','fil2'),sa=el('button','ck si','Agregar');sa.type='submit';ra.appendChild(sa);
    if(w.cambiada)ra.appendChild(botonIco('cambiar','Volver a la investigación','ck sec',function(){if(!confirm('¿Descartar los cambios de esta semana y volver a lo que dice la investigación?'))return;enviarOp({tipo:'estrategia_restaurar'},'Vuelve a lo que dice la investigación').then(function(ok){if(ok){ESTAB={};ESTTXT={};abrirEdif(panelAbierto,true)}})}));
    fa.appendChild(ia);fa.appendChild(ra);fa.addEventListener('submit',function(ev){ev.preventDefault();if(!ia.value.trim()){aviso('Escribí la línea');return}enviarOp({tipo:'estrategia_agregar',texto:ia.value},'Agregado a la estrategia: el bot ya lo sabe').then(function(ok){if(ok){ESTNUEVA='';abrirEdif(panelAbierto,true)}})});
    r.appendChild(fa);
  }
  listaTareas(r,TAREAS.estrategia);
  if(D.planTexto){var d1=el('details');d1.appendChild(el('summary',null,'Leer el plan de publicaciones'));d1.appendChild(md(D.planTexto));r.appendChild(d1)}
  if(D.informeTexto){var d2=el('details');d2.appendChild(el('summary',null,'Leer el informe de investigación'));d2.appendChild(md(D.informeTexto));r.appendChild(d2)}
  return {t:'Estrategia',s:w?(w.lineas.length+(w.lineas.length===1?' línea':' líneas')+' esta semana'):'',b:r};
};
var ALIAS={control:'hq',pendientes:'hq',piezas:'diseno'};
var entraT=0,panelSinCam=false;
function abrirEdif(id,silencioso,sinCam){
  if(CH.abierto)cerrarChat();
  id=ALIAS[id]||id;if(!PANEL[id])return;
  var p=PANEL[id]();
  var tt=$('hT');tt.textContent='';tt.appendChild(document.createTextNode(p.t));if(p.s)tt.appendChild(el('small',null,p.s));
  var c=$('cuerpo'),st=c.scrollTop,ab=[].map.call(c.querySelectorAll('details'),function(d){return d.open});
  c.textContent='';c.appendChild(p.b);
  if(silencioso){[].forEach.call(c.querySelectorAll('details'),function(d,i){if(ab[i])d.open=true});c.scrollTop=st}else{c.scrollTop=0;c.classList.add('entra');clearTimeout(entraT);entraT=setTimeout(function(){c.classList.remove('entra')},1100)}
  $('hoja').classList.add('on');$('app').classList.add('hoja-on');panelAbierto=id;
  if(!silencioso)panelSinCam=!!sinCam;
  if(!sinCam&&!panelSinCam&&(!silencioso||selId!==id))selecc(id);
  pedirDesfase();
}
function abrirPanel(id,s){abrirEdif(id,s)}
window.__abrir=function(id){abrirEdif(id)};
function cerrarHoja(){$('hoja').classList.remove('on');$('app').classList.remove('hoja-on');panelAbierto=null;selecc(null)}
$('hX').addEventListener('click',cerrarHoja);
$('bAnotar').addEventListener('click',function(){var f=$('nrap');f.hidden=!f.hidden;if(!f.hidden)$('nrapIn').focus()});
$('nrap').addEventListener('submit',function(ev){ev.preventDefault();var i=$('nrapIn'),t=i.value.trim();if(!t)return;agregarNota(t,'bot','nota');i.value='';$('nrap').hidden=true});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&panelAbierto)cerrarHoja()});
/* ================= chat con el bot: la misma charla y la misma memoria que Telegram ================= */
var CH={abierto:false,local:[],enviando:false,error:'',visto:'',sinLeer:0,avisados:0,listo:false,sig:''};
try{CH.visto=localStorage.getItem('vow_chat_visto')||''}catch(e){}
function chatVivo(){return (VIVO&&VIVO.chat)||[]}
function ultimaEn(l){for(var i=l.length-1;i>=0;i--)if(l[i].en)return l[i].en;return ''}
function horaChat(en){if(!en)return '';var d=new Date(en);if(isNaN(d))return '';var p=function(n){return n<10?'0'+n:''+n};return (d.toDateString()===new Date().toDateString()?'':d.getDate()+'/'+(d.getMonth()+1)+' ')+p(d.getHours())+':'+p(d.getMinutes())}
function marcarVisto(){var u=ultimaEn(chatVivo());if(u&&u>CH.visto){CH.visto=u;try{localStorage.setItem('vow_chat_visto',u)}catch(e){}}}
function itemsChat(){
  var vivos=chatVivo(),locales=CH.local.filter(function(m){
    if(m.rol!=='usuario')return true;
    return !vivos.some(function(v){return v.rol==='usuario'&&v.canal==='juego'&&v.texto===m.texto&&Date.parse(v.en||0)>=m.t0-5000});
  });
  return vivos.concat(locales);
}
function pintarChat(forzar){
  var vivos=chatVivo();
  if(VIVO&&!CH.listo){CH.listo=true;if(!CH.visto)CH.visto=ultimaEn(vivos);CH.avisados=vivos.filter(function(m){return m.canal==='telegram'&&m.en>CH.visto}).length}
  var nuevos=vivos.filter(function(m){return m.canal==='telegram'&&m.en&&m.en>CH.visto});
  if(CH.abierto){marcarVisto();nuevos=[]}
  CH.sinLeer=nuevos.length;
  var badge=$('bChatN');badge.textContent=CH.sinLeer>9?'9+':String(CH.sinLeer);badge.hidden=!CH.sinLeer;
  if(CH.sinLeer>CH.avisados&&CH.listo){var u=nuevos[nuevos.length-1];aviso('Telegram: '+String(u.texto).replace(/\s+/g,' ').slice(0,90),4200)}
  CH.avisados=CH.sinLeer;
  if(!CH.abierto&&!forzar)return;
  var sg=JSON.stringify([vivos.length,ultimaEn(vivos),CH.local.length,CH.enviando,CH.error,conectado,CH.abierto]);
  if(sg===CH.sig&&!forzar)return;CH.sig=sg;
  var box=$('chMsgs'),pegado=!box.childNodes.length||box.scrollHeight-box.scrollTop-box.clientHeight<90;
  box.textContent='';
  var items=itemsChat();
  if(!items.length&&!CH.enviando){var v=document.createElement('div');v.id='chVacio';v.textContent=conectado==='vivo'?'Escribile lo que necesites: ver la semana, cambiar una pieza, programar un día, pausar las publicaciones. Es el mismo bot de Telegram: lo que hablen acá lo recuerda allá y al revés.':'Sin conexión con el bot. Revisá el aviso de arriba.';box.appendChild(v)}
  items.forEach(function(m){
    var b=document.createElement('div');b.className='bub '+(m.rol==='usuario'?'yo':'bot');
    b.appendChild(document.createTextNode(m.texto));
    var meta=[];if(m.canal==='telegram')meta.push('desde Telegram');var hr=horaChat(m.en);if(hr)meta.push(hr);
    if(meta.length){var s=document.createElement('span');s.className='meta';s.textContent=meta.join(' · ');b.appendChild(s)}
    box.appendChild(b);
  });
  if(CH.enviando){var p=document.createElement('div');p.className='bub bot pensando';p.setAttribute('aria-label','El bot está escribiendo');p.innerHTML='<i></i><i></i><i></i>';box.appendChild(p)}
  if(CH.error){var e=document.createElement('div');e.className='bub err';e.textContent=CH.error;box.appendChild(e)}
  if(pegado||forzar)box.scrollTop=box.scrollHeight;
  $('chSend').disabled=CH.enviando;
}
function abrirChat(){
  if(panelAbierto)cerrarHoja();
  CH.abierto=true;$('app').classList.add('chat-on');$('chat').classList.add('on');
  pintarChat(true);var i=$('chIn');setTimeout(function(){if(CH.abierto&&matchMedia('(hover:hover)').matches)i.focus()},330);
}
function cerrarChat(){CH.abierto=false;$('app').classList.remove('chat-on');$('chat').classList.remove('on');$('chIn').blur()}
function enviarChat(txt){
  txt=String(txt||'').trim();if(!txt||CH.enviando)return;
  if(conectado!=='vivo'){CH.error='Sin conexión con el bot: el mensaje no se mandó. Revisá el aviso de arriba.';pintarChat(true);return}
  CH.error='';CH.enviando=true;CH.local=[{rol:'usuario',texto:txt,canal:'juego',t0:Date.now()}];$('chIn').value='';pintarChat(true);
  api('/oficina/accion',{body:{accion:'chat',texto:txt}}).then(function(r){
    CH.enviando=false;
    return leerVivo(true).then(function(){CH.local=r&&r.limite?[{rol:'asistente',texto:r.respuesta,canal:'juego',t0:Date.now()}]:[];pintarChat(true)});
  }).catch(function(e){
    CH.enviando=false;CH.local=[];$('chIn').value=txt;
    if(e.estado===401){conectado='clave';pedirClave('La clave no es válida.')}
    CH.error='No pude hablar con el bot: '+(e.message&&e.message!=='Failed to fetch'?e.message.replace(/\.$/,''):'no llega al servidor')+'. Tu mensaje sigue escrito: probá de nuevo.';pintarChat(true);
  });
}
$('bChat').addEventListener('click',abrirChat);
$('chX').addEventListener('click',cerrarChat);
$('chForm').addEventListener('submit',function(ev){ev.preventDefault();enviarChat($('chIn').value)});
[['¿Qué tengo esta semana?','¿Qué tengo esta semana?'],['¿Qué falta para hoy?','¿Qué falta para publicar hoy?'],['¿Cómo está el sistema?','¿Cómo está el sistema? ¿Está pausado?'],['Programar un día','Programame un reel para el ']].forEach(function(c,i){
  var b=document.createElement('button');b.type='button';b.textContent=c[0];
  b.addEventListener('click',function(){if(i===3){$('chIn').value=c[1];$('chIn').focus()}else enviarChat(c[1])});$('chChips').appendChild(b);
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&CH.abierto)cerrarChat()});


/* ================= bucle ================= */
window.addEventListener('resize',ajustarCam);
var REACC={};
var t0=performance.now(),ult=t0;
function bucle(){
  requestAnimationFrame(bucle);
  if(document.hidden)return;
  var n=performance.now(),dt=Math.min(.06,(n-ult)/1000),t=(n-t0)/1000;ult=n;
  var k=1-Math.pow(.0008,dt);
  if(cine)pasoCine(n);else{foco.x+=(focoT.x-foco.x)*k;foco.z+=(focoT.z-foco.z)*k;zoom+=(zoomT-zoom)*k;desX+=(desXT-desX)*k;desY+=(desYT-desY)*k}
  ORDEN.forEach(function(id){var tg=id===selId?1:0,r0=REACC[id]||0;REACC[id]=r0+(tg-r0)*.1});
  FACH.forEach(function(f){f.mat.emissiveIntensity=NOCHE*1.15+(REACC[f.edif]||0)*.55});
  ANIM.forEach(function(f){f(t)});animarPeones(t,dt);
  GRUPO.hq&&0;
  ORDEN.forEach(function(id){var g=GRUPO[id],o=id===selId?1.035:1;g.scale.x+=(o-g.scale.x)*.25;g.scale.y=g.scale.z=g.scale.x});
  ajustarCam();renderer.render(scene,cam);ponerCapa();
}
ajustarCam();
setTimeout(function(){var p=$('pista');if(p)p.classList.add('off')},7000);
