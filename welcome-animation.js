
function showMahalakshmiWelcome(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var overlay=document.createElement('div');
  overlay.id='ml-welcome';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Welcome to Mahalakshmi Store');
  overlay.innerHTML='<div class="ml-content"><div class="ml-emblem" aria-hidden="true"><svg viewBox="0 0 1536 600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><mask id="ml-lotus-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="600"><g fill="none" stroke="white" stroke-width="105" stroke-linecap="round" stroke-linejoin="round"><path class="ml-petal" style="--ml-start:.2s" pathLength="1" d="M768 567 C717 472 678 394 705 314 C689 264 739 227 768 181 C793 237 849 272 823 334 C795 398 775 466 768 567"/><path class="ml-petal" style="--ml-start:1s" pathLength="1" d="M755 552 C659 482 595 389 603 272 C670 292 721 349 747 412"/><path class="ml-petal" style="--ml-start:1.8s" pathLength="1" d="M780 552 C877 482 941 389 933 272 C866 292 815 349 789 412"/><path class="ml-petal" style="--ml-start:2.6s" pathLength="1" d="M728 530 C605 507 554 482 518 415 L483 383 C575 374 640 426 680 487"/><path class="ml-petal" style="--ml-start:3.2s" pathLength="1" d="M808 530 C931 507 982 482 1018 415 L1053 383 C961 374 896 426 856 487"/><path class="ml-petal" style="--ml-start:3.8s" pathLength="1" d="M748 556 C683 525 624 540 570 558 C635 578 696 565 748 556 M788 556 C853 525 912 540 966 558 C901 578 840 565 788 556"/></g><rect class="ml-flower-finish" width="1536" height="600" fill="white"/></mask></defs><image href="mahalakshmi-logo.png" width="1536" height="1024" mask="url(#ml-lotus-mask)"/></svg></div><div class="ml-name" aria-label="Mahalakshmi"></div><div class="ml-store">STORE</div><p>Welcome to Mahalakshmi Cloth Center &amp; Fancy Store</p><div class="ml-line" aria-hidden="true"></div></div><button type="button">Enter store &rarr;</button>';
  var name=overlay.querySelector('.ml-name');
  'MAHALAKSHMI'.split('').forEach(function(letter,index){
    var span=document.createElement('span');
    span.className='ml-letter';span.textContent=letter;span.setAttribute('aria-hidden','true');
    span.style.setProperty('--ml-delay',(5.5+index*0.22)+'s');name.appendChild(span);
  });
  document.body.appendChild(overlay);
  var previousFocus=document.activeElement, timer, closed=false;
  var button=overlay.querySelector('button');
  button.focus({preventScroll:true});
  function keyHandler(event){if(event.key==='Escape')close();else if(event.key==='Tab'){event.preventDefault();button.focus();}}
  function close(){if(closed)return;closed=true;clearTimeout(timer);document.removeEventListener('keydown',keyHandler,true);overlay.classList.add('ml-closing');overlay.removeAttribute('aria-modal');if(previousFocus&&previousFocus!==document.body)previousFocus.focus({preventScroll:true});else button.blur();setTimeout(function(){overlay.remove();},750);}
  button.addEventListener('click',close);
  document.addEventListener('keydown',keyHandler,true);
  overlay.querySelector('image').addEventListener('error',close);
  timer=setTimeout(close,9200);
}
(function(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const logo = new Image();
  let started = false;
  function start(){if(started)return;started=true;showMahalakshmiWelcome();}
  logo.onload=start;
  logo.onerror=start;
  logo.src='mahalakshmi-logo.png';
  if(logo.complete)start();
})();
