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
  
  await page.goto('https://diariodarepublica.pt/dr/detalhe/anuncio-procedimento/6844-2026-1073674459-41');
  await reqPromise;
  await context.close();
  await browser.close();

  // Test fetch with EXACT ID: 6844-2026-1073674459-41 (which we literally just fetched)
  // payload.screenData.variables.DiarioRepId = "1073674459";
  
  const res = await fetch(url, { 
      headers: { 
          'x-csrftoken': '', 
          'content-type': 'application/json; charset=UTF-8' 
      }, 
      method: 'POST', 
      body: JSON.stringify(payload) 
  });
  
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
})();