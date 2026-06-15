const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// remove existing instances of the catchall
code = code.replace(/app\.get\('\*'.*?\n/g, '');
code = code.replace(/app\.get\("\*".*?\n/g, '');

const listenMarker = 'app.listen(PORT';
const listenIndex = code.lastIndexOf(listenMarker);

if (listenIndex !== -1) {
    const finalCode = code.slice(0, listenIndex) + "app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));\n\n" + code.slice(listenIndex);
    fs.writeFileSync('server.js', finalCode);
    console.log("Fixed");
} else {
    console.log("Not found");
}
