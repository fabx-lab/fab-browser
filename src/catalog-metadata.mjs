import {extractTitle,extractMeta,IMAGE_FILES,IMAGE_MAX_BYTES,MANIFEST_PATH,ICON_FILE,ICON_MAX_BYTES} from './site-metadata.mjs';
import {classify,declaredCategory} from './category.mjs';
export async function catalogMetadata(release,content){const {value}=await content.manifest(release),files=new Map(value.files.map(f=>[f.name,f]));
 const read=async(name,max)=>files.has(name)&&files.get(name).size<=max?(await content.file(release,name)).bytes:null;
 const home=await read('index.html',2*1024*1024),title=home&&extractTitle(home)||release.title;let declaration=null;
 const manifest=await read(MANIFEST_PATH,50*1024);if(manifest)try{declaration=JSON.parse(Buffer.from(manifest).toString());}catch{}
 const declared=declaredCategory(declaration),guessed=classify(title,home||new Uint8Array());const result={title,category:declared||guessed.category,categorySource:declared?'declared':'inferred',categoryWhy:guessed.why,description:typeof declaration?.description==='string'?declaration.description.slice(0,500):''};
 // Name, short description and icon as the FAB gateway publishes them, read from verified bytes.
 const meta=home?extractMeta(home):{description:'',localized:{}};Object.assign(result,{name:title,summary:meta.description,localized:meta.localized,version:release.version});
 const icon=await read(ICON_FILE,ICON_MAX_BYTES);if(icon)result.icon=`data:image/png;base64,${Buffer.from(icon).toString('base64')}`;
 for(const kind of ['logo','cover'])for(const name of IMAGE_FILES[kind]){const bytes=await read(name,IMAGE_MAX_BYTES);if(bytes){result[kind]=`data:image/${name.endsWith('.png')?'png':'jpeg'};base64,${Buffer.from(bytes).toString('base64')}`;break;}}
 return result;
}
