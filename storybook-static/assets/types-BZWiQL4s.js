import{j as a}from"./jsx-runtime-D_zvdyIk.js";import{r as c}from"./iframe-BKI_OECl.js";/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=(...e)=>e.filter((t,r,s)=>!!t&&t.trim()!==""&&s.indexOf(t)===r).join(" ").trim();/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(t,r,s)=>s?s.toUpperCase():r.toLowerCase());/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=e=>{const t=N(e);return t.charAt(0).toUpperCase()+t.slice(1)};/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var d={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0;return!1},L=c.createContext({}),S=()=>c.useContext(L),M=c.forwardRef(({color:e,size:t,strokeWidth:r,absoluteStrokeWidth:s,className:o="",children:i,iconNode:y,...h},f)=>{const{size:l=24,strokeWidth:m=2,absoluteStrokeWidth:x=!1,color:v="currentColor",className:_=""}=S()??{},g=s??x?Number(r??m)*24/Number(t??l):r??m;return c.createElement("svg",{ref:f,...d,width:t??l??d.width,height:t??l??d.height,stroke:e??v,strokeWidth:g,className:b("lucide",_,o),...!i&&!j(h)&&{"aria-hidden":"true"},...h},[...y.map(([z,w])=>c.createElement(z,w)),...Array.isArray(i)?i:[i]])});/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const n=(e,t)=>{const r=c.forwardRef(({className:s,...o},i)=>c.createElement(M,{ref:i,iconNode:t,className:b(`lucide-${C(p(e))}`,`lucide-${e}`,s),...o}));return r.displayName=p(e),r};/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]],Y=n("arrow-left",E);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],ee=n("chevron-right",$);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=[["path",{d:"M8 5h13",key:"1pao27"}],["path",{d:"M13 12h8",key:"h98zly"}],["path",{d:"M13 19h8",key:"c3s6r1"}],["path",{d:"M3 10a2 2 0 0 0 2 2h3",key:"1npucw"}],["path",{d:"M3 5v12a2 2 0 0 0 2 2h3",key:"x1gjn2"}]],te=n("list-tree",A);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]],ae=n("lock",R);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=[["path",{d:"M5 12h14",key:"1ays0h"}]],I=n("minus",T);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],F=n("plus",Z);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],W=n("refresh-cw",q);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["path",{d:"M12 4v16",key:"1654pz"}],["path",{d:"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2",key:"e0r10z"}],["path",{d:"M9 20h6",key:"s66wpe"}]],H=n("type",U);/**
 * @license lucide-react v1.24.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],se=n("x",V),u=14,k=24,D=17;function K(e){return Number.isFinite(e)?Math.min(k,Math.max(u,Math.round(e))):D}function re(e){const t=K(e);return{"--zhiku-reader-font-size":`${t}px`,"--zhiku-reader-lead-font-size":`${t+1}px`,"--zhiku-reader-heading-font-size":`${t+6}px`,"--zhiku-reader-subheading-font-size":`${t+2}px`,"--zhiku-reader-injection-font-size":`${Math.max(u,t-1)}px`,"--zhiku-reader-dropcap-font-size":`${Math.round(t*2.3)}px`}}const O={idle:"刷新内置智库",loading:"正在刷新内置智库",done:"内置智库已刷新",error:"内置智库刷新失败，请重试"};function P({value:e,onDecrease:t,onIncrease:r,onRefresh:s,refreshStatus:o="idle"}){const i=O[o];return a.jsxs("div",{className:"zhiku-v3-reader-font-control","data-has-refresh":s?"true":"false",role:"group","aria-label":`档案阅读字号，当前 ${e} 像素`,children:[a.jsx(H,{className:"zhiku-v3-reader-font-control__type",size:14,strokeWidth:1.6,"aria-hidden":"true"}),a.jsx("button",{type:"button",onClick:t,disabled:e<=u,"aria-label":"减小档案字号",title:"减小档案字号",children:a.jsx(I,{size:14,strokeWidth:1.8,"aria-hidden":"true"})}),a.jsx("output",{"aria-live":"polite","aria-atomic":"true",children:e}),a.jsx("button",{type:"button",onClick:r,disabled:e>=k,"aria-label":"增大档案字号",title:"增大档案字号",children:a.jsx(F,{size:14,strokeWidth:1.8,"aria-hidden":"true"})}),s&&a.jsx("button",{type:"button",className:"zhiku-v3-reader-font-control__refresh","data-refresh-status":o,onClick:s,disabled:o==="loading","aria-label":i,"aria-busy":o==="loading",title:i,children:a.jsx(W,{size:14,strokeWidth:1.7,"aria-hidden":"true"})})]})}P.__docgenInfo={description:"",methods:[],displayName:"ReaderFontSizeControl",props:{value:{required:!0,tsType:{name:"number"},description:""},onDecrease:{required:!0,tsType:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}}},description:""},onIncrease:{required:!0,tsType:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}}},description:""},onRefresh:{required:!1,tsType:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}}},description:""},refreshStatus:{required:!1,tsType:{name:"union",raw:"'idle' | 'loading' | 'done' | 'error'",elements:[{name:"literal",value:"'idle'"},{name:"literal",value:"'loading'"},{name:"literal",value:"'done'"},{name:"literal",value:"'error'"}]},description:"",defaultValue:{value:"'idle'",computed:!1}}}};function B({brightness:e=.78,dimmer:t=.24,showGrid:r=!1,showSafeArea:s=!1}){return a.jsxs(a.Fragment,{children:[a.jsx("img",{className:"zhiku-v3-screen__background",src:"/assets/zhiku/archive-hall-background.webp",alt:"",style:{filter:`brightness(${e})`}}),a.jsx("div",{className:"zhiku-v3-screen__dimmer",style:{opacity:t}}),a.jsx("div",{className:"zhiku-v3-screen__texture"}),r&&a.jsx("div",{className:"zhiku-v3-screen__grid","aria-hidden":"true"}),s&&a.jsx("div",{className:"zhiku-v3-screen__safe-area","aria-hidden":"true"}),a.jsxs("span",{className:"zhiku-v3-screen__pin zhiku-v3-screen__pin--top-right","aria-hidden":"true",children:[a.jsx("i",{}),a.jsx("i",{})]}),a.jsxs("span",{className:"zhiku-v3-screen__pin zhiku-v3-screen__pin--bottom-left","aria-hidden":"true",children:[a.jsx("i",{}),a.jsx("i",{})]})]})}B.__docgenInfo={description:"",methods:[],displayName:"ZhikuPageFrame",props:{brightness:{required:!1,tsType:{name:"number"},description:"",defaultValue:{value:"0.78",computed:!1}},dimmer:{required:!1,tsType:{name:"number"},description:"",defaultValue:{value:"0.24",computed:!1}},showGrid:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}},showSafeArea:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}}}};const G=[{id:"character",x:49.51724137931035,y:46.547892720306514,scale:1.3},{id:"story",x:35.51724137931034,y:20.773946360153257,scale:.88},{id:"aeon",x:62,y:18,scale:.78},{id:"enemy",x:66.41379310344826,y:62.08429118773947,scale:.95},{id:"path",x:76.27586206896552,y:32.157088122605366,scale:.8},{id:"term",x:80.13793103448276,y:72.81226053639847,scale:.76},{id:"event",x:52.700184259015536,y:84.16153373694833,scale:.76},{id:"faction",x:35.16366612111293,y:77.61865793780687,scale:.76},{id:"location",x:30.620689655172413,y:49.81226053639847,scale:.8}],X={nodes:G},ie=[{id:"character",label:"人物",iconSrc:"/assets/zhiku/emblems/gold-emblem-trace.svg",countLabel:"71",featured:!0},{id:"story",label:"剧情档案",iconSrc:"/assets/zhiku/emblems/story-archive-emblem-concept-a.svg",countLabel:"--"},{id:"location",label:"地点",iconSrc:"/assets/zhiku/emblems/location-emblem-concept-a.svg",countLabel:"12"},{id:"faction",label:"派系",iconSrc:"/assets/zhiku/emblems/faction-emblem-precision-a.svg",countLabel:"4"},{id:"event",label:"事件",iconSrc:"/assets/zhiku/emblems/event-emblem-concept-a.svg",countLabel:"4"},{id:"enemy",label:"敌对生物",iconSrc:"/assets/zhiku/emblems/enemy-emblem-precision-h.svg",countLabel:"--"},{id:"aeon",label:"星神",iconSrc:"/assets/zhiku/emblems/aeon-emblem-precision-c.svg",countLabel:"18"},{id:"path",label:"命途",iconSrc:"/assets/zhiku/emblems/path-emblem-precision-c.svg",countLabel:"18"},{id:"term",label:"专有名词",iconSrc:"/assets/zhiku/emblems/term-emblem-precision-a.svg",countLabel:"7"}];X.nodes.map(e=>({id:e.id,x:e.x,y:e.y,scale:e.scale}));export{Y as A,ee as C,ae as L,P as R,se as X,ie as Z,B as a,D as b,n as c,te as d,re as e};
