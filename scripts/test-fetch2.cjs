(async () => {
    const payload = {
        "versionInfo": {"moduleVersion": "", "apiVersion": ""},
        "viewName": "Legislacao_Conteudos.Conteudo_Detalhe",
        "screenData": {
            "variables": {
                "DiarioRepId": "1073674459",
                "ConteudoId": "1073674459",
                "Numero": "6844",
                "Year": 2026,
                "Key": "6844-2026-1073674459-41",
                "Tipo": "anuncio-procedimento",
                "ParteId": "41"
            }
        }
    };
    
    const res = await fetch('https://diariodarepublica.pt/dr/screenservices/dr/Legislacao_Conteudos/Conteudo_Detalhe/DataActionGetConteudoDataAndApplicationSettings', {
        headers: { 
            'x-csrftoken': '', 
            'content-type': 'application/json; charset=UTF-8' 
        }, 
        method: 'POST', 
        body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log(data);
})();