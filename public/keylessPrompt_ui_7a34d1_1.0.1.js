"use strict";(globalThis.webpackChunk_clerk_ui=globalThis.webpackChunk_clerk_ui||[]).push([["522"],{3884:function(e,t,r){r.r(t),r.d(t,{getCurrentState:()=>k,getResolvedContent:()=>Y,KeylessPrompt:()=>L});var n=r(4518),i=r(4180),o=r(8802),a=r(5074),s=r(9406),l=r(8307);let c="clerk-keyless-prompt-corner",u="1.25rem",d="translate3d(0px, 0px, 0)",p={x:0,y:0},f=["top-left","top-right","bottom-left","bottom-right"];function h(e){if("undefined"!=typeof window)try{localStorage.setItem(c,e)}catch{}}function m(e){return e/1e3*.999/.0010000000000000009}var g=r(7697);let x="18rem",b="cubic-bezier(0.2, 0, 0, 1)",y=(0,o.AH)`
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  background: none;
  border: none;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    avenir next,
    avenir,
    segoe ui,
    helvetica neue,
    helvetica,
    Cantarell,
    Ubuntu,
    roboto,
    noto,
    arial,
    sans-serif;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  text-decoration: none;
  color: inherit;
  appearance: none;
`;function w(e){return e?"220ms":"180ms"}let C=(0,o.AH)`
  ${y};
  margin: 0.75rem 0 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 1.75rem;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.12px;
  color: #fde047;
  text-shadow: 0px 1px 2px rgba(0, 0, 0, 0.32);
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 30.5%, rgba(0, 0, 0, 0.05) 100%), #454545;
  box-shadow:
    0px 0px 0px 1px rgba(255, 255, 255, 0.04) inset,
    0px 1px 0px 0px rgba(255, 255, 255, 0.04) inset,
    0px 0px 0px 1px rgba(0, 0, 0, 0.12),
    0px 1.5px 2px 0px rgba(0, 0, 0, 0.48),
    0px 0px 4px 0px rgba(243, 107, 22, 0) inset;
  outline: none;
  &:hover {
    background: #4b4b4b;
    transition: background-color 120ms ease-in-out;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
  &:focus-visible {
    outline: 2px solid #6c47ff;
    outline-offset: 2px;
  }
`,v={idle:{triggerWidth:"14.25rem",title:"Configure your application",description:(0,n.FD)(n.FK,{children:[(0,n.Y)("p",{children:"Temporary API keys are enabled so you can get started immediately."}),(0,n.Y)("ul",{children:["Add SSO connections (eg. GitHub)","Set up B2B authentication","Enable MFA"].map(e=>(0,n.Y)("li",{children:e},e))}),(0,n.Y)("p",{children:"Access the dashboard to customize auth settings and explore Clerk features."})]}),cta:{kind:"link",text:"Configure your application",href:({claimUrl:e})=>e}},userCreated:{triggerWidth:"15.75rem",title:"You've created your first user!",description:(0,n.Y)("p",{children:"Head to the dashboard to customize authentication settings, view user info, and explore more features."}),cta:{kind:"link",text:"Configure your application",href:({claimUrl:e})=>e}},claimed:{triggerWidth:"14.25rem",title:"Missing environment keys",description:(0,n.Y)("p",{children:"You claimed this application but haven't set keys in your environment. Get them from the Clerk Dashboard."}),cta:{kind:"link",text:"Get API keys",href:({claimUrl:e})=>e}},completed:{triggerWidth:"10.5rem",title:"Your app is ready",description:({appName:e,instanceUrl:t})=>(0,n.FD)("p",{children:["Your application"," ",(0,n.Y)("a",{href:t,target:"_blank",rel:"noopener noreferrer",children:e})," ","has been configured. You may now customize your settings in the Clerk dashboard."]}),cta:{kind:"action",text:"Dismiss",onClick:e=>{e?.().then(()=>{window.location.reload()})}}}};function k(e,t,r){return t?"completed":e?"claimed":r?"userCreated":"idle"}function Y(e,t){let r=v[e],n="function"==typeof r.description?r.description({appName:t.appName,instanceUrl:t.instanceUrl}):r.description,i=r.cta,o="link"===i.kind?{kind:"link",text:i.text,href:"function"==typeof i.href?i.href({claimUrl:t.claimUrl,instanceUrl:t.instanceUrl}):i.href}:{kind:"action",text:i.text,onClick:()=>i.onClick(t.onDismiss)};return{state:e,triggerWidth:r.triggerWidth,title:r.title,description:n,cta:o}}function $(e){let t=(0,a.useId)(),r=function(){let e=(0,i.ho)(),t=(0,a.useRef)(Date.now()),[,r]=(0,a.useReducer)(e=>e+1,0);return(0,a.useEffect)(()=>{let n=new AbortController;return window.addEventListener("focus",async()=>{let i=e.__internal_environment;if(i){if(null!==i.authConfig.claimedAt)return n.abort();if(!(Date.now()<t.current+1e4)&&"visible"===document.visibilityState)for(let e=0;e<2;e++){let{authConfig:{claimedAt:e}}=await i.fetch();if(t.current=Date.now(),null!==e){r();break}}}},{signal:n.signal}),()=>{n.abort()}},[]),(0,g.O)()}(),{isDragging:s,cornerStyle:v,containerRef:$,onPointerDown:L,preventClick:B,isInitialized:D}=function(){let[e,t]=(0,a.useState)("bottom-right"),[r,n]=(0,a.useState)(!1),[i,o]=(0,a.useState)(!1),[s,l]=(0,a.useState)(!1),g=(0,a.useRef)(null);(0,a.useEffect)(()=>{if("undefined"==typeof window)return void l(!0);try{let e=localStorage.getItem(c);e&&f.includes(e)&&t(e)}catch{}finally{l(!0)}},[]);let x=(0,a.useRef)(null),b=(0,a.useRef)({state:"idle"}),y=(0,a.useRef)(null),w=(0,a.useRef)({x:0,y:0}),C=(0,a.useRef)({x:0,y:0}),v=(0,a.useRef)(0),k=(0,a.useRef)([]),Y=(0,a.useRef)(null),$=(0,a.useCallback)(e=>{x.current&&(C.current=e,x.current.style.transform=`translate3d(${e.x}px, ${e.y}px, 0)`)},[]),L=(0,a.useCallback)(()=>{let t=x.current;if(!t)return{"top-left":p,"top-right":p,"bottom-left":p,"bottom-right":p};let r=Y.current?.width??t.offsetWidth??0,n=Y.current?.height??t.offsetHeight??0,i=window.innerWidth-document.documentElement.clientWidth;function o(e){let t=e.includes("right"),o=e.includes("bottom");return{x:t?window.innerWidth-i-20-r:20,y:o?window.innerHeight-20-n:20}}let a=o(e);function s(e){let t=o(e);return{x:t.x-a.x,y:t.y-a.y}}return{"top-left":s("top-left"),"top-right":s("top-right"),"bottom-left":s("bottom-left"),"bottom-right":s("bottom-right")}},[e]),B=(0,a.useCallback)(r=>{let n=x.current;if(!n)return;let i=r.translation.x-C.current.x,a=r.translation.y-C.current.y;if(.5>Math.sqrt(i*i+a*a)){h(r.corner),C.current=p,n.style.transition="",n.style.transform=d,b.current={state:"idle"},o(!1);return}let s=i=>{"transform"===i.propertyName&&(n.removeEventListener("transitionend",s),h(r.corner),r.corner===e?(C.current=p,n.style.transition="",n.style.transform=d,b.current={state:"idle"},o(!1)):(b.current={state:"animating"},g.current=r.corner,t(r.corner)))};n.style.transition="transform 350ms cubic-bezier(0.34, 1.2, 0.64, 1)",n.addEventListener("transitionend",s),$(r.translation)},[$,e]),D=(0,a.useCallback)(()=>{"drag"===b.current.state?(x.current?.releasePointerCapture(b.current.pointerId),b.current={state:"animating"}):b.current={state:"idle"},y.current&&(y.current(),y.current=null),k.current=[],n(!1),Y.current=null,x.current?.classList.remove("dev-tools-grabbing"),document.body.style.removeProperty("user-select"),document.body.style.removeProperty("-webkit-user-select")},[]);(0,a.useLayoutEffect)(()=>{if(g.current===e){let e=x.current;e&&"animating"===b.current.state&&(C.current=p,e.style.transition="",e.style.transform=d,b.current={state:"idle"},o(!1),g.current=null)}},[e]),(0,a.useLayoutEffect)(()=>()=>{D()},[D]);let A=(0,a.useCallback)(e=>{let t=e.target;if("A"===t.tagName||t.closest("a")||0!==e.button)return;let r=x.current;if(!r)return;Y.current={width:r.offsetWidth,height:r.offsetHeight},w.current={x:e.clientX,y:e.clientY};let i=r.style.transform;if(i&&"none"!==i&&i!==d){let e=i.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);e&&(C.current={x:parseFloat(e[1])||0,y:parseFloat(e[2])||0})}else C.current=p;b.current={state:"press"},k.current=[],v.current=Date.now();let a=e=>{if("press"===b.current.state){let t=e.clientX-w.current.x,i=e.clientY-w.current.y;if(5>Math.sqrt(t*t+i*i))return;b.current={state:"drag",pointerId:e.pointerId};try{r.setPointerCapture(e.pointerId)}catch{}r.style.transition="none",r.classList.add("dev-tools-grabbing"),document.body.style.userSelect="none",document.body.style.webkitUserSelect="none",n(!0),$({x:C.current.x+t,y:C.current.y+i}),w.current={x:e.clientX,y:e.clientY};return}if("drag"!==b.current.state)return;let t={x:e.clientX,y:e.clientY},i=t.x-w.current.x,o=t.y-w.current.y;w.current=t,$({x:C.current.x+i,y:C.current.y+o});let a=Date.now();a-v.current>=10&&(k.current=[...k.current.slice(-4),{position:t,timestamp:a}],v.current=a)},s=()=>{if("drag"===b.current.state){let e=function(e){if(e.length<2)return p;let t=e[0],r=e[e.length-1],n=r.timestamp-t.timestamp;return 0===n?p:{x:(r.position.x-t.position.x)/n*1e3,y:(r.position.y-t.position.y)/n*1e3}}(k.current),t=L();if(D(),!x.current)return;let r=function(e,t){let r="bottom-right",n=1/0;for(let[i,o]of Object.entries(t)){let t=e.x-o.x,a=e.y-o.y,s=Math.sqrt(t*t+a*a);s<n&&(n=s,r=i)}return r}({x:C.current.x+m(e.x),y:C.current.y+m(e.y)},t),n=t[r];o(!0),B({corner:r,translation:n})}else D()},l=e=>{let t=e.target,r="BUTTON"===t.tagName||t.closest("button"),n="A"===t.tagName||t.closest("a");"animating"!==b.current.state||r||n||(e.preventDefault(),e.stopPropagation())};window.addEventListener("pointermove",a),window.addEventListener("pointerup",s,{once:!0}),window.addEventListener("pointercancel",D,{once:!0}),r.addEventListener("click",l),y.current&&y.current(),y.current=()=>{window.removeEventListener("pointermove",a),window.removeEventListener("pointerup",s),window.removeEventListener("pointercancel",D),r.removeEventListener("click",l)}},[D,$,B,L]);return{corner:e,isDragging:r,cornerStyle:function(e){switch(e){case"top-left":return{top:u,left:u};case"top-right":return{top:u,right:u};case"bottom-left":return{bottom:u,left:u};case"bottom-right":return{bottom:u,right:u}}}(e),containerRef:x,onPointerDown:A,preventClick:i,isInitialized:s}}(),A=!!r.authConfig.claimedAt,F="function"==typeof e.onDismiss&&A,{isSignedIn:U}=(0,i.Jd)(),S=r.displayConfig.applicationName,_=(0,a.useMemo)(()=>{if(A)return e.copyKeysUrl;let t=new URL(e.claimUrl);return t.searchParams.append("return_url",window.location.href),t.href},[A,e.copyKeysUrl,e.claimUrl]),M=(0,a.useMemo)(()=>(function(e){try{return e()}catch{return"https://dashboard.clerk.com/last-active"}})(()=>{let t=(0,l.CB)(e.copyKeysUrl);return new URL(`${t.baseDomain}/apps/${t.appId}/instances/${t.instanceId}/user-authentication/email-phone-username`).href}),[e.copyKeysUrl]),[H,E]=(0,a.useState)(!0),R=k(A,F,!!U),I=(0,a.useMemo)(()=>Y(R,{appName:S,instanceUrl:M,claimUrl:_,onDismiss:e.onDismiss}),[R,S,M,_,e.onDismiss]),W="link"===I.cta.kind?(0,n.Y)("a",{href:I.cta.href,target:"_blank",rel:"noopener noreferrer",css:C,children:I.cta.text}):(0,n.Y)("button",{type:"button",onClick:I.cta.onClick,css:C,children:I.cta.text});return(0,n.FD)("div",{ref:$,onPointerDown:H?void 0:L,style:{...v,opacity:D?void 0:0},"data-expanded":H,css:(0,o.AH)`
        ${y};
        position: fixed;
        border-radius: ${H?"0.75rem":"2.5rem"};
        background-color: #1f1f1f;
        box-shadow:
          0px 0px 0px 0.5px #2f3037 inset,
          0px 1px 0px 0px rgba(255, 255, 255, 0.08) inset,
          0px 0px 0.8px 0.8px rgba(255, 255, 255, 0.2) inset,
          0px 0px 0px 0px rgba(255, 255, 255, 0.72),
          0px 16px 36px -6px rgba(0, 0, 0, 0.36),
          0px 6px 16px -2px rgba(0, 0, 0, 0.2);
        height: auto;
        isolation: isolate;
        transform: translateZ(0);
        backface-visibility: hidden;
        width: ${H?x:I.triggerWidth};
        cursor: ${s?"grabbing":H?"default":"grab"};
        touch-action: none;
        transition: ${s?"none":D?`width ${w(H)} ${b}, border-radius ${w(H)} cubic-bezier(0.2, 0, 0, 1)`:"none"};

        @media (prefers-reduced-motion: reduce) {
          transition: none;
        }
        &:has(button:focus-visible) {
          outline: 2px solid #6c47ff;
          outline-offset: 2px;
        }
        &::before {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background-image: linear-gradient(180deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 100%);
          opacity: 0.16;
          transition: opacity ${w(H)} ${b};

          @media (prefers-reduced-motion: reduce) {
            transition: none;
          }
        }
        &[data-expanded='true']::before,
        &:hover::before {
          opacity: 0.2;
        }
      `,children:[(0,n.FD)("button",{type:"button","aria-label":"Keyless prompt","aria-controls":t,"aria-expanded":H,onClick:()=>{B||E(e=>!e)},css:(0,o.AH)`
          ${y};
          display: flex;
          align-items: center;
          width: 100%;
          border-radius: inherit;
          padding-inline: 0.75rem;
          gap: 0.25rem;
          height: 2.5rem;
          outline: none;
          cursor: pointer;
          user-select: none;
        `,children:[(0,n.FD)("svg",{css:(0,o.AH)`
            width: 1rem;
            height: 1rem;
            flex-shrink: 0;
          `,fill:"none",viewBox:"0 0 128 128",children:[(0,n.Y)("circle",{cx:"64",cy:"64",r:"20",fill:"#fff"}),(0,n.Y)("path",{fill:"#fff",fillOpacity:".4",d:"M99.572 10.788c1.999 1.34 2.17 4.156.468 5.858L85.424 31.262c-1.32 1.32-3.37 1.53-5.033.678A35.846 35.846 0 0 0 64 28c-19.882 0-36 16.118-36 36a35.846 35.846 0 0 0 3.94 16.391c.851 1.663.643 3.712-.678 5.033L16.646 100.04c-1.702 1.702-4.519 1.531-5.858-.468C3.974 89.399 0 77.163 0 64 0 28.654 28.654 0 64 0c13.163 0 25.399 3.974 35.572 10.788Z"}),(0,n.Y)("path",{fill:"#fff",d:"M100.04 111.354c1.702 1.702 1.531 4.519-.468 5.858C89.399 124.026 77.164 128 64 128c-13.164 0-25.399-3.974-35.572-10.788-2-1.339-2.17-4.156-.468-5.858l14.615-14.616c1.322-1.32 3.37-1.53 5.033-.678A35.847 35.847 0 0 0 64 100a35.846 35.846 0 0 0 16.392-3.94c1.662-.852 3.712-.643 5.032.678l14.616 14.616Z"})]}),(0,n.Y)("span",{css:(0,o.AH)`
            ${y};
            font-size: 0.875rem;
            font-weight: 500;
            color: #d9d9d9;
            white-space: nowrap;
          `,children:I.title}),(0,n.Y)("svg",{css:(0,o.AH)`
            width: 1rem;
            height: 1rem;
            flex-shrink: 0;
            color: #d9d9d9;
            margin-inline-start: auto;
            opacity: ${.5*!!H};
            transition: opacity ${w(H)} ease-out;

            @media (prefers-reduced-motion: reduce) {
              transition: none;
            }
            ${H&&(0,o.AH)`
              button:hover & {
                opacity: 1;
              }
            `}
          `,viewBox:"0 0 16 16",fill:"none","aria-hidden":"true",xmlns:"http://www.w3.org/2000/svg",children:(0,n.Y)("path",{d:"M3.75 8H12.25",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round"})})]}),(0,n.Y)("div",{id:t,...!H&&{inert:""},css:(0,o.AH)`
          ${y};
          display: grid;
          grid-template-rows: ${H?"1fr":"0fr"};
          transition: grid-template-rows ${w(H)} ${b};

          @media (prefers-reduced-motion: reduce) {
            transition: none;
          }
        `,children:(0,n.Y)("div",{css:(0,o.AH)`
            ${y};
            min-height: 0;
            overflow: hidden;
          `,children:(0,n.FD)("div",{css:(0,o.AH)`
              ${y};
              width: ${x};
              padding-inline: 0.75rem;
              padding-block-end: 0.75rem;
              opacity: ${+!!H};
              transition: opacity ${w(H)} ${b};

              @media (prefers-reduced-motion: reduce) {
                transition: none;
              }
            `,children:[(0,n.Y)("div",{css:(0,o.AH)`
                ${y};
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                & ul {
                  ${y};
                  list-style: disc;
                  padding-left: 1rem;
                }
                & p,
                & li {
                  ${y};
                  color: #b4b4b4;
                  font-size: 0.8125rem;
                  font-weight: 400;
                  line-height: 1rem;
                  text-wrap: pretty;
                }
                & a {
                  color: #fde047;
                  font-weight: 500;
                  outline: none;
                  text-decoration: underline;
                  &:focus-visible {
                    outline: 2px solid #6c47ff;
                    outline-offset: 2px;
                  }
                }
              `,children:I.description}),W]})})})]})}function L(e){return(0,n.Y)(s.S,{children:(0,n.Y)($,{...e})})}},8307:function(e,t,r){r.d(t,{CB:()=>c,F3:()=>l,MF:()=>u,Uw:()=>a,mk:()=>s});var n=r(4518),i=r(8802),o=r(8272);function a({children:e,sx:t,...r}){return(0,n.Y)(o.so,{sx:e=>[{borderRadius:"1.25rem",fontFamily:e.fonts.$main,background:"linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 100%), #1f1f1f",boxShadow:"0px 0px 0px 0.5px #2F3037 inset, 0px 1px 0px 0px rgba(255, 255, 255, 0.08) inset, 0px 0px 0.8px 0.8px rgba(255, 255, 255, 0.20) inset, 0px 0px 0px 0px rgba(255, 255, 255, 0.72), 0px 16px 36px -6px rgba(0, 0, 0, 0.36), 0px 6px 16px -2px rgba(0, 0, 0, 0.20);"},t],...r,children:e})}let s=(0,i.AH)`
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  line-height: 1.5;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    avenir next,
    avenir,
    segoe ui,
    helvetica neue,
    helvetica,
    Cantarell,
    Ubuntu,
    roboto,
    noto,
    arial,
    sans-serif;
  text-decoration: none;
`;function l(e){return(0,n.Y)("svg",{...e,viewBox:"0 0 16 17",fill:"none","aria-hidden":!0,xmlns:"http://www.w3.org/2000/svg",children:(0,n.FD)("g",{opacity:"0.88",children:[(0,n.Y)("path",{d:"M13.8002 8.20039C13.8002 8.96206 13.6502 9.71627 13.3587 10.42C13.0672 11.1236 12.64 11.763 12.1014 12.3016C11.5628 12.8402 10.9234 13.2674 10.2198 13.5589C9.51607 13.8504 8.76186 14.0004 8.0002 14.0004C7.23853 14.0004 6.48432 13.8504 5.78063 13.5589C5.07694 13.2674 4.43756 12.8402 3.89898 12.3016C3.3604 11.763 2.93317 11.1236 2.64169 10.42C2.35022 9.71627 2.2002 8.96206 2.2002 8.20039C2.2002 6.66214 2.81126 5.18688 3.89898 4.09917C4.98669 3.01146 6.46194 2.40039 8.0002 2.40039C9.53845 2.40039 11.0137 3.01146 12.1014 4.09917C13.1891 5.18688 13.8002 6.66214 13.8002 8.20039Z",fill:"#22C543",fillOpacity:"0.16"}),(0,n.Y)("path",{d:"M6.06686 8.68372L7.51686 10.1337L9.93353 6.75039M13.8002 8.20039C13.8002 8.96206 13.6502 9.71627 13.3587 10.42C13.0672 11.1236 12.64 11.763 12.1014 12.3016C11.5628 12.8402 10.9234 13.2674 10.2198 13.5589C9.51607 13.8504 8.76186 14.0004 8.0002 14.0004C7.23853 14.0004 6.48432 13.8504 5.78063 13.5589C5.07694 13.2674 4.43756 12.8402 3.89898 12.3016C3.3604 11.763 2.93317 11.1236 2.64169 10.42C2.35022 9.71627 2.2002 8.96206 2.2002 8.20039C2.2002 6.66214 2.81126 5.18688 3.89898 4.09917C4.98669 3.01146 6.46194 2.40039 8.0002 2.40039C9.53845 2.40039 11.0137 3.01146 12.1014 4.09917C13.1891 5.18688 13.8002 6.66214 13.8002 8.20039Z",stroke:"#22C543",strokeWidth:"1.2",strokeLinecap:"round",strokeLinejoin:"round"})]})})}function c(e){let t=new URL(e).href.match(/^https?:\/\/(.*?)\/apps\/app_(.+?)\/instances\/ins_(.+?)(?:\/.*)?$/);if(!t)throw Error("Invalid value Dashboard URL structure");return{baseDomain:`https://${t[1]}`,appId:`app_${t[2]}`,instanceId:`ins_${t[3]}`}}function u(){return(0,n.FD)("svg",{width:"1rem",height:"1.25rem",viewBox:"0 0 16 20",fill:"none","aria-hidden":!0,xmlns:"http://www.w3.org/2000/svg",children:[(0,n.FD)("g",{filter:"url(#filter0_i_438_501)",children:[(0,n.Y)("path",{d:"M10.4766 9.99979C10.4766 11.3774 9.35978 12.4942 7.98215 12.4942C6.60452 12.4942 5.48773 11.3774 5.48773 9.99979C5.48773 8.62216 6.60452 7.50537 7.98215 7.50537C9.35978 7.50537 10.4766 8.62216 10.4766 9.99979Z",fill:"#BBBBBB"}),(0,n.Y)("path",{d:"M12.4176 3.36236C12.6676 3.52972 12.6889 3.88187 12.4762 4.09457L10.6548 5.91595C10.4897 6.08107 10.2336 6.10714 10.0257 6.00071C9.41273 5.68684 8.71811 5.50976 7.98214 5.50976C5.5024 5.50976 3.49219 7.51998 3.49219 9.99972C3.49219 10.7357 3.66926 11.4303 3.98314 12.0433C4.08957 12.2511 4.06349 12.5073 3.89837 12.6724L2.07699 14.4938C1.86429 14.7065 1.51215 14.6851 1.34479 14.4352C0.495381 13.1666 0 11.641 0 9.99972C0 5.5913 3.57373 2.01758 7.98214 2.01758C9.62345 2.01758 11.1491 2.51296 12.4176 3.36236Z",fill:"#8F8F8F"}),(0,n.Y)("path",{d:"M12.4762 15.905C12.6889 16.1177 12.6675 16.4698 12.4176 16.6372C11.149 17.4866 9.62342 17.982 7.9821 17.982C6.34078 17.982 4.81516 17.4866 3.54661 16.6372C3.29666 16.4698 3.27531 16.1177 3.48801 15.905L5.30938 14.0836C5.4745 13.9185 5.73066 13.8924 5.93851 13.9988C6.55149 14.3127 7.24612 14.4898 7.9821 14.4898C8.71808 14.4898 9.4127 14.3127 10.0257 13.9988C10.2335 13.8924 10.4897 13.9185 10.6548 14.0836L12.4762 15.905Z",fill:"#BBBBBB"})]}),(0,n.Y)("defs",{children:(0,n.FD)("filter",{id:"filter0_i_438_501",x:"0",y:"1.86758",width:"12.6217",height:"16.1144",filterUnits:"userSpaceOnUse",colorInterpolationFilters:"sRGB",children:[(0,n.Y)("feFlood",{floodOpacity:"0",result:"BackgroundImageFix"}),(0,n.Y)("feBlend",{mode:"normal",in:"SourceGraphic",in2:"BackgroundImageFix",result:"shape"}),(0,n.Y)("feColorMatrix",{in:"SourceAlpha",type:"matrix",values:"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0",result:"hardAlpha"}),(0,n.Y)("feOffset",{dy:"-0.15"}),(0,n.Y)("feGaussianBlur",{stdDeviation:"0.15"}),(0,n.Y)("feComposite",{in2:"hardAlpha",operator:"arithmetic",k2:"-1",k3:"1"}),(0,n.Y)("feColorMatrix",{type:"matrix",values:"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"}),(0,n.Y)("feBlend",{mode:"normal",in2:"shape",result:"effect1_innerShadow_438_501"})]})})]})}}}]);