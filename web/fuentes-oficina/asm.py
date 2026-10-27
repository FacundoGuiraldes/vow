import os
AQUI=os.path.dirname(os.path.abspath(__file__))
old=open(os.path.join(AQUI,'old_main.html')).read().split('\n')
def L(a,b): return '\n'.join(old[a-1:b])
d=AQUI+'/'
head=open(d+'head.html').read()
hdr='''(function(){
'use strict';
var $=function(i){return document.getElementById(i)};
var SALA={estrategia:{n:'Estrategia',c:'#B58A3F'},bot:{n:'Bot',c:'#5E8793'},diseno:{n:'Diseño',c:'#9A2F3C'},deposito:{n:'Depósito',c:'#7E8450'},recepcion:{n:'Instagram',c:'#CDBFA6'},caja:{n:'Caja',c:'#8b2a36'}};
var D={},conectado='no',HECHO={},MED={},NOTAS={};
'''
parts=[head,hdr,L(143,163),L(237,237),L(749,765),L(819,828),L(1242,1242),L(1259,1263),L(1282,1288),open(d+'logo.js').read(),open(d+'v1_base.js').read(),open(d+'v2_mundo.js').read(),open(d+'v3_edif.js').read(),open(d+'v4_gente.js').read(),open(d+'camara.js').read(),open(d+'ui.js').read().replace('  GRUPO.hq&&0;\n',''),L(1572,len(old))]
s='\n'.join(parts)
s=s.replace('function aviso(m){var t=$(\'toast\');t.textContent=m;t.classList.add(\'on\');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove(\'on\')},3200)}','function aviso(m,ms){var t=$(\'toast\');t.textContent=m;t.classList.add(\'on\');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove(\'on\')},ms||3200)}')
s=s.replace('function refrescar(){juntar();aplicar();ultR=0}','function refrescar(){juntar();aplicar()}')
s=s.replace('conectar();\n\n})();','bucle();\nconectar();\n\n})();')
open(os.path.join(AQUI,'..','public','oficina','index.html'),'w').write(s)
