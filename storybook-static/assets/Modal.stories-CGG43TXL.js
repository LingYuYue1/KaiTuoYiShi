import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as j}from"./iframe-BKI_OECl.js";import"./preload-helper-Dp1pzeXC.js";function f({children:n,onClose:r,title:o,className:y="max-w-2xl"}){return j.useEffect(()=>{document.body.classList.add("modal-open");const s=v=>{v.key==="Escape"&&r()};return window.addEventListener("keydown",s),()=>{document.body.classList.remove("modal-open"),window.removeEventListener("keydown",s)}},[r]),e.jsx("div",{className:"kaituo-modal-overlay fixed inset-0 z-50 flex items-stretch justify-center p-0 md:items-center md:p-4",onClick:s=>{s.target===s.currentTarget&&r()},children:e.jsxs("div",{className:`kaituo-modal-shell flex h-[100dvh] w-full min-w-0 animate-slide-up flex-col overflow-hidden md:h-auto md:max-h-[85vh] ${y}`,children:[o&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 px-4 py-3.5 md:px-5",children:[e.jsxs("div",{className:"flex min-w-0 items-center gap-3",children:[e.jsx("span",{className:"text-base",style:{color:"rgba(var(--tj-accent-primary), 0.7)"},children:"◆"}),e.jsx("h2",{className:"min-w-0 truncate font-serif text-lg font-bold tracking-[0.2em]",style:{background:"linear-gradient(180deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 60%, rgb(var(--tj-accent-secondary)) 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"},children:o})]}),e.jsx("button",{onClick:r,className:"kaituo-close-btn text-lg leading-none","aria-label":"关闭",children:"✕"})]}),e.jsx("div",{className:"kaituo-divider mx-5"})]}),e.jsx("div",{className:"min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-5",children:n})]})})}f.__docgenInfo={description:"",methods:[],displayName:"Modal",props:{children:{required:!0,tsType:{name:"ReactNode"},description:""},onClose:{required:!0,tsType:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}}},description:""},title:{required:!1,tsType:{name:"string"},description:""},className:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:"'max-w-2xl'",computed:!1}}}};const N={title:"开拓轶事/Modal 弹窗",component:f,parameters:{layout:"fullscreen",docs:{description:{component:"项目通用弹窗：遮罩 + 居中窗体 + 渐变标题 + Esc/点遮罩关闭。"}}},args:{onClose:()=>{}}},t={args:{title:"设置",children:e.jsxs("div",{className:"space-y-3 text-sm",children:[e.jsx("p",{children:"这里是弹窗内容区域，可以放任何东西。"}),e.jsx("p",{children:"按 Esc 或点击遮罩可以关闭（Storybook 里 onClose 是空函数，不会真的关掉）。"})]})}},a={args:{children:e.jsx("p",{className:"text-sm",children:"没有 title 时不渲染标题栏和分隔线。"})}},i={args:{title:"智库",children:e.jsx("div",{className:"space-y-2 text-sm",children:Array.from({length:40},(n,r)=>e.jsxs("p",{children:["第 ",r+1," 条内容——用来验证内容区超高时的滚动表现。"]},r))})}};var c,d,l;t.parameters={...t.parameters,docs:{...(c=t.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    title: '设置',
    children: <div className="space-y-3 text-sm">\r
        <p>这里是弹窗内容区域，可以放任何东西。</p>\r
        <p>按 Esc 或点击遮罩可以关闭（Storybook 里 onClose 是空函数，不会真的关掉）。</p>\r
      </div>
  }
}`,...(l=(d=t.parameters)==null?void 0:d.docs)==null?void 0:l.source}}};var m,p,u;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    children: <p className="text-sm">没有 title 时不渲染标题栏和分隔线。</p>
  }
}`,...(u=(p=a.parameters)==null?void 0:p.docs)==null?void 0:u.source}}};var x,g,h;i.parameters={...i.parameters,docs:{...(x=i.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    title: '智库',
    children: <div className="space-y-2 text-sm">\r
        {Array.from({
        length: 40
      }, (_, i) => <p key={i}>第 {i + 1} 条内容——用来验证内容区超高时的滚动表现。</p>)}\r
      </div>
  }
}`,...(h=(g=i.parameters)==null?void 0:g.docs)==null?void 0:h.source}}};const E=["带标题","无标题","长内容滚动"];export{E as __namedExportsOrder,N as default,t as 带标题,a as 无标题,i as 长内容滚动};
