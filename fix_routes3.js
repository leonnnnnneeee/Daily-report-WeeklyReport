const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// The issue is app.get('*') might be embedded differently. Let's find it.
const catchAllIndex = code.indexOf("app.get('*'");
if (catchAllIndex !== -1) {
   const endOfLine = code.indexOf('\n', catchAllIndex);
   const catchAllLine = code.substring(catchAllIndex, endOfLine + 1);
   
   // Remove it from where it is
   code = code.substring(0, catchAllIndex) + code.substring(endOfLine + 1);
   
   // Put it at the end before app.listen
   const listenIndex = code.lastIndexOf('app.listen(PORT');
   const finalCode = code.slice(0, listenIndex) + "app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));\n\n" + code.slice(listenIndex);
   fs.writeFileSync('server.js', finalCode);
   console.log("Found and moved.");
} else {
   console.log("Could not find app.get('*'");
}
