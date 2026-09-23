(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const toast = document.querySelector('.toast');
  let toastTimer;
  const announce = message => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
  };
  let preference;
  try { preference = localStorage.getItem('reliasense-motion'); } catch { /* Private storage may be unavailable. */ }
  let enabled = !reduced.matches && preference !== 'off';
  const scenes = [...document.querySelectorAll('.scene')].map(el => ({el, visible: true, x:0,y:0,tx:0,ty:0,scroll:0,tscroll:0}));
  const magnets = [...document.querySelectorAll('.magnet')].map(el => ({el, x:0,y:0,tx:0,ty:0}));
  const cards = [...document.querySelectorAll('[data-tilt-card]')].map(el => ({el,x:0,y:0,tx:0,ty:0}));
  const halo = document.querySelector('.cursor-halo');
  const pointer = {x:0,y:0,tx:0,ty:0,visible:false};
  const motionToggle = document.querySelector('[data-motion-toggle]');
  const tiltToggle = document.querySelector('[data-tilt-toggle]');
  const tiltStatus = document.querySelector('#tilt-status');
  let frame = 0;
  let sensorRequested = false, sensorLive = false, sensorGeneration = 0, sensorTimer = 0, baseline = null;
  let sceneObserver, revealObserver;
  const pausedReveals = new Set();
  function pauseHiddenEffects() {
    root.dataset.pageHidden=String(document.hidden);
    if (document.hidden) {
      for (const a of document.getAnimations()) {
        if (a.playState==='running' && a.effect?.target?.hasAttribute?.('data-reveal')) { pausedReveals.add(a);a.pause(); }
      }
    } else {
      for (const a of pausedReveals) if (a.playState==='paused') a.play();
      pausedReveals.clear();
    }
  }

  function interpolate(item, key, targetKey) {
    const delta = item[targetKey] - item[key];
    item[key] = Math.abs(delta) < .015 ? item[targetKey] : item[key] + delta * .12;
    return Math.abs(delta) >= .015;
  }
  function tick() {
    frame = 0;
    if (!enabled || document.hidden) return;
    let moving = false;
    for (const item of magnets) {
      moving = interpolate(item,'x','tx') || moving;
      moving = interpolate(item,'y','ty') || moving;
      item.el.style.setProperty('--mx',`${item.x}px`);
      item.el.style.setProperty('--my',`${item.y}px`);
      item.el.style.setProperty('--tx',`${item.x * .46}px`);
      item.el.style.setProperty('--ty',`${item.y * .46}px`);
    }
    for (const item of cards) {
      moving = interpolate(item,'x','tx') || moving;
      moving = interpolate(item,'y','ty') || moving;
      item.el.style.setProperty('--rx',`${-item.y}deg`);
      item.el.style.setProperty('--ry',`${item.x}deg`);
    }
    for (const item of scenes) {
      if (!item.visible) continue;
      moving = interpolate(item,'x','tx') || moving;
      moving = interpolate(item,'y','ty') || moving;
      moving = interpolate(item,'scroll','tscroll') || moving;
      item.el.style.setProperty('--scene-x',`${item.x}px`);
      item.el.style.setProperty('--scene-y',`${item.y}px`);
      item.el.style.setProperty('--scene-r',`${item.x / 12}deg`);
      item.el.style.setProperty('--scroll-depth',`${item.scroll}px`);
    }
    if (halo && pointer.visible && fine.matches) {
      moving = interpolate(pointer,'x','tx') || moving;
      moving = interpolate(pointer,'y','ty') || moving;
      halo.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0)`;
    }
    if (moving) schedule();
  }
  function schedule() {
    if (!frame && enabled && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function resetVisuals() {
    cancelAnimationFrame(frame); frame = 0;
    for (const item of [...magnets,...cards,...scenes]) {
      item.x=item.y=item.tx=item.ty=0;
      item.el.style.removeProperty('--mx');item.el.style.removeProperty('--my');
      item.el.style.removeProperty('--tx');item.el.style.removeProperty('--ty');
      item.el.style.removeProperty('--rx');item.el.style.removeProperty('--ry');
      item.el.style.removeProperty('--scene-x');item.el.style.removeProperty('--scene-y');item.el.style.removeProperty('--scene-r');
      item.el.style.removeProperty('--scroll-depth');
      if ('scroll' in item) item.scroll=item.tscroll=0;
    }
    halo?.classList.remove('active'); pointer.visible=false;
    document.querySelectorAll('.cursor-ripple').forEach(el=>el.remove());
  }
  function stopSensor(message = '') {
    sensorGeneration++;
    sensorRequested=false;sensorLive=false;baseline=null;
    clearTimeout(sensorTimer);
    window.removeEventListener('deviceorientation',orientation);
    if (tiltToggle) {
      tiltToggle.setAttribute('aria-pressed','false');
      tiltToggle.querySelector('span').textContent='开启倾斜视角';
    }
    if (tiltStatus) tiltStatus.textContent=message;
    for (const s of scenes) s.tx=s.ty=0;
    schedule();
  }
  function updateMotion() {
    enabled = !reduced.matches && preference !== 'off';
    root.dataset.motion = enabled ? 'on' : 'off';
    if (motionToggle) {
      motionToggle.setAttribute('aria-pressed',String(enabled));
      motionToggle.disabled=reduced.matches;
      motionToggle.querySelector('[data-motion-label]').textContent=reduced.matches?'跟随系统：减少动态':`画面动态：${enabled?'开':'关'}`;
    }
    if (tiltToggle) tiltToggle.disabled=!enabled;
    if (!enabled) {
      stopSensor();resetVisuals();
      document.getAnimations().filter(a=>a.effect?.target?.hasAttribute?.('data-reveal')).forEach(a=>a.cancel());
    } else updateScroll();
  }
  document.querySelector('.motion-controls')?.removeAttribute('hidden');
  motionToggle?.addEventListener('click',()=>{
    preference=enabled?'off':'on';
    try { localStorage.setItem('reliasense-motion',preference); } catch { /* Current-page control still works. */ }
    updateMotion();
  });
  reduced.addEventListener('change',updateMotion);
  fine.addEventListener('change',()=>{resetVisuals();updateScroll();});

  magnets.forEach(item=>{
    item.el.addEventListener('pointermove',event=>{
      if (!enabled || !fine.matches || event.pointerType==='touch') return;
      const r=item.el.getBoundingClientRect();
      item.tx=clamp((event.clientX-r.left-r.width/2)*.18,-13,13);
      item.ty=clamp((event.clientY-r.top-r.height/2)*.24,-9,9);
      schedule();
    });
    item.el.addEventListener('pointerleave',()=>{item.tx=item.ty=0;schedule();});
    item.el.addEventListener('blur',()=>{item.tx=item.ty=0;schedule();});
  });
  cards.forEach(item=>{
    item.el.addEventListener('pointermove',event=>{
      if (!enabled || !fine.matches || event.pointerType==='touch') return;
      const r=item.el.getBoundingClientRect();
      item.tx=clamp((event.clientX-r.left)/r.width-.5,-.5,.5)*5;
      item.ty=clamp((event.clientY-r.top)/r.height-.5,-.5,.5)*4;
      schedule();
    });
    item.el.addEventListener('pointerleave',()=>{item.tx=item.ty=0;schedule();});
  });
  document.addEventListener('pointermove',event=>{
    if (!enabled || !fine.matches || event.pointerType==='touch') return;
    if (halo) {
      pointer.tx=event.clientX;pointer.ty=event.clientY;
      if (!pointer.visible) {pointer.x=pointer.tx;pointer.y=pointer.ty;pointer.visible=true;}
      halo.classList.add('active');
      halo.classList.toggle('over-control',!!event.target.closest('a,button,summary,input'));
    }
    if (!sensorRequested) for (const s of scenes) {
      const r=s.el.getBoundingClientRect();
      if (!s.visible || event.clientY<r.top || event.clientY>r.bottom) {s.tx=s.ty=0;continue;}
      s.tx=clamp((event.clientX-r.left)/r.width-.5,-.5,.5)*19;
      s.ty=clamp((event.clientY-r.top)/r.height-.5,-.5,.5)*13;
    }
    schedule();
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{
    halo?.classList.remove('active');pointer.visible=false;
    for (const s of scenes) if (!sensorRequested) s.tx=s.ty=0;
    schedule();
  });
  document.addEventListener('pointerdown',event=>{
    if (!enabled || !fine.matches || event.pointerType==='touch' || !halo) return;
    const ring=document.createElement('i');
    ring.className='cursor-ripple';ring.setAttribute('aria-hidden','true');
    ring.style.left=`${event.clientX}px`;ring.style.top=`${event.clientY}px`;
    document.body.append(ring);ring.addEventListener('animationend',()=>ring.remove(),{once:true});
  },{passive:true});
  function updateScroll() {
    if (!enabled) return;
    for (const s of scenes) {
      s.tscroll=innerWidth>720?clamp(-s.el.getBoundingClientRect().top*.055,-8,28):0;
    }
    schedule();
  }
  window.addEventListener('scroll',updateScroll,{passive:true});
  window.addEventListener('resize',()=>{baseline=null;updateScroll();},{passive:true});
  window.addEventListener('orientationchange',()=>{baseline=null;},{passive:true});
  document.addEventListener('visibilitychange',()=>{
    pauseHiddenEffects();
    if (document.hidden) {stopSensor();resetVisuals();}
    else updateScroll();
  });
  window.addEventListener('pagehide',()=>{root.dataset.pageHidden='true';stopSensor();resetVisuals();});
  window.addEventListener('pageshow',()=>{pauseHiddenEffects();updateScroll();});
  if ('IntersectionObserver' in window) {
    sceneObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        const s=scenes.find(s=>s.el===entry.target); if (!s) return;
        s.visible=entry.isIntersecting;
        s.el.querySelectorAll('.sun-dust i,.steam i').forEach(el=>{el.style.animationPlayState=s.visible?'running':'paused';});
      });
      schedule();
    });
    scenes.forEach(s=>sceneObserver.observe(s.el));
    revealObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if (!entry.isIntersecting) return;
        revealObserver.unobserve(entry.target);
        if (!enabled || document.hidden || typeof entry.target.animate!=='function') return;
        const delay=parseFloat(entry.target.style.getPropertyValue('--reveal-delay'))||0;
        entry.target.animate([{opacity:0,transform:'translateY(27px)'},{opacity:1,transform:'translateY(0)'}],{duration:850,delay,easing:'cubic-bezier(.17,.75,.24,1)',fill:'backwards'});
      });
    },{threshold:.13});
    document.querySelectorAll('[data-reveal]').forEach(el=>revealObserver.observe(el));
  }
  function orientation(event) {
    if (!sensorRequested || !enabled || document.hidden || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    if (!baseline) baseline={beta:event.beta,gamma:event.gamma};
    if (!sensorLive) {
      sensorLive=true;clearTimeout(sensorTimer);
      tiltToggle.setAttribute('aria-pressed','true');
      tiltToggle.querySelector('span').textContent='关闭倾斜视角';
      tiltStatus.textContent='轻轻倾斜手机，看看小世界。';
    }
    const angle=(screen.orientation?.angle ?? window.orientation ?? 0)*Math.PI/180;
    const dx=clamp(event.gamma-baseline.gamma,-20,20);
    const dy=clamp(event.beta-baseline.beta,-20,20);
    for (const s of scenes) {
      s.tx=clamp(dx*Math.cos(angle)+dy*Math.sin(angle),-20,20)*.5;
      s.ty=clamp(dy*Math.cos(angle)-dx*Math.sin(angle),-20,20)*.35;
    }
    schedule();
  }
  tiltToggle?.addEventListener('click',async()=>{
    if (sensorRequested) {stopSensor('已关闭倾斜视角。');return;}
    if (!enabled) return;
    if (!window.isSecureContext || !window.DeviceOrientationEvent) {
      tiltStatus.textContent='当前环境不支持倾斜视角，仍可正常浏览。';return;
    }
    sensorRequested=true;
    const generation=++sensorGeneration;
    tiltToggle.querySelector('span').textContent='取消倾斜视角';
    tiltStatus.textContent='等待设备授权与方向信息…';
    try {
      if (typeof window.DeviceOrientationEvent.requestPermission==='function') {
        const permission=await window.DeviceOrientationEvent.requestPermission();
        if (generation!==sensorGeneration) return;
        if (permission!=='granted') {stopSensor('未开启方向权限，仍可正常浏览。');return;}
      }
      if (generation!==sensorGeneration || !enabled || document.hidden) return;
      window.addEventListener('deviceorientation',orientation,{passive:true});
      sensorTimer=setTimeout(()=>{
        if (generation===sensorGeneration && !sensorLive) stopSensor('暂时没有收到方向信息。你可以稍后再试，或继续浏览。');
      },6000);
    } catch {
      if (generation===sensorGeneration) stopSensor('暂时无法开启倾斜视角，仍可正常浏览。');
    }
  });
  pauseHiddenEffects();
  updateMotion();

  // Native links/details stay useful without JavaScript. Enhancements appear only after setup.
  document.querySelectorAll('[data-copy-email]').forEach(button=>{
    button.hidden=false;
    button.addEventListener('click',async()=>{
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText('reliasense@163.com');
        announce('邮箱已复制：reliasense@163.com');
      } catch { announce('无法自动复制，请长按或选中邮箱地址手动复制。'); }
    });
  });
  const search=document.querySelector('.faq-search input');
  if (search) {
    const items=[...document.querySelectorAll('.faq-item')];
    const filters=[...document.querySelectorAll('[data-filter]')];
    const count=document.querySelector('.faq-count');
    const empty=document.querySelector('.empty-state');
    let selected='all';
    function filterQuestions() {
      const query=search.value.trim().toLocaleLowerCase();
      let visible=0;
      for (const item of items) {
        const matches=(selected==='all'||item.dataset.group===selected) && item.textContent.toLocaleLowerCase().includes(query);
        item.hidden=!matches;
        if (matches) visible++;
      }
      count.textContent=`共 ${visible} 个问题`;
      empty.hidden=visible!==0;
      filters.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===selected)));
    }
    filters.forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.filter;filterQuestions();}));
    search.addEventListener('input',filterQuestions);
    document.querySelector('[data-clear-search]').addEventListener('click',()=>{search.value='';selected='all';filterQuestions();search.focus();});
    document.querySelector('.faq-search').hidden=false;
    document.querySelector('.faq-filters').hidden=false;
    count.hidden=false;filterQuestions();
  }
  const toc=document.querySelector('.toc details');
  if (toc) {
    const narrow=matchMedia('(max-width: 720px)');
    const adapt=()=>{toc.open=!narrow.matches;};adapt();narrow.addEventListener('change',adapt);
    const links=[...toc.querySelectorAll('a')];
    const mark=id=>links.forEach(link=>{
      const active=link.hash===`#${id}`;
      link.classList.toggle('current',active);
      if (active) link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
    });
    links.forEach(link=>link.addEventListener('click',()=>{if(narrow.matches)toc.open=false;mark(link.hash.slice(1));}));
    if ('IntersectionObserver' in window) {
      const visible=new Map();
      const observer=new IntersectionObserver(entries=>{
        entries.forEach(entry=>visible.set(entry.target.id,entry.isIntersecting));
        const first=[...document.querySelectorAll('.legal-section')].find(section=>visible.get(section.id));
        if(first)mark(first.id);
      },{rootMargin:'-5% 0px -65% 0px'});
      document.querySelectorAll('.legal-section').forEach(section=>observer.observe(section));
    }
  }
})();
