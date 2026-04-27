const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let tk, payload, url;
  const reqPromise = page.waitForRequest(req => {
     if(req.url().includes('DataActionGetConteudoDataAndApplicationSettings') && req.method()==='POST') { 
         tk = req.headers()['x-csrftoken']; 
         payload = JSON.parse(req.postData()); 
         url = req.url(); 
         return true; 
     } 
     return false;
  });
  
  await page.goto('https://diariodarepublica.pt/dr/detalhe/anuncio-procedimento/6231-2026-1071763521');
  await reqPromise;
  await context.close();
  await browser.close();

  console.log('Real vars sent for 6231:', JSON.stringify(payload.screenData.variables, null, 2));
})();