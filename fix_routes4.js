const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const endParts = [
  "app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));\n",
  "app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));",
  "app.listen(PORT,async()=>{\n  log('✅ Ready on port '+PORT);\n  const l=await db('get','leads','','order=created_at.asc');log('📋 Leads: '+l.length);\n  const s=await getSession();log('🔐 Session: '+(s?'LOADED ✅':'NOT SET ❌'));\n  const ai=await getAIKey();log('🤖 AI: '+(ai?ai.type+' READY ✅':'NOT SET ❌'));\n});"
];

// Clean all instances of the catch all
code = code.replace(/app\.get\('\*',\s*\(req,\s*res\)\s*=>\s*res\.sendFile\(path\.join\(__dirname,\s*'dist',\s*'index\.html'\)\)\);/g, '');

// Clean the listen block
const listenMatch = code.match(/app\.listen\(PORT[\s\S]*\}\);/);
if (listenMatch) {
    code = code.replace(listenMatch[0], '');
}

fs.writeFileSync('server.js', code.trim() + "\n\n" + endParts[1] + "\n\n" + endParts[2] + "\n");
console.log("Forced layout");
