const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');
code = code.replace(/app\.get\('\*',\s*\(req,\s*res\)\s*=>\s*res\.sendFile\(path\.join\(__dirname,\s*'dist',\s*'index\.html'\)\)\);/g, '');
const listenIndex = code.lastIndexOf('app.listen(PORT');
const finalCode = code.slice(0, listenIndex) + "app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));\n\n" + code.slice(listenIndex);
fs.writeFileSync('server.js', finalCode);
