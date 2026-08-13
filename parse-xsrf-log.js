const fs = require('fs');
const path = 'c:\\Users\\dmull\\AppData\\Roaming\\Code\\User\\workspaceStorage\\9a5a9ce374af184ee5f8bab9d6f52c5c\\GitHub.copilot-chat\\chat-session-resources\\d44da41a-1398-44cc-9fde-7b2272dce85a\\call_k3XtjbAj1v7a93rQMP6Nrw8k__vscode-1786466356723\\content.txt';
const data = fs.readFileSync(path, 'utf8');
const arr = JSON.parse(data);
const xsrf = arr.filter(entry => entry.type === 'response' && entry.setCookie && entry.setCookie.toLowerCase().includes('xsrf-token'));
console.log('FOUND', xsrf.length);
for (const entry of xsrf) {
  console.log(JSON.stringify(entry, null, 2));
}
