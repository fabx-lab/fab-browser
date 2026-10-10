import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
for(const dir of ['src','electron','ui','bridge']) for(const file of await fs.readdir(dir)) if(/\.(mjs|cjs|js)$/.test(file)) execFileSync(process.execPath,['--check',`${dir}/${file}`]);
await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist');
for(const item of ['src','electron','ui','package.json','pnpm-lock.yaml','README.md','UPSTREAM.md','LICENSE','vendor','bridge','scripts','test','build','pnpm-workspace.yaml','.github']) await fs.cp(item,`dist/${item}`,{recursive:true});
console.log('Validated desktop source staged in dist/. Install frozen dependencies there before electron launch. No signed installer is produced.');
