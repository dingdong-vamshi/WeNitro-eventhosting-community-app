import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const app = process.cwd();
const admin = fs.realpathSync(path.resolve(app, '../wenitro-admin-'));
const controls = [];
const tags = new Set(['Button','button','Pressable','TouchableOpacity','TextInput','input','textarea','select','Switch','Checkbox','DropdownMenuItem','Link','a']);
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir,e.name)] : []);
}
for (const [workspace, root, sources] of [['app',app,[path.join(app,'App.tsx'),...files(path.join(app,'src'))]],['admin',admin,files(path.join(admin,'src'))]]) {
  for (const file of sources) {
    const source = fs.readFileSync(file,'utf8');
    const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast);
        if (tags.has(tag)) {
          const attrs = node.attributes.properties;
          const names = attrs.map(p => p.name?.getText(ast));
          const parent = node.parent;
          const label = ts.isJsxElement(parent) ? parent.children.filter(ts.isJsxText).map(n => n.text.trim()).filter(Boolean).join(' ').slice(0,120) : '';
          const handlers = attrs.filter(p => /^on[A-Z]/.test(p.name?.getText(ast) || '')).map(p => p.name.getText(ast));
          const wrapped = ts.isJsxElement(parent) && ts.isJsxElement(parent.parent) ? parent.parent.openingElement.tagName.getText(ast) : '';
          const needsReview = ['Button','button','Pressable','TouchableOpacity'].includes(tag) && !handlers.length && !names.some(n=>['disabled','asChild','type','href'].includes(n)) && !attrs.some(ts.isJsxSpreadAttribute) && !/Trigger|Close|Item|Label/.test(wrapped);
          controls.push({workspace,file:path.relative(root,file),line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,tag,label,handlers,attributes:names.filter(Boolean),wrapper:wrapped,needsReview,verification:'source-inventory-only; not a production-pass claim'});
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
  }
}
fs.mkdirSync('qa-evidence/chat005-polish',{recursive:true});
fs.writeFileSync('qa-evidence/chat005-polish/control-inventory.json',JSON.stringify({generatedAt:new Date().toISOString(),scope:'Source control declarations including reusable and conditional controls; not unique live buttons',controls},null,2));
console.log(JSON.stringify({declarations:controls.length,candidates:controls.filter(c=>c.needsReview)},null,2));
