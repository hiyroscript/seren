#!/usr/bin/env node
/* Dependency-free menu behavior checks. The DOM and Canvas are test doubles:
   these verify behavior, not browser layout, artwork, or hardware. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, base), 'utf8');
export function fixture(desktop = true) {
  let document;
  const ctx = new Proxy({}, {get(o, k) {
    if(k in o) return o[k];
    if(k === 'measureText') return () => ({width:20});
    if(String(k).startsWith('create')) return () => ({addColorStop(){}});
    return () => {};
  }});
  class Element {
    constructor(tag = 'div', attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attrs = attrs; this.children = []; this.parentElement = null;
      this.style = {setProperty(){}}; this.events = {}; this.inert = false; this._text = '';
      this.disabled = 'disabled' in attrs; this.clientWidth = 400; this.clientHeight = 800;
      this.classList = {
        contains: c => (this.attrs.class || '').split(/\s+/).includes(c),
        add: c => this.classList.toggle(c, true), remove: c => this.classList.toggle(c, false),
        toggle: (c, on) => {const set = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean));
          on = on === undefined ? !set.has(c) : on; on ? set.add(c) : set.delete(c); this.attrs.class = [...set].join(' '); return on;}
      };
    }
    get id(){return this.attrs.id || '';}
    set id(v){this.attrs.id=String(v);}
    get parentNode(){return this.parentElement;}
    get firstElementChild(){return this.children[0] || null;}
    removeChild(el){this.children.splice(this.children.indexOf(el),1);el.parentElement=null;return el;}
    get isConnected(){return !!this.closest('html');}
    get tabIndex(){return +(this.attrs.tabindex || 0);}
    set tabIndex(v){this.attrs.tabindex = String(v);}
    getAttribute(k){return this.attrs[k] ?? null;}
    setAttribute(k,v){this.attrs[k] = String(v);}
    hasAttribute(k){return k in this.attrs;}
    removeAttribute(k){delete this.attrs[k];}
    appendChild(el){el.parentElement = this;this.children.push(el);return el;}
    get textContent(){return this._text + this.children.map(c => c.textContent).join('');}
    set textContent(v){this._text = String(v);this.children = [];}
    get innerHTML(){return this._html || '';}
    set innerHTML(v){this._html = v;this.children = [];this._text = '';parse(v,this);}
    matches(s){
      s = s.trim();
      if(s.includes(':not(:disabled)')){if(this.disabled) return false;s = s.replace(':not(:disabled)','');}
      if(s === '[inert]') return this.inert;
      const tag = s.match(/^[\w-]+/);if(tag && this.tagName !== tag[0].toUpperCase()) return false;
      for(const m of s.matchAll(/#([\w-]+)/g)) if(this.id !== m[1]) return false;
      for(const m of s.matchAll(/\.([\w-]+)/g)) if(!this.classList.contains(m[1])) return false;
      for(const m of s.matchAll(/\[([\w-]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g)) {
        if(!this.hasAttribute(m[1])) return false;
        if(m[2] !== undefined && this.getAttribute(m[1]) !== m[2]) return false;
      }
      return true;
    }
    querySelectorAll(s){const found=[];const walk=e=>{for(const c of e.children){if(s.split(',').some(q=>c.matches(q)))found.push(c);walk(c);}};walk(this);return found;}
    querySelector(s){return this.querySelectorAll(s)[0] || null;}
    closest(s){for(let e=this;e;e=e.parentElement)if(s.split(',').some(q=>e.matches(q)))return e;return null;}
    contains(el){for(let e=el;e;e=e.parentElement)if(e===this)return true;return false;}
    getClientRects(){return this.closest('.screen') && !this.closest('.screen').classList.contains('on') ? [] : [{}];}
    getBoundingClientRect(){return {width:100,height:120,left:0,top:0,right:100,bottom:120};}
    getContext(){return ctx;}
    addEventListener(k,fn){(this.events[k] ||= []).push(fn);}
    focus(){if(this.disabled || this.closest('[inert]'))return;document.activeElement=this;this.dispatch('focus');}
    blur(){document.activeElement=document.body;}
    dispatch(k, extra={}){const event={target:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra};for(let e=this;e;e=e.parentElement)for(const fn of e.events[k] || [])fn.call(e,event);return event;}
    click(){if(!this.disabled && !this.closest('[inert]')){this.focus();this.dispatch('click');}}
  }
  function parse(html, root){
    const stack=[root];
    for(const m of html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<\/?([\w-]+)([^>]*)>|([^<]+)/g)) {
      if(m[3]){stack.at(-1)._text += m[3];continue;}
      if(m[0].startsWith('</')){if(stack.length>1)stack.pop();continue;}
      const attrs={};for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)')?/g))attrs[a[1]]=a[2]??a[3]??'';
      const el=stack.at(-1).appendChild(new Element(m[1],attrs));
      if(!['meta','link','img','input','br','hr','source'].includes(m[1]) && !m[0].endsWith('/>'))stack.push(el);
    }
  }
  document = new Element('document');parse(read('index.html'),document);
  document.documentElement=document.querySelector('html');document.body=document.querySelector('body');document.activeElement=document.body;
  document.getElementById=id=>document.querySelector('#'+id);
  document.createElement=tag=>new Element(tag);
  const timers=[];const pads=[];const saves=new Map();
  const images=[], frames=[]; let now=0;
  class FixtureImage {
    constructor(){this.complete=false;this.naturalWidth=0;this.naturalHeight=0;images.push(this);}
    load(width=1024,height=1536){
      this.complete=true;this.naturalWidth=width;this.naturalHeight=height;
      if(this.onload)this.onload();
    }
  }
  const sandbox={document,console,Math,Date,performance:{now:()=>now},navigator:{getGamepads:()=>pads},
    getComputedStyle:el=>({visibility:el.getClientRects().length?'visible':'hidden'}),
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
    localStorage:{getItem:k=>saves.get(k)??null,setItem:(k,v)=>saves.set(k,v)},Image:FixtureImage,Path2D:class{}};
  sandbox.window={matchMedia:q=>({matches:q.includes('hover') && desktop}),innerWidth:1000,innerHeight:800,devicePixelRatio:1,addEventListener(){}};
  const context=vm.createContext(sandbox);
  const run=code=>vm.runInContext(code,context);
  for(const file of ['core','i18n','data','audio','runtime','ui','settings','local','ai','mechanics','race','render','hud','input','main'])run(read('js/'+file+'.js'));
  const $=s=>document.querySelector(s);
  const click=id=>{assert.ok($('#'+id),'missing '+id);$('#'+id).click();};
  const boot=()=>{timers.shift()();};
  return {run,$,click,boot,pads,document,timers,saves,images,frames,ctx,setNow:v=>{now=v;}};
}
