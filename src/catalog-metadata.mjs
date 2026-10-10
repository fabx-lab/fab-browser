import {extractTitle,IMAGE_FILES,IMAGE_MAX_BYTES,MANIFEST_PATH} from './site-metadata.mjs';
import {classify,declaredCategory} from './category.mjs';
export async function catalogMetadata(release,content){const {value}=await content.manifest(release),files=new Map(value.files.map(f=>[f.name,f]));
 const read=async(name,max)=>files.has(name)&&files.get(name).size<=max?(await content.file(release,name)).bytes:null;
 const home=await read('index.html',256*1024),title=home&&extractTitle(home)||release.title;let declaration=null;
 const manifest=await read(MANIFEST_PATH,50*1024);if(manifest)try{declaration=JSON.parse(Buffer.from(manifest).toString());}catch{}
 const declared=declaredCategory(declaration),guessed=classify(title,home||new Uint8Array());const result={title,category:declared||guessed.category,categorySource:declared?'declared':'inferred',categoryWhy:guessed.why,description:typeof declaration?.description==='string'?declaration.description.slice(0,500):''};
 for(const kind of ['logo','cover'])for(const name of IMAGE_FILES[kind]){const bytes=await read(name,IMAGE_MAX_BYTES);if(bytes){result[kind]=`data:image/${name.endsWith('.png')?'png':'jpeg'};base64,${Buffer.from(bytes).toString('base64')}`;break;}}
 return result;
}
