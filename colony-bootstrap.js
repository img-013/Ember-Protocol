import * as runtime from './colony-runtime.js';
import * as needs from './colony-needs.js';
window.emberRuntime = runtime;
window.emberNeeds = needs;
// Keep legacy catalog declarations in their shared classic-script scope while
// migrating systems individually; the original UI and content remain intact.
try {
  for (const file of ['colony-game.js','colony-framework.js','colony-people.js']) {
    await new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src=new URL(file,import.meta.url).href;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('无法加载 '+file));
      document.body.append(script);
    });
  }
} catch (error) {
  const box=document.querySelector('#globalError');
  box.textContent=error.message; box.classList.add('open');
  console.error(error);
}
